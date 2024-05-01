import type { PiniaPluginContext } from 'pinia';
import { getDeserializePostHandler, getPersistHashKey, getStateDeserializer } from './util';
import type { CnPersistOptions } from './types';

// 恢复 string 类型的持久化数据
export function restoreString(
  stringValue: string,
  stateKey: string,
  context: PiniaPluginContext,
  cnPersist: boolean | CnPersistOptions,
) {
  const value_ = getStateDeserializer(cnPersist, stateKey)(stringValue);
  if (value_ != null) {
    context.store[stateKey] = value_;
  }
}

// 恢复 hash 类型的持久化数据
export function restoreHash(
  stringValue: string,
  persistKey: string,
  stateKey: string,
  context: PiniaPluginContext,
  cnPersist: boolean | CnPersistOptions,
) {
  const hashValue: Record<string, unknown> = {};
  const stateDeserializer = getStateDeserializer(cnPersist, stateKey);
  const hashKeys: Array<string> = JSON.parse(stringValue);
  hashKeys.forEach(hashKey => {
    const persistValue = localStorage.getItem(getPersistHashKey(persistKey, hashKey));
    if (persistValue != null) {
      const value_ = stateDeserializer(persistValue);
      if (value_ != null) {
        hashValue[hashKey] = value_;
      }
    }
  });
  const deserializePostHandler = getDeserializePostHandler(cnPersist, stateKey);
  context.store[stateKey] = deserializePostHandler ? deserializePostHandler(hashValue) : hashValue;
}
