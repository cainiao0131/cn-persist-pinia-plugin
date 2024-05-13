import { isRef } from 'vue';
import { CnStatePersistContext } from './types';
import { emitPersistEvent } from './persist';
import { restoreFromStoreValue } from './restore';

export const initPersistOrRestore = (statePersistContext: CnStatePersistContext<unknown>) => {
  const {
    storage,
    stateKey,
    persistKey,
    statePersistOptions: { policy, serialize },
    storePersistContext: { storeState },
  } = statePersistContext;
  const storageValue = storage.getItem(persistKey);
  if (!storageValue) {
    // 如果持久化数据不存在，则检查 state 是否有初始值，如果有则对初始值进行持久化
    const stateValue = storeState[stateKey];
    const initValue = isRef(stateValue) ? stateValue.value : stateValue;
    if (initValue) {
      emitPersistEvent(policy == 'STRING' ? 'STRING' : 'HASH_RESET', storage, persistKey, initValue, serialize!);
    }
  } else {
    /**
     * 已经存在持久化数据，且还没有被恢复过，则恢复持久化数据
     * 这种情况下以持久化数据为准，即如果 state 有初始值，则初始值会被持久化数据覆盖
     */
    restoreFromStoreValue(storageValue, statePersistContext);
  }
};
