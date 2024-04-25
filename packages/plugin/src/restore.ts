import { PiniaPluginContext } from 'pinia';
import { getDeserializePostHandler, getPersistHashKey, getStateDeserializer } from './util';

// 恢复 string 类型的持久化数据
export const restoreString = (stringValue: string, stateKey: string, context: PiniaPluginContext) => {
  const value_ = getStateDeserializer(context.options, stateKey)(stringValue);
  if (value_ != null) {
    context.store[stateKey] = value_;
  }
};

// 恢复 hash 类型的持久化数据
export const restoreHash = (stringValue: string, persistKey: string, stateKey: string, context: PiniaPluginContext) => {
  const hashValue: Record<string, unknown> = {};
  const { options } = context;
  const stateDeserializer = getStateDeserializer(options, stateKey);
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
  const deserializePostHandler = getDeserializePostHandler(options, stateKey);
  context.store[stateKey] = deserializePostHandler ? deserializePostHandler(hashValue) : hashValue;
};
