import type { StateTree } from 'pinia';

export type StateKeyType = string | number | symbol;

export type ListenerPersister = (args: Array<unknown>) => void;

/**
 * Prettify<T> 用于优化源码文档，即鼠标放上去看到的 TypeScript 类型注释
 * 当定的类型由多个类型用 & 求字段并集后，会导致鼠标查看类型变得困难，用 Prettify<T> 可避免这种问题
 */
type Prettify<T> = { [K in keyof T]: T[K] };

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type CnPersistStates<S extends StateTree> = {
  [K in keyof S]?: CnStatePersistOptions;
};

export interface CnPersistOptions<S extends StateTree> {
  /**
   * Storage key to use.
   * @default $store.id
   */
  key?: string | ((id: string) => string);

  /**
   * Where to store persisted state.
   * @default localStorage
   */
  storage?: StorageLike;

  states?: CnPersistStates<S>;

  /**
   * Logs errors in console when enabled.
   * @default false
   */
  debug?: boolean;
}

export type CnPersistFactoryOptions = Prettify<
  Pick<CnPersistOptions<StateTree>, 'storage' | 'debug'> & {
    /**
     * 持久化全局防抖延迟，单位为毫秒
     * 也就是说，所有的持久化操作的间隔不会小于这个间隔时间，避免频繁硬盘 I/O
     * globalDebounce 小于等于 0 时，禁用防抖
     */
    globalDebounce?: number;
    /**
     * Global key generator, allows pre/postfixing store keys.
     * @default storeKey => storeKey
     */
    key?: (storeKey: string) => string;
    /**
     * 全局配置，自动持久化所有 stores，可以通过在特定 store 中进行配置覆盖此全局配置
     * @default false
     */
    auto?: boolean;
  }
>;

/**
 * store 域的上下文
 */
export interface CnStorePersistContext {
  storage: StorageLike;
  /**
   * 当前 store 的所有持久化数据的 storage key 前缀
   */
  key: string;
  debug: boolean;
  states: CnPersistStates<StateTree>;
  storeState: StateTree;
}
/**
 * state 域的上下文
 */
export interface CnStatePersistContext {
  stateKey: string;
  persistKey: string;
  statePersistOptions: CnStatePersistOptions;
  storePersistContext: CnStorePersistContext;
}

export type CnStateSerializer = (newValue: unknown) => string | null;
export type CnStateDeserializer = (persistedValue: string) => unknown | null;
export type CnDeserializePostHandler = (newValue: unknown) => unknown | null;
export type CnPersistPolicy = 'STRING' | 'HASH';
export interface CnStatePersistOptions {
  policy?: CnPersistPolicy;
  /**
   * 持久化类型，类似 Redis 的字符串类型与哈希类型
   * STRING：
   *     表示直接将 state 的字段名作为持久化 key，将值序列化为 string 进行持久化
   * HASH：
   *     表示 state 字段的类型为 Record，以 Record 的 Entry 的粒度进行持久化
   *     这样做的目的是为了避免每次对 Record 的某个 Entry 的更新都触发对整个 Record 的持久化
   *     为了能够恢复数据，某个 Entry 更新后，除了需要持久化这个 Entry 外
   *     还需要持久化一个 state 字段名作为持久化 key，值为这个 Record 的 key 集合
   *     即便这样，当 Record 非常大时，也比每次持久化整个 Record 开销小，因为还有重新序列化整个 Record 大对象的开销
   *     反过来说，如果 Record 本来就比较小，则用哪种方式都可以，因为都不会造成卡顿
   */
  /**
   * 如果返回 null，则不持久化
   * 这给了一个机会阻止持久化，例如对比新值和旧值，发现值相同时可选择不持久化
   * TODO 传入旧值
   */
  serialize?: CnStateSerializer;
  /**
   * 如果返回 null，则不恢复
   */
  deserialize?: CnStateDeserializer;
  /**
   * 当 state 类型为 Record 类型时，在从持久化恢复时，可能需要对整体进行转换
   * 例如 Entry.value 的对象的一些字段需要从 ID 值转换为指向对应对象的指针
   * 只有在 Record 的所有 Entry 都已经反序列化为对象的情况下，才能获得所有对象的全集
   */
  deserializePostHandler?: CnDeserializePostHandler;
}

/**
 * 持久化事件类型
 */
export type CnPersistEventType = 'STRING' | 'HASH' | 'HASH_RESET';

export interface CnPersistEvent {
  type: CnPersistEventType;
  newValue: unknown;
  stateSerializer: CnStateSerializer;
}

declare module 'pinia' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S extends StateTree, Store> {
    cnPersist?: boolean | CnPersistOptions<S>;
  }
}
