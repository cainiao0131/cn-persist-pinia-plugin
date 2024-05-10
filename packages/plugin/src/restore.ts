import { getPersistHashKey } from './util';
import { CnStatePersistContext } from './types';

export const restoreFromStoreValue = (storageValue: string, statePersistContext: CnStatePersistContext<unknown>) => {
  const {
    statePersistOptions: { policy },
  } = statePersistContext;
  switch (policy) {
    case 'STRING':
      restoreString(storageValue, statePersistContext);
      break;
    case 'HASH':
      restoreHash(storageValue, statePersistContext);
      break;
  }
};

// 恢复 string 类型的持久化数据
export const restoreString = (stringValue: string, statePersistContext: CnStatePersistContext<unknown>) => {
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
    storage,
    statePersistOptions: { deserialize, deserializePostHandler },
    storePersistContext: { storeState },
  }: CnStatePersistContext<unknown>,
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
