import { toRaw } from 'vue';
import { StateTree } from 'pinia';
import {
  CnDeserializePostHandler,
  CnPersistFactoryOptions,
  CnPersistOptions,
  CnPersistStates,
  CnStateDeserializer,
  CnStateSerializer,
  CnStorePersistContext,
  StateKeyType,
} from './types';

export const capitalize = (str: string) => {
  if (str.length < 1) {
    return '';
  }
  if (str.length == 1) {
    return str[0].toUpperCase();
  }
  return str[0].toUpperCase() + str.slice(1);
};

// 防抖
export const debounce = <T>(fn: (arg: T) => void, timeout: number) => {
  let timer: NodeJS.Timeout;
  return (arg: T) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(arg);
    }, timeout);
  };
};

export const getPersistKey = (storeId: string, stateName: StateKeyType): string => {
  return `cn-${storeId}-${String(stateName)}`;
};

export const getPersistHashKey = (persistKey: string, hashKey: string): string => {
  return `${persistKey}-${hashKey}`;
};

export const isObject = (v: unknown) => {
  return typeof v === 'object' && v !== null;
};

export const isBoolean = (v: unknown) => {
  return typeof v === 'boolean';
};

export const getStateConverter = (cnPersist: CnPersistOptions<StateTree>, stateKey: StateKeyType) => {
  const stateConverters_ = cnPersist.states;
  if (!stateConverters_) {
    return undefined;
  }
  return stateConverters_[stateKey];
};

export const DEFAULT_STATE_SERIALIZER: CnStateSerializer = (newValue: unknown) =>
  newValue ? JSON.stringify(newValue) : '';

export const DEFAULT_STATE_DESERIALIZER: CnStateDeserializer = (persistedValue: string | null) =>
  persistedValue ? JSON.parse(persistedValue) : null;

export const DEFAULT_DESERIALIZE_POST_HANDLER: CnDeserializePostHandler = (newValue: unknown) => newValue;

/**
 * 将 store 独立的选项与全局选项合并
 * 全局选项作为缺省值，如果 store 独立的选项存在则使用 store 的，否则使用全局的
 *
 * key 选项的逻辑不同，这里返回的代理对象的 key 永远都是 store 选项的 key
 * 因为全局的 key 的语义是在 store 独立的 key 的基础上进行自定义，而不是 store 独立的 key 的缺省值
 *
 * @param options store 独立的选项
 * @param factoryOptions 全局选项
 * @returns 代理对象，表示合并后的选项
 */
export const mixOptions = (
  options: boolean | CnPersistOptions<StateTree>,
  factoryOptions: CnPersistFactoryOptions,
): CnPersistOptions<StateTree> => {
  options = isObject(options) ? options : Object.create(null);

  return new Proxy(options as object, {
    get(target, key, receiver) {
      if (key === 'key') {
        return Reflect.get(target, key, receiver);
      }

      return Reflect.get(target, key, receiver) || Reflect.get(factoryOptions, key, receiver);
    },
  });
};

const getAllStatesWithEmptyOptions = (storeState: StateTree): CnPersistStates<StateTree> => {
  const result: Partial<CnPersistStates<StateTree>> = {};
  Object.keys(toRaw(storeState)).forEach(key => {
    result[key] = {};
  });
  return result as CnPersistStates<StateTree>;
};

export const produceStorePersistContext = (
  factoryOptions: CnPersistFactoryOptions,
  storeId: string,
  storeState: StateTree,
  mixedPersistOptions: CnPersistOptions<StateTree>,
): CnStorePersistContext | null => {
  try {
    const {
      storage = localStorage,
      key = storeId,
      debug = false,
      states = getAllStatesWithEmptyOptions(storeState),
    } = mixedPersistOptions;

    return {
      storage,
      key: (factoryOptions.key ?? (k => k))(typeof key == 'string' ? key : key(storeId)),
      debug,
      states,
      storeState,
    };
  } catch (e) {
    if (mixedPersistOptions.debug) {
      console.error('[cn-persist-pinia-plugin]', e);
    }
    return null;
  }
};
