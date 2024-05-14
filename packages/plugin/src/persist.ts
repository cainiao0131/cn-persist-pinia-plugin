import { PiniaCustomStateProperties, StateTree, StoreOnActionListener } from 'pinia';
import {
  CnPersistEvent,
  CnPersistEventType,
  CnStateSerializer,
  CnListenerPersist,
  StorageLike,
  StateKeyType,
  StateLevelPersist,
} from './types';
import { getPersistHashKey, debounce } from './util';
import { getItem } from './restore';

export let setItem: (storage: StorageLike, key: string, value: string) => void;
export const setSetItem = (debug: boolean) => {
  setItem = (storage: StorageLike, key: string, value: string) => {
    try {
      storage.setItem(key, value);
    } catch (e) {
      if (debug) {
        console.error(`[cn-persist-pinia-plugin] StorageLike.setItem('${key}', '${value}')`, e);
      }
    }
  };
};

let debouncedConsumPersistEvent: () => void;
/**
 * 自定义全局延迟时间
 */
export const setGlobalDebounce = (globalDebounce: number) => {
  debouncedConsumPersistEvent = produceDebouncedConsumPersistEvent(globalDebounce);
};
/**
 * 防抖持久化器的工厂
 * 使用工厂模式，以便可以自定义全局防抖延迟
 * globalDebounce 小于等于 0 时，禁用防抖
 */
const produceDebouncedConsumPersistEvent = (globalDebounce: number) => {
  if (globalDebounce <= 0) {
    return consumPersistEvent;
  }
  return debounce(consumPersistEvent, globalDebounce);
};

/**
 * 对持久化操作进行防抖，整体防抖，而不是为每个模块或字段防抖
 * 即在用户的每次操作的粒度上进行防抖
 * 这样可以避免启动太多定时器，也可以降低硬盘 I/O 的频率
 *
 * persistBuffer 缓冲区，临时存储在防抖期间积攒的需要持久化的数据
 * 即防抖后，消费者的消费操作的时间间隔不会超过防抖延迟，且延迟还会续杯
 * 等价于消费者速度慢了，缓冲区解决消费者与生产者速度不匹配问题
 * persistBuffer 的 Key 为持久化 Key，对于同一个 Key，只需要持久化最后的值即可
 */
let persistBuffer: Record<string, CnPersistEvent> = {};

/**
 * 持久化器，持久化逻辑的实现
 */
const consumPersistEvent = () => {
  Object.entries(persistBuffer).forEach(([persistKey, cnPersistEvent]) => {
    switch (cnPersistEvent.type) {
      case 'STRING':
        persistString(persistKey, cnPersistEvent);
        break;
      case 'HASH':
        persistHash(persistKey, cnPersistEvent);
        break;
      case 'HASH_RESET':
        persistHashReset(persistKey, cnPersistEvent);
        break;
      default:
        break;
    }
  });

  persistBuffer = {};
};

/**
 * 字符串类型的持久化逻辑
 *
 * @param persistKey 持久化 key，即 storage 的 key
 * @param cnPersistEvent 持久化事件，封装了：持久化类型、持久化数据，以及序列化器
 */
const persistString = (persistKey: string, { storage, newValue, serialize }: CnPersistEvent) => {
  const persistValue = serialize(newValue);
  if (persistValue == null) {
    /**
     * 给用户一个机会在运行时判断是否持久化，自定义 serialize 返回 null 则不持久化
     * 例如用户发现需要持久化的值没有变化时可选择不持久化
     */
    return;
  }
  setItem(storage, persistKey, persistValue);
};

/**
 * hash 类型的 Entry 持久化逻辑，即对 Record 类型的 state 的一个 Entry 进行持久化
 * TODO 考虑去掉 hashKeySet 的持久化
 * TODO 在恢复数据时遍历 storage 的 Key 并通过前缀来判断那些 Hash Key 属于同一个 Hash Object
 * TODO 这样可以减小运行时开销，而恢复数据只在刷新页面时才会执行，因此开销增加一点没有关系
 *
 * @param persistKey 持久化 key，即 storage 的 key
 * @param cnPersistEvent 持久化事件，封装了：持久化类型、Entry 的 Value，以及序列化器（针对单个 Entry 的 Value）
 */
const persistHash = (persistKey: string, { storage, newValue, serialize }: CnPersistEvent) => {
  const newHashObject: Record<string, unknown> = newValue as Record<string, unknown>;
  const oldHashKeysString = getItem(storage, persistKey);
  const hashKeySet = oldHashKeysString ? new Set(JSON.parse(oldHashKeysString)) : new Set();
  Object.entries(newHashObject).forEach(([hashKey, newHashValue]) => {
    if (typeof newHashValue !== 'function') {
      const persistValue = serialize(newHashValue);
      if (persistValue != null) {
        setItem(storage, getPersistHashKey(persistKey, hashKey), persistValue);
        hashKeySet.add(hashKey);
      }
    }
  });
  setItem(storage, persistKey, JSON.stringify(Array.from(hashKeySet)));
};

/**
 * hash 类型的整体持久化逻辑，对 Record 类型的 state 的所有 Entry 逐个进行持久化
 * 主要用于在分布式情况下，例如其它客户端删除了一些 Entry，而这个删除操作难以在本地触发对 Entry 的删除
 * 因此通过重新构建整个 Record 的方式，清理垃圾 Entry
 * TODO 考虑去掉 hashKeySet 的持久化，详见 persistHash
 * TODO 为了在 REHASH 时知道要删除哪些 Key，在 restore 时要同时为 HASH 持久化策略的 state 维护 keys
 *
 * @param persistKey 持久化 key，即 storage 的 key
 * @param cnPersistEvent 持久化事件，封装了：持久化类型、整个 Record 的值，以及序列化器（针对单个 Entry 的 Value）
 */
const persistHashReset = (persistKey: string, { storage, newValue, serialize }: CnPersistEvent) => {
  const hashValue: Record<string, unknown> = newValue as Record<string, unknown>;
  const oldHashKeysString = getItem(storage, persistKey);
  // 待删除的旧 Entry
  const oldHashKeySetToDelete: Set<string> = oldHashKeysString ? new Set(JSON.parse(oldHashKeysString)) : new Set();
  const hashKeySet = new Set();
  Object.entries(hashValue).forEach(([hashKey, value]) => {
    if (typeof value !== 'function') {
      const persistValue = serialize(value);
      if (persistValue != null) {
        setItem(storage, getPersistHashKey(persistKey, hashKey), persistValue);
        hashKeySet.add(hashKey);
        if (oldHashKeySetToDelete.has(hashKey)) {
          oldHashKeySetToDelete.delete(hashKey);
        }
      }
    }
  });
  oldHashKeySetToDelete.forEach(oldHashKeyToDelete => {
    storage.removeItem(getPersistHashKey(persistKey, oldHashKeyToDelete));
  });
  setItem(storage, persistKey, JSON.stringify(Array.from(hashKeySet)));
};

/**
 * 触发持久化事件
 * 将持久化类型、持久化数据，以及序列化器封装为事件，并进行缓冲
 * 然后调用防抖持久化方法
 * 序列化与持久化，在防抖后执行
 */
export const emitPersistEvent = (
  type: CnPersistEventType,
  storage: StorageLike,
  persistKey: string,
  newValue: unknown,
  serialize: CnStateSerializer,
) => {
  persistBuffer[persistKey] = { type, storage, newValue, serialize };
  debouncedConsumPersistEvent();
};

export const emitPersistEventForHash = (hashKey: string, oldEvent: CnPersistEvent, newValue?: unknown) => {
  (oldEvent.newValue as Record<string, unknown>)[hashKey] = newValue;
  debouncedConsumPersistEvent();
};

export const produceHashLevelPersist = (
  storage: StorageLike,
  persistKey: string,
  serialize: CnStateSerializer,
): ((args: Array<unknown>) => void) => {
  return args => {
    const oldEvent = persistBuffer[persistKey];
    if (oldEvent) {
      emitPersistEventForHash(args[1] as string, oldEvent, args[0]);
    } else {
      emitPersistEvent('HASH', storage, persistKey, { [args[1] as string]: args[0] }, serialize);
    }
  };
};

export const produceStateLevelPersist = (
  type: CnPersistEventType,
  storage: StorageLike,
  persistKey: string,
  serialize: CnStateSerializer,
): StateLevelPersist => {
  return stateValue => {
    emitPersistEvent(type, storage, persistKey, stateValue, serialize);
  };
};

export const produceActionListener = (
  actionNamePersisterRegistry: Map<string, CnListenerPersist>,
): StoreOnActionListener<string, StateTree, unknown, unknown> => {
  if (actionNamePersisterRegistry.size < 1) {
    return () => {};
  }
  return listenerContext => {
    listenerContext.after(() => {
      // Action 成功后执行持久化
      const actionPersister = actionNamePersisterRegistry.get(listenerContext.name);
      if (actionPersister) {
        const { args } = listenerContext;
        actionPersister([args[1], args[0]]);
      }
    });
  };
};

export const produceStorePersist = (
  stateLevelPersistRegistry: Map<StateKeyType, StateLevelPersist>,
  storeState: StateTree & PiniaCustomStateProperties<StateTree>,
) => {
  if (stateLevelPersistRegistry.size < 1) {
    return () => {};
  }
  return () => {
    for (const [stateKey, stateLevelPersist] of stateLevelPersistRegistry.entries()) {
      stateLevelPersist(storeState[stateKey]);
    }
  };
};
