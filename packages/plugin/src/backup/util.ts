import { CnDeserializePostHandler, CnPersistOptions, CnStateDeserializer, CnStateSerializer } from './types';

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

export const isObject = (v: unknown) => {
  return typeof v === 'object' && v !== null;
};

export const getStateConverter = (cnPersist: boolean | CnPersistOptions, stateKey: string) => {
  // TODO cnPersist 为布尔值且为 true 时，需要对 state 整体持久化，另外，这个判断应该放到初始化阶段
  if (!isObject(cnPersist)) {
    return undefined;
  }
  const stateConverters_ = (cnPersist as CnPersistOptions).stateConverters;
  if (!stateConverters_) {
    return undefined;
  }
  return stateConverters_[stateKey];
};

const DEFAULT_STATE_SERIALIZER: CnStateSerializer = (newValue: unknown) => (newValue ? JSON.stringify(newValue) : '');

export const getStateSerializer = (cnPersist: boolean | CnPersistOptions, stateKey: string): CnStateSerializer => {
  const stateConverter_ = getStateConverter(cnPersist, stateKey);
  if (!stateConverter_) {
    return DEFAULT_STATE_SERIALIZER;
  }
  return stateConverter_.serialize ?? DEFAULT_STATE_SERIALIZER;
};

const DEFAULT_STATE_DESERIALIZER: CnStateDeserializer = (persistedValue: string | null) =>
  persistedValue ? JSON.parse(persistedValue) : null;

export const getStateDeserializer = (cnPersist: boolean | CnPersistOptions, stateKey: string): CnStateDeserializer => {
  const stateConverter_ = getStateConverter(cnPersist, stateKey);
  if (!stateConverter_) {
    return DEFAULT_STATE_DESERIALIZER;
  }
  return stateConverter_.deserialize ?? DEFAULT_STATE_DESERIALIZER;
};

export const getDeserializePostHandler = (
  cnPersist: boolean | CnPersistOptions,
  stateKey: string,
): CnDeserializePostHandler | undefined => {
  const stateConverter_ = getStateConverter(cnPersist, stateKey);
  if (!stateConverter_) {
    return undefined;
  }
  return stateConverter_.deserializePostHandler;
};