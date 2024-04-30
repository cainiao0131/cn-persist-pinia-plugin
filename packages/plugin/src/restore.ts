import { getPersistHashKey } from './util';
import { CnStatePersistContext } from './types';

// 恢复 string 类型的持久化数据
export const restoreString = (stringValue: string, statePersistContext: CnStatePersistContext) => {
  const {
    stateKey,
    statePersistOptions: { deserialize },
    storePersistContext: { storeState },
  } = statePersistContext;
  const value_ = deserialize!(stringValue);
  if (value_ != null) {
    storeState[stateKey] = value_;
  }
};

// 恢复 hash 类型的持久化数据
export const restoreHash = (
  stringValue: string,
  {
    stateKey,
    persistKey,
    statePersistOptions: { deserialize, deserializePostHandler },
    storePersistContext: { storage, storeState },
  }: CnStatePersistContext,
) => {
  const hashValue: Record<string, unknown> = {};
  const hashKeys: Array<string> = JSON.parse(stringValue);
  hashKeys.forEach(hashKey => {
    const persistValue = storage.getItem(getPersistHashKey(persistKey, hashKey));
    if (persistValue != null) {
      const value_ = deserialize!(persistValue);
      if (value_ != null) {
        hashValue[hashKey] = value_;
      }
    }
  });
  storeState[stateKey] = deserializePostHandler!(hashValue);
};
