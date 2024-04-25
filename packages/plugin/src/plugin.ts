import { PiniaPluginContext } from 'pinia';
import { CnPersistType, CnPersistOptions } from './types';
import { getPersistKey, getStateSerializer } from './util';
import { emitPersistEvent, produceActionPersister, setGlobalDebounce } from './persist';
import { restoreHash, restoreString } from './restore';

/**
 * Action 名称前缀：设置某个 state 的值
 * Action 的参数为 state 的值
 */
const SET_PREFIX = 'setAndPersist';
/**
 * Action 名称前缀：设置某个 Record 类型的 state 中的某个 Entry 的 key value
 * 每个 Entry 独立持久化
 * Action 的参数为 Record 的 key 和 value
 */
const HSET_PREFIX = `h${SET_PREFIX}`;
/**
 * Action 名称前缀：设置某个 Record 类型的 state 的值
 * 与 HSET_PREFIX 的持久化方式相同，即每个 Entry 独立持久化
 * Action 的参数为 state 的值，即一个 Record 类型的值
 */
const HRESET_PREFIX = `hre${SET_PREFIX}`;
/**
 * 不同的 Action 前缀对应的持久化类型
 */
const actionPrefixToPersistType: Record<string, CnPersistType> = {
  [SET_PREFIX]: 'STRING',
  [HSET_PREFIX]: 'HASH',
  [HRESET_PREFIX]: 'HASH_RESET',
};

const getStateKey = (actionName: string, prefix: string) => {
  const stateKey_ = actionName.substring(prefix.length);
  return stateKey_ ? stateKey_.charAt(0).toLowerCase() + stateKey_.substring(1) : '';
};

declare type ActionListenerPersisterRegistry = Record<string, (args: Array<unknown>) => void>;

function cnPersistentPiniaPlugin_(context: PiniaPluginContext) {
  /**
   * 这里会为每个 store 执行一次
   */
  const { store, options } = context;
  const storeId = store.$id;
  /**
   * Action 持久化器注册中心，将每个需要持久化的 Action 注册其中
   * 在初始化时提前判断取值，尽可能减少运行时计算
   */
  const actionListenerPersisterRegistry: ActionListenerPersisterRegistry = {};
  /**
   * 为了避免重复加载持计划数据，采用 restoredKeys 记录一下已经恢复的持久化 key
   * 因为同一个 state 可能存在多个持久化 Action，但只需被恢复一次
   * 例如一个 Record 类型的 state 可能有一个 hash set 和一个 hash reset 的 Action
   */
  const restoredKeys: Set<string> = new Set();
  Object.keys(options.actions).forEach(actionName => {
    let actionPrefix = '';
    if (actionName.startsWith(SET_PREFIX)) {
      actionPrefix = SET_PREFIX;
    } else if (actionName.startsWith(HSET_PREFIX)) {
      actionPrefix = HSET_PREFIX;
    } else if (actionName.startsWith(HRESET_PREFIX)) {
      actionPrefix = HRESET_PREFIX;
    }
    if (actionPrefix) {
      const stateKey = getStateKey(actionName, actionPrefix);
      const persistKey = getPersistKey(storeId, stateKey);
      const stateSerializer = getStateSerializer(options, stateKey);
      const persistType = actionPrefixToPersistType[actionPrefix];

      // 注册在 Action 监听器中使用的持久化器
      actionListenerPersisterRegistry[actionName] = produceActionPersister(persistKey, persistType, stateSerializer);

      const stringValue = localStorage.getItem(persistKey);
      if (!stringValue) {
        // 如果持久化数据不存在，则检查 state 是否有初始值，如果有则对初始值进行持久化
        const initValue = context.store[stateKey];
        if (initValue) {
          emitPersistEvent(persistKey, persistType == 'STRING' ? 'STRING' : 'HASH_RESET', initValue, stateSerializer);
        }
      } else if (!restoredKeys.has(persistKey)) {
        /**
         * 已经存在持久化数据，且还没有被恢复过，则恢复持久化数据
         * 这种情况下以持久化数据为准，即如果 state 有初始值，则初始值会被持久化数据覆盖
         */
        switch (persistType) {
          case 'STRING':
            restoreString(stringValue, stateKey, context);
            break;
          case 'HASH_RESET':
          case 'HASH':
            restoreHash(stringValue, persistKey, stateKey, context);
            break;
        }
        restoredKeys.add(persistKey);
      }
    }
  });

  if (Object.keys(actionListenerPersisterRegistry).length > 0) {
    /**
     * 通过 $onAction 注册 Action 监听器来持久化 state
     * 必须为任何需要持久化的 state 定义一个 action，只有通过调用这个 action 来设置 state 才能对其持久化
     * 哪些 Action 会持久化以及如何持久化，由 Action 的命名约定确定，而无需通过配置来指定 Action
     * 这样做的好处是，在任何调用这个 Action 的地方都能见名知意，看到方法名就知道会持久化，且知道如何持久化的
     *
     * 之所以不用 $subscribe 来监听变化，是因为如果 state 为 Record 类型，在设置这个 Record 的某个 key 的值时
     * 在通过 $subscribe 注册的监听器中无法知道改变的是哪个 state
     */
    store.$onAction(listenerContext => {
      listenerContext.after(() => {
        /**
         * 注册 action 成功执行后的监听器，在这里进行持久化
         * 运行时从 actionListenerPersisterRegistry 拿到 Action 对应的持久化器直接调用，匹配所需时间复杂度为 O(1)
         * 所有匹配与取值，尽可能提前到初始化阶段，将运行时计算量降至最低
         */
        const actionPersister = actionListenerPersisterRegistry[listenerContext.name];
        if (actionPersister) {
          actionPersister(listenerContext.args);
        }
      });
    });
  }

  return {};
}

export const createCnPersistPiniaPlugin = (plugingOptions?: CnPersistOptions) => {
  if (plugingOptions) {
    const globalDebounce = plugingOptions.globalDebounce;
    if (globalDebounce && globalDebounce > 0) {
      setGlobalDebounce(globalDebounce);
    }
  }
  return cnPersistentPiniaPlugin_;
};
