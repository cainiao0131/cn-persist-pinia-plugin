import { isRef, toRaw, watch } from 'vue';
import { PiniaPluginContext } from 'pinia';
import {
  CnPersistFactoryOptions,
  CnStatePersistContext,
  CnStatePersistOptions,
  CnListenerPersist,
  StateKeyType,
  StateLevelPersist,
} from './types';
import {
  emitPersistEvent,
  produceActionListener,
  produceHashLevelPersist,
  produceStateLevelPersist,
  produceStorePersist,
  setGlobalDebounce,
  setSetItem,
} from './persist';
import { getPersistKey, mixOptions, produceStatePersistContext, produceStorePersistContext } from './util';
import { getItem, produceStoreHydrate, restoreState, setGetItem } from './restore';

export const createCnPersistPiniaPlugin = (factoryOptions: CnPersistFactoryOptions = {}) => {
  const { auto = false, globalDebounce = 500 } = factoryOptions;

  // 设置全局防抖延迟
  setGlobalDebounce(globalDebounce);

  return (context: PiniaPluginContext) => {
    /**
     * 这里会为每个 store 执行一次
     */
    const {
      options: { cnPersist = auto, actions },
      store,
      pinia,
    } = context;

    if (!cnPersist) {
      return;
    }

    const storeId = store.$id;

    // HMR handling, ignores stores created as "hot" stores
    /* c8 ignore start */
    if (!(storeId in pinia.state.value)) {
      // @ts-expect-error `_s is a stripped @internal`
      const original_store = pinia._s.get(storeId.replace('__hot:', ''));
      if (original_store) {
        Promise.resolve().then(() => original_store.$persist());
      }
      return;
    }
    /* c8 ignore stop */

    const storeState = toRaw(store.$state);

    // 创建 store 上下文
    const mixedPersistOptions = mixOptions(cnPersist, factoryOptions);
    const storePersistContext = produceStorePersistContext(factoryOptions, storeId, storeState, mixedPersistOptions);

    // produceStorePersistContext 中抛异常时会返回 null，此时会忽略当前 store，继续配置别的 store
    if (!storePersistContext) {
      return;
    }

    const { key, states, debug, beforeRestore, afterRestore } = storePersistContext;
    setSetItem(debug);
    setGetItem(debug);

    /**
     * 为了方便用户配置 states 时能利用 typescript 自动根据 state 补全 state key，
     * states 的类型拥有所有 state 的 key，
     * 这里过滤掉那些没有值的 key
     * TODO 验证这里是否有必要
     */
    const persistStateKeys: Array<string> = [];
    Object.entries(states).forEach(entry => {
      if (entry[1]) {
        persistStateKeys.push(entry[0]);
      }
    });

    if (persistStateKeys.length < 1) {
      return;
    }

    const stateLevelPersistRegistry: Map<StateKeyType, StateLevelPersist> = new Map();
    const statePersistContextMap: Map<StateKeyType, CnStatePersistContext<unknown>> = new Map();
    const actionNamePersisterRegistry: Map<string, CnListenerPersist> = new Map();
    // 初始化时要恢复的 state
    const initRestoreStates: Array<CnStatePersistContext<unknown>> = [];

    persistStateKeys.forEach(stateKey => {
      const statePersistOptions: CnStatePersistOptions<unknown> = states[stateKey]!;
      // state 的持久化 key，即 storage 使用的 key
      const persistKey = getPersistKey(key, stateKey);

      const statePersistContext: CnStatePersistContext<unknown> | null = produceStatePersistContext(
        stateKey,
        persistKey,
        statePersistOptions,
        mixedPersistOptions,
        storePersistContext,
      );
      // produceStatePersistContext 中抛异常时会返回 null，此时会忽略当前 state，继续配置别的 state
      if (!statePersistContext) {
        return;
      }

      const {
        storage,
        hashActionName,
        statePersistOptions: { policy, serialize },
      } = statePersistContext;

      let stateLevelPersist: StateLevelPersist;
      if (policy == 'HASH') {
        if (!actions[hashActionName]) {
          throw new Error(
            `state [${stateKey}] is set to HASH persist policy, it must have an Action with name '${hashActionName}'`,
          );
        }
        // 对于 HASH 策略的 state，基于 Action 实现 hashKey 粒度的持久化
        actionNamePersisterRegistry.set(hashActionName, produceHashLevelPersist(storage, persistKey, serialize!));
        stateLevelPersist = produceStateLevelPersist('HASH_RESET', storage, persistKey, serialize!);
        watch(() => {
          return store.$state[stateKey];
        }, stateLevelPersist);
      } else {
        stateLevelPersist = produceStateLevelPersist('STRING', storage, persistKey, serialize!);
        watch(
          () => {
            return store.$state[stateKey];
          },
          stateLevelPersist,
          { deep: true },
        );
      }
      stateLevelPersistRegistry.set(stateKey, stateLevelPersist);
      statePersistContextMap.set(stateKey, statePersistContext);

      /**
       * 为当前 store 的每个 state 执行初始化操作
       * 有持久化数据则用持久化数据设置 state 的值，这种情况持久化值会覆盖 state 的初始值
       * 如果没有持久化数据，而 state 有初始值，则为 state 的初始值进行持久化
       */
      const storageValue = getItem(storage, persistKey);
      if (!storageValue) {
        // 如果持久化数据不存在，则检查 state 是否有初始值，如果有则对初始值进行持久化
        const stateValue = storeState[stateKey];
        const initValue = isRef(stateValue) ? stateValue.value : stateValue;
        if (initValue) {
          emitPersistEvent(policy == 'STRING' ? 'STRING' : 'HASH_RESET', storage, persistKey, initValue, serialize!);
        }
      } else {
        initRestoreStates.push(statePersistContext);
      }
    });

    if (actionNamePersisterRegistry.size > 0) {
      store.$onAction(produceActionListener(actionNamePersisterRegistry));
    }

    /**
     * 对 store 整体持久化
     * 无论哪种策略或实现方式，stateKeyPersisterRegistry 中都会注册 state 级别的持久化器
     * 因此数据的整体持久化基于 stateKeyPersisterRegistry 即可
     * 如果注册中心为空，则注册一个空函数，保证用户调用 $persist 的代码不会报错
     */
    store.$persist = produceStorePersist(stateLevelPersistRegistry, store.$state);

    /**
     * 恢复初始化时 storage 中已经存在的持久化数据
     * 这种情况下以持久化数据为准，即如果 state 有初始值，则初始值会被持久化数据覆盖
     */
    if (initRestoreStates.length > 0) {
      beforeRestore?.(context);
      initRestoreStates.forEach(statePersistContext => {
        restoreState(statePersistContext);
      });
      afterRestore?.(context);
    }

    /**
     * 对 store 整体恢复
     */
    store.$hydrate = produceStoreHydrate(statePersistContextMap, context, beforeRestore, afterRestore);

    return {};
  };
};
