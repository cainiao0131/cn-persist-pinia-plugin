import { toRaw } from 'vue';
import { StateTree, Store, _ActionsTree, _GettersTree, _Method } from 'pinia';
import { CnStatePersistContext, CnStorePersistContext, ListenerPersister, StateKeyType } from './types';
import { capitalize, isObject } from './util';
import { emitPersistEvent, produceListenerPersister } from './persist';
import { restoreHash, restoreString } from './restore';

const HSET_PREFIX = 'hsetAndPersist';
const getHsetActionName = (stateKey: string) => {
  return `${HSET_PREFIX}${capitalize(stateKey)}`;
};

export const registerPersister = (
  mutationPersisterRegistry: Map<StateKeyType, ListenerPersister>,
  mutationObjectPersisterRegistry: Map<object, ListenerPersister>,
  mutationObjectPersisterUtil: Map<StateKeyType, object>,
  actionPersisterRegistry: Map<string, ListenerPersister>,
  actions: _ActionsTree,
  statePersistContext: CnStatePersistContext<unknown>,
) => {
  const {
    stateKey,
    statePersistOptions: { policy },
    storePersistContext: { storeState },
  } = statePersistContext;

  if (policy == 'HASH') {
    const stateObject = storeState[stateKey];
    const hsetActionName = getHsetActionName(stateKey);
    const hsetAction: _Method | undefined = actions[hsetActionName];
    if (!hsetAction) {
      /**
       * 对于 HASH 策略的 state，如果不存在符合规范的 Action
       * 则尝试用 mutation 实现，只是对象中没有初始值的字段无法触发响应式系统，从而无法持久化
       * 对于有初始值的确定字段的对象，可以基于 mutation 而不通过 Action 实现
       * 但对于 Record 这种 key 本来就是运行时动态产生的对象，通常需要基于 Action 实现
       *
       * 在 mutationPersisterRegistry 中，HASH 类型的持久化是以 target 对象作为 key 的
       * 这是因为当局部修改对象类型的 state 的某个字段的值时，pinia 的 mutation 中没有提供信息可以以 O(1) 获取到修改的 state key
       */
      if (stateObject) {
        throw new Error(
          `state [${stateKey}] is set to HASH persist policy and has no Action with prefix '${HSET_PREFIX}', it must have initial value`,
        );
      }
      const targetObj = toRaw(stateObject);
      if (!isObject(targetObj)) {
        throw new Error(
          `state [${stateKey}] is set to HASH persist policy and has no Action with prefix '${HSET_PREFIX}', it must be object`,
        );
      }
      mutationObjectPersisterRegistry.set(targetObj, produceListenerPersister('HASH', statePersistContext));
      mutationObjectPersisterUtil.set(stateKey, targetObj);
    } else {
      // 对于 HASH 策略的 state，如果存在符合命名规范的 Action，则基于 Action 实现持久化
      actionPersisterRegistry.set(hsetActionName, produceListenerPersister('HASH', statePersistContext));
    }
    mutationPersisterRegistry.set(stateKey, produceListenerPersister('HASH_RESET', statePersistContext));
  } else {
    mutationPersisterRegistry.set(stateKey, produceListenerPersister('STRING', statePersistContext));
  }
};

export const initPersistOrRestore = (statePersistContext: CnStatePersistContext<unknown>) => {
  const {
    stateKey,
    persistKey,
    statePersistOptions: { policy },
    storePersistContext: { storage, storeState },
  } = statePersistContext;
  const stringValue = storage.getItem(persistKey);
  if (!stringValue) {
    // 如果持久化数据不存在，则检查 state 是否有初始值，如果有则对初始值进行持久化
    const initValue = storeState[stateKey];
    if (initValue) {
      emitPersistEvent(policy == 'STRING' ? 'STRING' : 'HASH_RESET', initValue, statePersistContext);
    }
  } else {
    /**
     * 已经存在持久化数据，且还没有被恢复过，则恢复持久化数据
     * 这种情况下以持久化数据为准，即如果 state 有初始值，则初始值会被持久化数据覆盖
     */
    switch (policy) {
      case 'STRING':
        restoreString(stringValue, statePersistContext);
        break;
      case 'HASH':
        restoreHash(stringValue, statePersistContext);
        break;
    }
  }
};

export const registerListener = (
  store: Store<string, StateTree, _GettersTree<StateTree>, _ActionsTree>,
  mutationPersisterRegistry: Map<StateKeyType, ListenerPersister>,
  mutationObjectPersisterRegistry: Map<object, ListenerPersister>,
  mutationObjectPersisterUtil: Map<StateKeyType, object>,
  actionPersisterRegistry: Map<string, ListenerPersister>,
  { storeState }: CnStorePersistContext,
) => {
  // 如果 mutation 持久化器注册中心不为空，则注册 mutation 监听器
  if (mutationPersisterRegistry.size > 0) {
    store.$subscribe(mutation => {
      const events = mutation.events;
      if (!Array.isArray(events)) {
        const stateOrObjectKey = events.key;
        const newValue = events.newValue;
        const eventTarget = events.target;
        if (eventTarget === toRaw(storeState)) {
          /**
           * 由于对象类型的 state 的 key 可能与 state key 重名
           * 因此仅当 events.target === toRaw(storeState) 时才能确定本次 mutation 是对 state 的直接修改
           */
          const mutationPersister: ListenerPersister | undefined = mutationPersisterRegistry.get(stateOrObjectKey);
          if (mutationPersister) {
            mutationPersister([newValue]);
          }
          /**
           * oldTarget 存在则表示为 HASH 策略注册了 mutation 实现
           * 因为 mutation 实现的 HASH 策略是基于对象类型的 key 的，当设置新对象时，需要用新对象重新注册一下持久化器
           */
          const oldTarget = mutationObjectPersisterUtil.get(stateOrObjectKey);
          if (oldTarget) {
            if (!newValue) {
              throw new Error(
                `state [${stateOrObjectKey}] is set to HASH persist policy and has no Action with prefix '${HSET_PREFIX}', it must not be set to null or undefined`,
              );
            }
            if (oldTarget !== newValue) {
              mutationObjectPersisterRegistry.set(newValue, mutationObjectPersisterRegistry.get(oldTarget)!);
              mutationObjectPersisterUtil.set(stateOrObjectKey, newValue);
            }
          }
        } else {
          const mutationPersister: ListenerPersister | undefined = mutationObjectPersisterRegistry.get(eventTarget);
          if (mutationPersister) {
            mutationPersister([newValue, stateOrObjectKey]);
          }
        }
      }
    });
  }

  // 如果 Action 持久化器注册中心不为空，则注册 Action 监听器
  if (actionPersisterRegistry.size > 0) {
    store.$onAction(listenerContext => {
      listenerContext.after(() => {
        // action 成功后执行持久化
        const actionPersister = actionPersisterRegistry.get(listenerContext.name);
        if (actionPersister) {
          const { args } = listenerContext;
          actionPersister([args[1], args[0]]);
        }
      });
    });
  }
};
