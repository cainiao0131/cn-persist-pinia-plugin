import { toRaw, isRef, type Ref } from 'vue';
import { StateTree, Store, _ActionsTree, _GettersTree } from 'pinia';
import { CnStatePersistContext, CnStorePersistContext, ListenerPersister, StateKeyType } from './types';
import { capitalize, isObject } from './util';
import { emitPersistEvent, produceHashLevelPersist, produceStateLevelPersist } from './persist';
import { restoreFromStoreValue } from './restore';

const HSET_PREFIX = 'hsetAndPersist';
const getHsetActionName = (stateKey: string) => {
  return `${HSET_PREFIX}${capitalize(stateKey)}`;
};

const abstractRegisterPersister = (
  /**
   * 用于注册 state key 粒度的持久化器，
   * 对于 option 配置的 pinia，为 state key；对于 setup 配置的 pinia，为 Ref 对象
   */
  stateRegisterKey: StateKeyType | Ref<unknown>,
  /**
   * 用于注册 Hash Key 粒度的持久化器，即 state 的值是对象类型，对 state 对象的某个字段进行持久化，
   * 对于 option 配置的 pinia，为 state value；对于 setup 配置的 pinia，为 Ref 对象的 value 属性指向的对象
   */
  hashTargetObject: unknown,
  stateKeyPersisterRegistry: Map<StateKeyType | Ref<unknown>, ListenerPersister>,
  hashTargetObjectPersisterRegistry: Map<unknown, ListenerPersister>,
  hashTargetObjectPersisterUtil: Map<StateKeyType | Ref<unknown>, unknown>,
  actionNamePersisterRegistry: Map<string, ListenerPersister>,
  actions: _ActionsTree,
  statePersistContext: CnStatePersistContext<unknown>,
) => {
  const {
    stateKey,
    storage,
    persistKey,
    statePersistOptions: { policy, serialize },
  } = statePersistContext;

  if (policy == 'HASH') {
    const hsetActionName = getHsetActionName(stateKey);
    const hashPersister = produceHashLevelPersist(storage, persistKey, serialize!);
    if (actions[hsetActionName]) {
      // 对于 HASH 策略的 state，如果存在符合命名规范的 Action，则基于 Action 实现持久化
      actionNamePersisterRegistry.set(hsetActionName, hashPersister);
    } else {
      /**
       * 如果用户没有为被配置为 HASH 策略的 state 定义符合命名规范的 Action
       * 则尝试用 mutation 实现，此时对象中没有初始值的字段无法触发响应式系统，从而无法持久化
       * 对于 Record 这种 key 通常在运行时动态产生的对象，通常需要基于 Action 实现
       *
       * 在 hashTargetObjectPersisterRegistry 中，持久化是以 target 对象作为 key 的
       * 因为当局部修改对象类型的 state 的某个字段的值时，pinia 的 mutation 中没有提供信息可以以 O(1) 获取到修改的 state key
       */
      if (hashTargetObject) {
        throw new Error(
          `state [${stateKey}] is set to HASH persist policy and has no Action with prefix '${HSET_PREFIX}', it must have initial value`,
        );
      }
      const rawHashTargetObject = toRaw(hashTargetObject);
      if (!isObject(rawHashTargetObject)) {
        throw new Error(
          `state [${stateKey}] is set to HASH persist policy and has no Action with prefix '${HSET_PREFIX}', it must be object`,
        );
      }
      hashTargetObjectPersisterRegistry.set(rawHashTargetObject, hashPersister);
      hashTargetObjectPersisterUtil.set(stateRegisterKey, rawHashTargetObject);
    }
    stateKeyPersisterRegistry.set(
      stateRegisterKey,
      produceStateLevelPersist('HASH_RESET', storage, persistKey, serialize!),
    );
  } else {
    stateKeyPersisterRegistry.set(
      stateRegisterKey,
      produceStateLevelPersist('STRING', storage, persistKey, serialize!),
    );
  }
};

export const registerPersister = (
  stateKeyPersisterRegistry: Map<StateKeyType | Ref<unknown>, ListenerPersister>,
  hashTargetObjectPersisterRegistry: Map<unknown, ListenerPersister>,
  hashTargetObjectPersisterUtil: Map<StateKeyType | Ref<unknown>, unknown>,
  actionNamePersisterRegistry: Map<string, ListenerPersister>,
  actions: _ActionsTree,
  statePersistContext: CnStatePersistContext<unknown>,
) => {
  const { stateKey, isSetup, stateValue } = statePersistContext;
  if (isSetup) {
    // 用户使用 setup 语法配置的 pinia
    abstractRegisterPersister(
      stateValue as Ref<unknown>,
      (stateValue as Ref<unknown>).value,
      stateKeyPersisterRegistry,
      hashTargetObjectPersisterRegistry,
      hashTargetObjectPersisterUtil,
      actionNamePersisterRegistry,
      actions,
      statePersistContext,
    );
  } else {
    // 用户使用 option 语法配置的 pinia
    abstractRegisterPersister(
      stateKey,
      stateValue,
      stateKeyPersisterRegistry,
      hashTargetObjectPersisterRegistry,
      hashTargetObjectPersisterUtil,
      actionNamePersisterRegistry,
      actions,
      statePersistContext,
    );
  }
};

export const initPersistOrRestore = (statePersistContext: CnStatePersistContext<unknown>) => {
  const {
    storage,
    stateKey,
    persistKey,
    statePersistOptions: { policy, serialize },
    storePersistContext: { storeState },
  } = statePersistContext;
  const storageValue = storage.getItem(persistKey);
  if (!storageValue) {
    // 如果持久化数据不存在，则检查 state 是否有初始值，如果有则对初始值进行持久化
    const initValue = storeState[stateKey];
    if (initValue) {
      emitPersistEvent(policy == 'STRING' ? 'STRING' : 'HASH_RESET', storage, persistKey, initValue, serialize!);
    }
  } else {
    /**
     * 已经存在持久化数据，且还没有被恢复过，则恢复持久化数据
     * 这种情况下以持久化数据为准，即如果 state 有初始值，则初始值会被持久化数据覆盖
     */
    restoreFromStoreValue(storageValue, statePersistContext);
  }
};

const persistBySateRegisterKeyAndResetHashTargetObject = (
  newValue: unknown,
  stateRegisterKey: StateKeyType | Ref<unknown>,
  stateKeyPersisterRegistry: Map<StateKeyType | Ref<unknown>, ListenerPersister>,
  hashTargetObjectPersisterRegistry: Map<unknown, ListenerPersister>,
  hashTargetObjectPersisterUtil: Map<StateKeyType | Ref<unknown>, unknown>,
) => {
  const mutationPersister: ListenerPersister | undefined = stateKeyPersisterRegistry.get(stateRegisterKey);
  if (mutationPersister) {
    mutationPersister([newValue]);
  }
  /**
   * oldTarget 存在则表示为 HASH 策略注册了 mutation 实现
   * 因为 mutation 实现的 HASH 策略是基于对象类型的 key 的，当设置新对象时，需用新对象重新注册一下持久化器
   */
  const oldHashTargetObject = hashTargetObjectPersisterUtil.get(stateRegisterKey);
  if (oldHashTargetObject) {
    if (!newValue) {
      throw new Error(
        `state [${String(stateRegisterKey)}] is set to HASH persist policy and has no Action with prefix '${HSET_PREFIX}', it must not be set to null or undefined`,
      );
    }
    if (oldHashTargetObject !== newValue) {
      hashTargetObjectPersisterRegistry.set(newValue, hashTargetObjectPersisterRegistry.get(oldHashTargetObject)!);
      hashTargetObjectPersisterUtil.set(stateRegisterKey, newValue);
    }
  }
};

export const registerListener = (
  store: Store<string, StateTree, _GettersTree<StateTree>, _ActionsTree>,
  stateKeyPersisterRegistry: Map<StateKeyType | Ref<unknown>, ListenerPersister>,
  hashTargetObjectPersisterRegistry: Map<unknown, ListenerPersister>,
  hashTargetObjectPersisterUtil: Map<StateKeyType | Ref<unknown>, unknown>,
  actionNamePersisterRegistry: Map<string, ListenerPersister>,
  { storeState }: CnStorePersistContext,
) => {
  // 如果 mutation 持久化器注册中心不为空，则注册 mutation 监听器
  if (stateKeyPersisterRegistry.size > 0) {
    store.$subscribe(mutation => {
      const events = mutation.events;
      if (!Array.isArray(events)) {
        const stateOrHashKey = events.key;
        const newValue = events.newValue;
        const eventTarget = events.target;
        if (eventTarget === toRaw(storeState)) {
          /**
           * events.target === toRaw(storeState) 表示本次 mutation 是对 state 的直接修改，
           * 这种情况表示：当前的 store 是通过 option 方式配置的 pinia，且是 state key 粒度的修改，
           * 此时 stateOrHashKey 为 state key，
           * 由于对象类型的 state 的 hash key 可能与 state key 重名，因此不能用 key 的比较来判断
           */
          persistBySateRegisterKeyAndResetHashTargetObject(
            newValue,
            stateOrHashKey,
            stateKeyPersisterRegistry,
            hashTargetObjectPersisterRegistry,
            hashTargetObjectPersisterUtil,
          );
        } else if (stateOrHashKey === 'value' && isRef(eventTarget)) {
          // 用户使用 setup 语法配置的 pinia，且是 state key 粒度的修改
          persistBySateRegisterKeyAndResetHashTargetObject(
            newValue,
            eventTarget,
            stateKeyPersisterRegistry,
            hashTargetObjectPersisterRegistry,
            hashTargetObjectPersisterUtil,
          );
        } else {
          // 用户使用 option 或 setup 语法配置的 pinia，hash key 粒度的修改
          const mutationPersister: ListenerPersister | undefined = hashTargetObjectPersisterRegistry.get(eventTarget);
          if (mutationPersister) {
            mutationPersister([newValue, stateOrHashKey]);
          }
        }
      }
    });
  }

  // 如果 Action 持久化器注册中心不为空，则注册 Action 监听器
  if (actionNamePersisterRegistry.size > 0) {
    store.$onAction(listenerContext => {
      listenerContext.after(() => {
        // action 成功后执行持久化
        const actionPersister = actionNamePersisterRegistry.get(listenerContext.name);
        if (actionPersister) {
          const { args } = listenerContext;
          actionPersister([args[1], args[0]]);
        }
      });
    });
  }
};
