import { DefineStoreOptionsInPlugin, StateTree } from 'pinia';
import { CnDeserializePostHandler, CnStateDeserializer, CnStateSerializer } from './types';

// 防抖
export const debounce = (fn: (arg?: unknown) => void, timeout: number) => {
  let timer: NodeJS.Timeout;
  return (arg?: unknown) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(arg);
    }, timeout);
  };
};

export const getPersistKey = (storeId: string, stateName: string) => {
  return `cn-${storeId}-${stateName}`;
};

export const getPersistHashKey = (persistKey: string, hashKey: string) => {
  return `${persistKey}-${hashKey}`;
};

export const getStateConverter = (
  options: DefineStoreOptionsInPlugin<string, StateTree, unknown, unknown>,
  stateKey: string,
) => {
  const stateConverters_ = options.cnPersist?.stateConverters;
  if (!stateConverters_) {
    return undefined;
  }
  return stateConverters_[stateKey];
};

const DEFAULT_STATE_SERIALIZER: CnStateSerializer = (newValue: unknown) => (newValue ? JSON.stringify(newValue) : '');

export const getStateSerializer = (
  options: DefineStoreOptionsInPlugin<string, StateTree, unknown, unknown>,
  stateKey: string,
): CnStateSerializer => {
  const stateConverter_ = getStateConverter(options, stateKey);
  if (!stateConverter_) {
    return DEFAULT_STATE_SERIALIZER;
  }
  return stateConverter_.serialize ?? DEFAULT_STATE_SERIALIZER;
};

const DEFAULT_STATE_DESERIALIZER: CnStateDeserializer = (persistedValue: string | null) =>
  persistedValue ? JSON.parse(persistedValue) : null;

export const getStateDeserializer = (
  options: DefineStoreOptionsInPlugin<string, StateTree, unknown, unknown>,
  stateKey: string,
): CnStateDeserializer => {
  const stateConverter_ = getStateConverter(options, stateKey);
  if (!stateConverter_) {
    return DEFAULT_STATE_DESERIALIZER;
  }
  return stateConverter_.deserialize ?? DEFAULT_STATE_DESERIALIZER;
};

export const getDeserializePostHandler = (
  options: DefineStoreOptionsInPlugin<string, StateTree, unknown, unknown>,
  stateKey: string,
): CnDeserializePostHandler | undefined => {
  const stateConverter_ = getStateConverter(options, stateKey);
  if (!stateConverter_) {
    return undefined;
  }
  return stateConverter_.deserializePostHandler;
};
