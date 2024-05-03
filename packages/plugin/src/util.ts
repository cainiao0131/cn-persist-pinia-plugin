import { toRaw } from 'vue';
import { StateTree } from 'pinia';
import {
  CnDeserializePostHandler,
  CnKeyFilter,
  CnPersistFactoryOptions,
  CnPersistOptions,
  CnPersistStates,
  CnStateDeserializer,
  CnStatePersistContext,
  CnStatePersistOptions,
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

/**
 * 见：{@link CnStatePersistOptions.excludes}
 */
const getMixedExcludes = (
  includes?: CnKeyFilter<unknown>,
  excludes?: CnKeyFilter<unknown>,
): { finalExcludes?: CnKeyFilter<unknown> | undefined; finalIncludes?: CnKeyFilter<unknown> | undefined } => {
  if (!includes && !excludes) {
    // includes 与 excludes 都不存在
    return {};
  }
  if (includes && excludes) {
    // includes 与 excludes 都存在，includes 减去 excludes 得到新的 includes
    return { finalIncludes: truncate(includes, excludes) as CnKeyFilter<unknown> };
  }
  // includes 与 excludes 仅存在一个
  return { finalIncludes: includes, finalExcludes: excludes };
};

const getSerialize = (statePersistOptions: CnStatePersistOptions<unknown>) => {
  const { serialize = DEFAULT_STATE_SERIALIZER, includes, excludes } = statePersistOptions;
  const { finalExcludes, finalIncludes } = getMixedExcludes(includes, excludes);
  if (!finalExcludes && !finalIncludes) {
    return serialize;
  }
  if (finalExcludes) {
    return (newValue: unknown) => {
      return serialize(truncate(newValue, finalExcludes));
    };
  }
  return (newValue: unknown) => {
    return serialize(retain(newValue, finalIncludes!));
  };
};

export const produceStatePersistContext = (
  stateKey: string,
  persistKey: string,
  statePersistOptions: CnStatePersistOptions<unknown>,
  mixedPersistOptions: CnPersistOptions<StateTree>,
  storePersistContext: CnStorePersistContext,
): CnStatePersistContext<unknown> | null => {
  try {
    const {
      policy = 'STRING',
      deserialize = DEFAULT_STATE_DESERIALIZER,
      deserializePostHandler = DEFAULT_DESERIALIZE_POST_HANDLER,
    } = statePersistOptions;
    return {
      stateKey,
      persistKey,
      statePersistOptions: {
        policy,
        serialize: getSerialize(statePersistOptions),
        deserialize,
        deserializePostHandler,
      },
      storePersistContext,
    };
  } catch (e) {
    if (mixedPersistOptions.debug) {
      console.error('[cn-persist-pinia-plugin]', e);
    }
    return null;
  }
};

/**
 * 剔除对象 origin 中的在 excludes 中存在的字段，
 * 见：{@link CnStatePersistOptions.excludes}
 */
export const truncate = (origin: unknown, excludes: CnKeyFilter<Record<string, unknown>>): unknown => {
  if (!isObject(origin)) {
    return origin;
  }
  const copyObject: Record<string, unknown> = { ...(origin as Record<string, unknown>) };
  truncateObject(copyObject, excludes);
  return copyObject;
};

/**
 * 根据 excludes 删除 object 中的对应字段
 * object 的第一层字段的删除与修改是在源对象上进行的，会直接修改 object 对象，调用者需自行浅拷贝
 * 第二层及以上的字段会进行浅拷贝后再删除或修改，因此不会影响原子对象
 */
const truncateObject = (object: Record<string, unknown>, excludes: CnKeyFilter<Record<string, unknown>>) => {
  for (const [key, subExcludes] of Object.entries(excludes)) {
    if (subExcludes === true) {
      delete object[key];
    } else if (isObject(subExcludes)) {
      const subObject = object[key];
      if (isObject(subObject)) {
        const newSubObject = { ...(subObject as Record<string, unknown>) };
        object[key] = newSubObject;
        truncateObject(newSubObject, subExcludes as CnKeyFilter<Record<string, unknown>>);
      }
    }
  }
};

/**
 * 保留对象 origin 中的在 includes 中存在的字段，其它丢弃，
 * 见：{@link CnStatePersistOptions.excludes}
 */
export const retain = (origin: unknown, includes: CnKeyFilter<Record<string, unknown>>): unknown => {
  if (!isObject(origin)) {
    return origin;
  }
  return retainObject(origin as Record<string, unknown>, includes);
};

const retainObject = (
  data: Record<string, unknown>,
  includes: CnKeyFilter<Record<string, unknown>>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, subIncludes] of Object.entries(includes)) {
    if (subIncludes === true) {
      result[key] = data[key];
    } else if (isObject(subIncludes)) {
      const subObject = data[key];
      if (isObject(subObject)) {
        result[key] = retainObject(
          subObject as Record<string, unknown>,
          subIncludes as CnKeyFilter<Record<string, unknown>>,
        );
      }
    }
  }
  return result;
};
