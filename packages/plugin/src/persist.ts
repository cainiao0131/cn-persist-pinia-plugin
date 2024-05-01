import type { CnPersistEvent, CnPersistEventType, CnStatePersistContext } from './types';
import { debounce, getPersistHashKey } from './util';

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
function persist(statePersistContext: CnStatePersistContext) {
  Object.entries(persistBuffer).forEach(([persistKey, cnPersistEvent]) => {
    switch (cnPersistEvent.type) {
      case 'STRING':
        persistString(persistKey, cnPersistEvent, statePersistContext);
        break;
      case 'HASH':
        persistHash(persistKey, cnPersistEvent, statePersistContext);
        break;
      case 'HASH_RESET':
        persistHashReset(persistKey, cnPersistEvent, statePersistContext);
        break;
      default:
        break;
    }
  });
  persistBuffer = {};
}

/**
 * 防抖持久化器的工厂
 * 使用工厂模式，以便可以自定义全局防抖延迟
 * globalDebounce 小于等于 0 时，禁用防抖
 */
function produceDebouncedPersister(globalDebounce: number) {
  if (globalDebounce <= 0) {
    return persist;
  }
  return debounce(persist, globalDebounce);
}

/**
 * 调用已经设置了延迟时间的防抖持久化方法，默认延迟半秒
 */
let debouncedPersist = produceDebouncedPersister(500);

/**
 * 字符串类型的持久化逻辑
 *
 * @param persistKey 持久化 key，即 storage 的 key
 * @param cnPersistEvent 持久化事件，封装了：持久化类型、持久化数据，以及序列化器
 */
function persistString(
  persistKey: string,
  { stateSerializer, newValue }: CnPersistEvent,
  { storePersistContext: { storage } }: CnStatePersistContext,
) {
  const persistValue = stateSerializer(newValue);
  if (persistValue == null) {
    return;
  }
  storage.setItem(persistKey, persistValue);
}

/**
 * hash 类型的 Entry 持久化逻辑，即对 Record 类型的 state 的一个 Entry 进行持久化
 *
 * @param persistKey 持久化 key，即 storage 的 key
 * @param cnPersistEvent 持久化事件，封装了：持久化类型、Entry 的 Value，以及序列化器（针对单个 Entry 的 Value）
 */
function persistHash(
  persistKey: string,
  { stateSerializer, newValue }: CnPersistEvent,
  { storePersistContext: { storage } }: CnStatePersistContext,
) {
  const hashValue: Record<string, unknown> = newValue as Record<string, unknown>;
  const hashKeysString = storage.getItem(persistKey);
  const hashKeySet = hashKeysString ? new Set(JSON.parse(hashKeysString)) : new Set();
  Object.entries(hashValue).forEach(([hashKey, value]) => {
    const persistValue = stateSerializer(value);
    if (persistValue != null) {
      storage.setItem(getPersistHashKey(persistKey, hashKey), persistValue);
      hashKeySet.add(hashKey);
    }
  });
  storage.setItem(persistKey, JSON.stringify(Array.from(hashKeySet)));
}

/**
 * hash 类型的整体持久化逻辑，对 Record 类型的 state 的所有 Entry 逐个进行持久化
 * 主要用于在分布式情况下，例如其它客户端删除了一些 Entry，而这个删除操作难以在本地触发对 Entry 的删除
 * 因此通过重新构建整个 Record 的方式，清理垃圾 Entry
 *
 * @param persistKey 持久化 key，即 storage 的 key
 * @param cnPersistEvent 持久化事件，封装了：持久化类型、整个 Record 的值，以及序列化器（针对单个 Entry 的 Value）
 */
function persistHashReset(
  persistKey: string,
  { stateSerializer, newValue }: CnPersistEvent,
  { storePersistContext: { storage } }: CnStatePersistContext,
) {
  const hashValue: Record<string, unknown> = newValue as Record<string, unknown>;
  const oldHashKeysString = storage.getItem(persistKey);
  // 待删除的旧 Entry
  const oldHashKeySetToDelete: Set<string> = oldHashKeysString ? new Set(JSON.parse(oldHashKeysString)) : new Set();
  const hashKeySet = new Set();
  Object.entries(hashValue).forEach(([hashKey, value]) => {
    const persistValue = stateSerializer(value);
    if (persistValue != null) {
      storage.setItem(getPersistHashKey(persistKey, hashKey), persistValue);
      hashKeySet.add(hashKey);
      if (oldHashKeySetToDelete.has(hashKey)) {
        oldHashKeySetToDelete.delete(hashKey);
      }
    }
  });
  oldHashKeySetToDelete.forEach(oldHashKeyToDelete => {
    storage.removeItem(getPersistHashKey(persistKey, oldHashKeyToDelete));
  });
  storage.setItem(persistKey, JSON.stringify(Array.from(hashKeySet)));
}

/**
 * 触发持久化事件
 * 将持久化类型、持久化数据，以及序列化器封装为事件，并进行缓冲
 * 然后调用防抖持久化方法
 * 序列化与持久化，在防抖后执行
 */
export function emitPersistEvent(
  type: CnPersistEventType,
  newValue: unknown,
  statePersistContext: CnStatePersistContext,
) {
  const {
    persistKey,
    statePersistOptions: { serialize },
  } = statePersistContext;
  persistBuffer[persistKey] = { type, newValue, stateSerializer: serialize! };
  debouncedPersist(statePersistContext);
}

/**
 * 自定义全局延迟时间
 */
export function setGlobalDebounce(globalDebounce: number) {
  debouncedPersist = produceDebouncedPersister(globalDebounce);
}

/**
 * Action 持久化器的工厂
 * 根据持久化类型，生产 Action 持久化器
 */
export function produceListenerPersister(
  type: CnPersistEventType,
  statePersistContext: CnStatePersistContext,
): (args: Array<unknown>) => void {
  const { persistKey } = statePersistContext;

  console.log('');
  console.log('produceListenerPersister >>> type =', type);

  switch (type) {
    case 'HASH':
      console.log('produceListenerPersister >>> case HASH type =', type);

      return args => {
        console.log('');
        console.log('HASH >>> args[0] =', JSON.stringify(args[0]));
        console.log('HASH >>> args[1] =', JSON.stringify(args[1]));

        const oldEvent = persistBuffer[persistKey];
        if (oldEvent) {
          const oldHashValue: Record<string, unknown> = oldEvent.newValue as Record<string, unknown>;
          if (!oldHashValue) {
            throw new Error('oldHashValue cannot be null here');
          }
          oldHashValue[args[1] as string] = args[0];
          debouncedPersist(statePersistContext);
        } else {
          emitPersistEvent('HASH', { [args[1] as string]: args[0] }, statePersistContext);
        }
      };
    default:
      console.log('produceListenerPersister >>> default type =', type);

      return args => {
        console.log('');
        console.log('STRING >>> args[0] =', JSON.stringify(args[0]));

        emitPersistEvent(type, args[0], statePersistContext);
      };
  }
}
