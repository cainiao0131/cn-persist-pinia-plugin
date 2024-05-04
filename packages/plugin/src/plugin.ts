import { PiniaPluginContext } from 'pinia';
import {
  CnPersistFactoryOptions,
  CnStatePersistContext,
  CnStatePersistOptions,
  ListenerPersister,
  StateKeyType,
} from './types';
import { setGlobalDebounce } from './persist';
import { getPersistKey, mixOptions, produceStatePersistContext, produceStorePersistContext } from './util';
import { initPersistOrRestore, registerListener, registerPersister } from './init';
import { restoreFromStoreValue } from './restore';

export const createCnPersistPiniaPlugin = (factoryOptions: CnPersistFactoryOptions = {}) => {
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
    const mixedPersistOptions = mixOptions(cnPersist, factoryOptions);
    const storePersistContext = produceStorePersistContext(factoryOptions, storeId, storeState, mixedPersistOptions);

    // produceStorePersistContext 中抛异常时会返回 null，此时会忽略当前 store，继续配置别的 store
    if (!storePersistContext) {
      return;
    }

    const { key, states } = storePersistContext;

    // 持久化器注册中心
    /**
     * 持久化策略为 STRING 和 HASH 的配置都会注册到 stateKeyPersisterRegistry
     *
     * 注册 state key 持久化器，以 state 对象的粒度进行变化监听，
     * 对于持久化策略 STRING，以 state 对象的粒度进行持久化，以 STRING 类型的事件发起持久化；
     * 对于持久化策略 HASH，以 state 对象的字段的粒度进行持久化，以 HASH_RESET 类型的事件发起持久化。
     * 运行时以 state key 为 key 从注册中心获取持久化器，
     * 注册中心由 mutation 监听器使用
     */
    const stateKeyPersisterRegistry: Map<StateKeyType, ListenerPersister> = new Map();
    /**
     * 仅当持久化策略为 HASH，且用户没有配置对应的 Action 时，不得已才会注册 stateObjectPersisterRegistry（不推荐），
     * 推荐为 HASH 持久化策略配置符合命名规范的 Action
     *
     * 注册 state object 持久化器，以 state 对象的字段的粒度进行变化监听与持久化，
     * 运行时以 state 对象（即 mutation 事件的 target 对象）为 key 从注册中心获取持久化器，
     * 注册中心由 mutation 监听器使用
     */
    const stateObjectPersisterRegistry: Map<object, ListenerPersister> = new Map();
    const stateObjectPersisterUtil: Map<StateKeyType, object> = new Map();
    /**
     * 仅当持久化策略为 HASH，且用户配置了对应的 Action 时，才会注册 hasKeyPersisterRegistry（HASH 策略推荐配置方式）
     *
     * 注册 hash key 持久化器，以 state 对象的字段的粒度进行监听与持久化，
     * 运行时以 Action 名称为 key 从注册中心获取持久化器，
     * 目前只能通过监听 Action 才能在运行时以 O(1) 拿到 hash key，因此注册器由 Action 监听器使用
     */
    const hasKeyPersisterRegistry: Map<string, ListenerPersister> = new Map();

    /**
     * 为了方便用户配置 states 时能利用 typescript 自动根据 state 补全 state key，
     * states 的类型拥有所有 state 的 key，
     * 这里过滤掉那些没有值的 key
     */
    const stateOptionsEntries: Array<[string, CnStatePersistOptions<unknown>]> = Object.entries(states).filter(
      entry => {
        return !!entry[1];
      },
    ) as Array<[string, CnStatePersistOptions<unknown>]>;

    const statePersistContexts: Array<CnStatePersistContext<unknown>> = [];

    // 遍历当前 store 中的每个配置了持久化的 state key
    stateOptionsEntries.forEach(([stateKey, statePersistOptions]) => {
      // state 的持久化 key，即 storage 使用的 key
      const persistKey = getPersistKey(key, stateKey);

      // 创建 state 上下文
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

      /**
       * 为当前 store 中的每个配置了持久化的 state，注册持久化器
       * 以便在运行时可以根据 state key 或 target 对象直接从注册中心以 O(1) 获取
       */
      registerPersister(
        stateKeyPersisterRegistry,
        stateObjectPersisterRegistry,
        stateObjectPersisterUtil,
        hasKeyPersisterRegistry,
        actions,
        statePersistContext,
      );

      /**
       * 为当前 store 的每个 state 执行初始化操作
       * 有持久化数据则用持久化数据设置 state 的值，这种情况持久化值会覆盖 state 的初始值
       * 如果没有持久化数据，而 state 有初始值，则为 state 的初始值进行持久化
       */
      initPersistOrRestore(statePersistContext);
      statePersistContexts.push(statePersistContext);
    });

    // 注册 mutation 和 Action 监听器，以触发持久化
    registerListener(
      store,
      stateKeyPersisterRegistry,
      stateObjectPersisterRegistry,
      stateObjectPersisterUtil,
      hasKeyPersisterRegistry,
      storePersistContext,
    );

    /**
     * 对 store 整体持久化
     * 无论哪种策略或实现方式，stateKeyPersisterRegistry 中都会注册 state 级别的持久化器
     * 因此数据的整体持久化基于 stateKeyPersisterRegistry 即可
     * 如果注册中心为空，则注册一个空函数，保证用户调用 $persist 的代码不会报错
     */
    store.$persist =
      stateKeyPersisterRegistry.size > 0
        ? () => {
            stateOptionsEntries.forEach(([stateKey]) => {
              const mutationPersister: ListenerPersister = stateKeyPersisterRegistry.get(stateKey)!;
              mutationPersister([storeState[stateKey]]);
            });
          }
        : () => {};

    /**
     * 对 store 整体恢复
     */
    store.$hydrate =
      statePersistContexts.length > 0
        ? () => {
            statePersistContexts.forEach(statePersistContext => {
              const {
                persistKey,
                storePersistContext: { storage },
              } = statePersistContext;
              const storageValue = storage.getItem(persistKey);
              if (storageValue) {
                restoreFromStoreValue(storageValue, statePersistContext);
              }
            });
          }
        : () => {};

    return {};
  };
};
