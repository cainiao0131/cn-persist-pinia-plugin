export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export interface CnPersistOptions {
  /**
   * 持久化全局防抖延迟，单位为毫秒
   * 也就是说，所有的持久化操作的间隔不会小于这个间隔时间，避免频繁硬盘 I/O
   */
  globalDebounce?: number;
};

export type CnStateSerializer = (newValue: unknown) => string | null;
export type CnStateDeserializer = (persistedValue: string) => unknown | null;
export type CnDeserializePostHandler = (newValue: unknown) => unknown | null;
export interface CnStateConverter {
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
};

export type CnPersistType = 'STRING' | 'HASH' | 'HASH_RESET';

export type CnPersistEvent = {
  type: CnPersistType;
  newValue: unknown;
  stateSerializer: CnStateSerializer;
};

declare module 'pinia' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S extends StateTree, Store> {
    cnPersist?: {
      stateConverters: Record<string, CnStateConverter>;
    };
  }
}
