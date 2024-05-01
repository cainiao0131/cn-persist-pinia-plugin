import type { PiniaPluginContext } from 'pinia';
import type {
  CnPersistFactoryOptions,
  CnStatePersistContext,
  CnStatePersistOptions,
  ListenerPersister,
  StateKeyType,
} from './types';
import { setGlobalDebounce } from './persist';
import {
  DEFAULT_DESERIALIZE_POST_HANDLER,
  DEFAULT_STATE_DESERIALIZER,
  DEFAULT_STATE_SERIALIZER,
  getPersistKey,
  mixOptions,
  produceStorePersistContext,
} from './util';
import { initPersistOrRestore, registerListener, registerPersister } from './init';

export function createCnPersistPiniaPlugin(factoryOptions: CnPersistFactoryOptions = {}) {
  const { auto = false, globalDebounce = 500 } = factoryOptions;

  // 根据配置设置全局防抖延迟
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

    const storeState = store.$state;

    // 创建 store 上下文
    const storePersistContext = produceStorePersistContext(
      factoryOptions,
      storeId,
      storeState,
      mixOptions(cnPersist, factoryOptions),
    );

    // produceStorePersistContext 中抛异常时会返回 null，此时会忽略当前 store，继续配置别的 store
    if (!storePersistContext) {
      return;
    }

    const { key, states } = storePersistContext;

    // 持久化器注册中心
    const mutationPersisterRegistry: Map<StateKeyType, ListenerPersister> = new Map();
    const mutationObjectPersisterRegistry: Map<object, ListenerPersister> = new Map();
    const mutationObjectPersisterUtil: Map<StateKeyType, object> = new Map();
    const actionPersisterRegistry: Map<string, ListenerPersister> = new Map();

    /**
     * 为了方便用户配置 states 时能利用 typescript 自动根据 state 补全 state key
     * states 的类型拥有所有 state 的 key
     * 这里过滤掉那些没有值的 key
     */
    const stateOptionsEntries: Array<[string, CnStatePersistOptions]> = Object.entries(states).filter(entry => {
      return !!entry[1];
    }) as Array<[string, CnStatePersistOptions]>;

    // 遍历当前 store 中的每个配置了持久化的 state key
    stateOptionsEntries.forEach(([stateKey, statePersistOptions]) => {
      // state 的持久化 key，即 storage 使用的 key
      const persistKey = getPersistKey(key, stateKey);

      // 创建 state 上下文
      const {
        policy = 'STRING',
        serialize = DEFAULT_STATE_SERIALIZER,
        deserialize = DEFAULT_STATE_DESERIALIZER,
        deserializePostHandler = DEFAULT_DESERIALIZE_POST_HANDLER,
      } = statePersistOptions;
      const statePersistContext: CnStatePersistContext = {
        stateKey,
        persistKey,
        statePersistOptions: {
          policy,
          serialize,
          deserialize,
          deserializePostHandler,
        },
        storePersistContext,
      };

      /**
       * 为当前 store 中的每个配置了持久化的 state，注册持久化器
       * 以便在运行时可以根据 state key 或 target 对象直接从注册中心以 O(1) 获取
       */
      registerPersister(
        mutationPersisterRegistry,
        mutationObjectPersisterRegistry,
        mutationObjectPersisterUtil,
        actionPersisterRegistry,
        actions,
        statePersistContext,
      );

      /**
       * 为当前 store 的每个 state 执行初始化操作
       * 有持久化数据则用持久化数据设置 state 的值，这种情况持久化值会覆盖 state 的初始值
       * 如果没有持久化数据，而 state 有初始值，则为 state 的初始值进行持久化
       */
      initPersistOrRestore(statePersistContext);
    });

    // 注册 mutation 和 Action 监听器，以触发持久化
    registerListener(
      store,
      mutationPersisterRegistry,
      mutationObjectPersisterRegistry,
      mutationObjectPersisterUtil,
      actionPersisterRegistry,
      storePersistContext,
    );

    /**
     * 无论哪种策略或实现方式，mutationPersisterRegistry 中都会注册 state 级别的持久化器
     * 因此数据的整体持久化基于 mutationPersisterRegistry 即可
     * 如果注册中心为空，则注册一个空函数，保证用户调用 $persist 的代码不会报错
     */
    store.$persist =
      mutationPersisterRegistry.size > 0
        ? () => {
            stateOptionsEntries.forEach(([stateKey]) => {
              const mutationPersister: ListenerPersister = mutationPersisterRegistry.get(stateKey)!;
              mutationPersister([storeState[stateKey]]);
            });
          }
        : () => {};

    return {};
  };
}
