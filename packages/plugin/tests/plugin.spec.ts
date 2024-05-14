import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { createPinia, defineStore, setActivePinia } from 'pinia';

import { createCnPersistPiniaPlugin } from '../src/plugin';
import { initializeLocalStorage, readLocalStoage } from './utils';
import { getPersistKey } from '../src/util';
import { StorageLike } from '../src';

const STORE_ID = 'mock-store';
const STATE_KEY = 'lorem';
const STATE_VALUE = { name: 'ipsum' };
const PERSIST_KEY = getPersistKey(STORE_ID, STATE_KEY);

beforeEach(() => {
  let state: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn(key => state[key]),
      setItem: vi.fn((key, value) => {
        state[key] = value;
      }),
      removeItem: vi.fn(key => delete state[key]),
      clear: vi.fn(() => {
        state = {};
      }),
    },
  });
});

describe('globalDebounce: 0', () => {
  beforeEach(() => {
    const app = createApp({});
    const pinia = createPinia();
    pinia.use(createCnPersistPiniaPlugin({ globalDebounce: 0 }));
    app.use(pinia);
    setActivePinia(pinia);
  });

  describe('disabled', () => {
    const useStore = defineStore(STORE_ID, {
      state: () => ({ [STATE_KEY]: {} }),
    });

    it('does not persist store', async () => {
      //* arrange
      const store = useStore();

      //* act
      store[STATE_KEY] = STATE_VALUE;
      await nextTick();

      //* assert
      expect(readLocalStoage(PERSIST_KEY)).toBeNull();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('does not rehydrate store', async () => {
      //* arrange
      initializeLocalStorage({ persistKey: PERSIST_KEY, value: STATE_VALUE });

      //* act
      await nextTick();
      const store = useStore();

      //* assert
      expect(store[STATE_KEY]).toEqual({});
      expect(localStorage.getItem).not.toHaveBeenCalled();
    });
  });

  describe('default settings', () => {
    const useStore = defineStore(STORE_ID, {
      state: () => ({ [STATE_KEY]: {} }),
      cnPersist: true,
    });

    it('persists store in localStorage', async () => {
      //* arrange
      const store = useStore();

      //* act
      store[STATE_KEY] = STATE_VALUE;
      await nextTick();

      //* assert
      expect(readLocalStoage(PERSIST_KEY)).toEqual(STATE_VALUE);
      expect(localStorage.setItem).toHaveBeenCalledWith(PERSIST_KEY, JSON.stringify(STATE_VALUE));
    });

    it('rehydrates store from localStorage', async () => {
      //* arrange
      initializeLocalStorage({ persistKey: PERSIST_KEY, value: STATE_VALUE });

      //* act
      await nextTick();
      const store = useStore();

      //* assert
      expect(store[STATE_KEY]).toEqual(STATE_VALUE);
      expect(localStorage.getItem).toHaveBeenCalledWith(PERSIST_KEY);
    });

    describe('setup function syntax', () => {
      const useStore = defineStore(STORE_ID, () => ({ [STATE_KEY]: ref({}) }), {
        cnPersist: true,
      });

      it('persists store in localStorage', async () => {
        //* arrange
        const store = useStore();

        //* act
        store[STATE_KEY] = STATE_VALUE;
        await nextTick();

        //* assert
        expect(readLocalStoage(PERSIST_KEY)).toEqual(STATE_VALUE);
        expect(localStorage.setItem).toHaveBeenCalledWith(PERSIST_KEY, JSON.stringify(STATE_VALUE));
      });

      it('restore manually', async () => {
        //* arrange
        const store = useStore();

        //* act
        localStorage.setItem(PERSIST_KEY, JSON.stringify(STATE_VALUE));
        await nextTick();

        //* assert
        expect(store[STATE_KEY]).toEqual({});

        store.$hydrate();
        await nextTick();

        expect(store[STATE_KEY]).toEqual(STATE_VALUE);
      });

      it('rehydrates store from localStorage', async () => {
        //* arrange
        initializeLocalStorage({ persistKey: PERSIST_KEY, value: STATE_VALUE });

        //* act
        await nextTick();
        const store = useStore();

        //* assert
        expect(store[STATE_KEY]).toEqual(STATE_VALUE);
        expect(localStorage.getItem).toHaveBeenCalledWith(PERSIST_KEY);
      });
    });

    describe('w/ key', () => {
      const CUSTOM_KEY = 'mock';
      const CUSTOM_PERSIST_KEY = getPersistKey(CUSTOM_KEY, STATE_KEY);

      const useStore = defineStore(STORE_ID, {
        state: () => ({ [STATE_KEY]: {} }),
        cnPersist: { key: CUSTOM_KEY },
      });

      it('persists store in localStorage under given key', async () => {
        //* arrange
        const store = useStore();

        //* act
        store[STATE_KEY] = STATE_VALUE;
        await nextTick();

        //* assert
        expect(readLocalStoage(CUSTOM_PERSIST_KEY)).toEqual(STATE_VALUE);
        expect(localStorage.setItem).toHaveBeenCalledWith(CUSTOM_PERSIST_KEY, JSON.stringify(STATE_VALUE));
      });

      it('rehydrates store from localStorage under given key', async () => {
        //* arrange
        initializeLocalStorage({ persistKey: CUSTOM_PERSIST_KEY, value: STATE_VALUE });

        //* act
        await nextTick();
        const store = useStore();

        //* assert
        expect(store[STATE_KEY]).toEqual(STATE_VALUE);
        expect(localStorage.getItem).toHaveBeenCalledWith(CUSTOM_PERSIST_KEY);
      });
    });

    describe('w/ key function', () => {
      const CUSTOM_PERSIST_KEY = getPersistKey(`saved-${STORE_ID}`, STATE_KEY);
      const useStore = defineStore(STORE_ID, {
        state: () => ({ [STATE_KEY]: {} }),
        cnPersist: { key: id => `saved-${id}` },
      });

      it('persists store in localStorage under given function key', async () => {
        //* arrange
        const store = useStore();

        //* act
        store[STATE_KEY] = STATE_VALUE;
        await nextTick();

        //* assert
        expect(readLocalStoage(CUSTOM_PERSIST_KEY)).toEqual(STATE_VALUE);
        expect(localStorage.setItem).toHaveBeenCalledWith(CUSTOM_PERSIST_KEY, JSON.stringify(STATE_VALUE));
      });

      it('rehydrates store from localStorage under given function key', async () => {
        //* arrange
        initializeLocalStorage({ persistKey: CUSTOM_PERSIST_KEY, value: STATE_VALUE });

        //* act
        await nextTick();
        const store = useStore();

        //* assert
        expect(store[STATE_KEY]).toEqual(STATE_VALUE);
        expect(localStorage.getItem).toHaveBeenCalledWith(CUSTOM_PERSIST_KEY);
      });
    });

    describe('w/ includes', () => {
      const useStore = defineStore(STORE_ID, {
        state: () => ({
          [STATE_KEY]: {},
          dolor: {
            sit: '',
            consectetur: {
              adipiscing: '',
            },
          },
        }),
        cnPersist: {
          states: { [STATE_KEY]: {}, dolor: { includes: { consectetur: { adipiscing: true } } } },
        },
      });

      it('persists store includes in localStorage', async () => {
        //* arrange
        const store = useStore();

        //* act
        store[STATE_KEY] = STATE_VALUE;
        store.dolor.sit = 'amet';
        store.dolor.consectetur.adipiscing = 'elit';
        await nextTick();

        //* assert
        expect(readLocalStoage(PERSIST_KEY)).toEqual(STATE_VALUE);
        const dolorPersistKey = getPersistKey(STORE_ID, 'dolor');
        expect(readLocalStoage(dolorPersistKey)).toEqual({ consectetur: { adipiscing: 'elit' } });
        expect(localStorage.setItem).toHaveBeenCalledWith(PERSIST_KEY, JSON.stringify(STATE_VALUE));
        expect(localStorage.setItem).toHaveBeenCalledWith(
          dolorPersistKey,
          JSON.stringify({ consectetur: { adipiscing: 'elit' } }),
        );
      });

      it('rehydrates store includes from localStorage', async () => {
        const dolorPersistKey = getPersistKey(STORE_ID, 'dolor');
        //* arrange
        initializeLocalStorage(
          { persistKey: PERSIST_KEY, value: STATE_VALUE },
          { persistKey: dolorPersistKey, value: { consectetur: { adipiscing: 'elit' } } },
        );

        //* act
        await nextTick();
        const store = useStore();

        //* assert
        expect(store[STATE_KEY]).toEqual(STATE_VALUE);
        expect(store.dolor.consectetur.adipiscing).toEqual('elit');
        expect(localStorage.getItem).toHaveBeenCalledWith(dolorPersistKey);
      });
    });

    describe('w/ storage', () => {
      let stored: Record<string, string>;
      const storage = {
        getItem: vi.fn(key => stored[key]),
        setItem: vi.fn((key, value) => {
          stored[key] = value;
        }),
        removeItem: vi.fn(key => delete stored[key]),
      };

      const useStore = defineStore(STORE_ID, {
        state: () => ({ [STATE_KEY]: {} }),
        cnPersist: { storage },
      });

      it('persists to given storage', async () => {
        //* arrange
        stored = {};
        const store = useStore();

        //* act
        store[STATE_KEY] = STATE_VALUE;
        await nextTick();

        //* assert
        expect(stored[PERSIST_KEY]).toEqual(JSON.stringify(STATE_VALUE));
        expect(storage.setItem).toHaveBeenCalled();
      });

      it('rehydrates from given storage', () => {
        //* arrange
        stored = { [PERSIST_KEY]: JSON.stringify(STATE_VALUE) };

        //* act
        const store = useStore();

        //* assert
        expect(store[STATE_KEY]).toEqual(STATE_VALUE);
        expect(storage.getItem).toHaveBeenCalled();
      });

      it('catches storage.get errors', () => {
        //* arrange
        storage.getItem.mockImplementationOnce(() => {
          throw new Error('get_error');
        });

        //* assert
        expect(() => useStore()).not.toThrow();
      });

      it('catches storage.set errors', () => {
        //* arrange
        storage.setItem.mockImplementationOnce(() => {
          throw new Error('set_error');
        });

        //* assert
        expect(() => {
          useStore()[STATE_KEY] = STATE_VALUE;
        }).not.toThrow();
      });
    });

    describe('w/ hooks', () => {
      const beforeRestore = vi.fn(ctx => {
        ctx.store.before = 'before';
      });
      const afterRestore = vi.fn(ctx => {
        ctx.store.after = 'after';
      });
      const useStore = defineStore(STORE_ID, {
        state: () => ({
          [STATE_KEY]: {},
          before: '',
          after: '',
        }),
        cnPersist: { beforeRestore, afterRestore },
      });

      it('runs hooks before and after hydration', async () => {
        //* arrange
        initializeLocalStorage({ persistKey: PERSIST_KEY, value: STATE_VALUE });

        //* act
        await nextTick();
        const store = useStore();

        //* assert
        expect(store[STATE_KEY]).toEqual(STATE_VALUE);
        expect(beforeRestore).toHaveBeenCalled();
        expect(store.before).toEqual('before');
        expect(afterRestore).toHaveBeenCalled();
        expect(store.after).toEqual('after');
      });
    });
  });
});
