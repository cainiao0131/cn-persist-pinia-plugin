import { isRef } from 'vue';
import { getPersistHashKey } from './util';
import { CnStatePersistContext, StateKeyType, StorageLike } from './types';
import { PiniaPluginContext } from 'pinia';

export let getItem: (storage: StorageLike, key: string) => string | null;
export const setGetItem = (debug: boolean) => {
  getItem = (storage: StorageLike, key: string) => {
    try {
      return storage.getItem(key);
    } catch (e) {
      if (debug) {
        console.error(`[cn-persist-pinia-plugin] StorageLike.getItem('${key}')`, e);
      }
    }
    return null;
  };
};

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
    const stateValue = storeState[stateKey];
    if (isRef(stateValue)) {
      stateValue.value = value_;
    } else {
      storeState[stateKey] = value_;
    }
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
    const persistValue = getItem(storage, getPersistHashKey(persistKey, hashKey));
    if (persistValue != null) {
      const value_ = deserialize!(persistValue);
      if (value_ != null) {
        hashValue[hashKey] = value_;
      }
    }
  });
  const stateValue = storeState[stateKey];
  if (isRef(stateValue)) {
    stateValue.value = deserializePostHandler!(hashValue);
  } else {
    storeState[stateKey] = deserializePostHandler!(hashValue);
  }
};

export const produceStoreHydrate = (
  statePersistContextMap: Map<StateKeyType, CnStatePersistContext<unknown>>,
  context: PiniaPluginContext,
  beforeRestore?: (context: PiniaPluginContext) => void,
  afterRestore?: (context: PiniaPluginContext) => void,
) => {
  if (statePersistContextMap.size < 1) {
    return () => {};
  }
  return ({ runHooks = true } = {}) => {
    if (runHooks) {
      beforeRestore?.(context);
    }
    statePersistContextMap.forEach(statePersistContext => {
      const { storage, persistKey } = statePersistContext;
      const storageValue = getItem(storage, persistKey);
      if (storageValue) {
        restoreFromStoreValue(storageValue, statePersistContext);
      }
    });
    if (runHooks) {
      afterRestore?.(context);
    }
  };
};

export const restoreState = (statePersistContext: CnStatePersistContext<unknown>) => {
  const { storage, persistKey } = statePersistContext;
  const storageValue = getItem(storage, persistKey);
  if (storageValue) {
    restoreFromStoreValue(storageValue, statePersistContext);
  }
};
