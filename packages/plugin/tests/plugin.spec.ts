import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { createPinia, defineStore, setActivePinia } from 'pinia';

import { createCnPersistPiniaPlugin } from '../src/plugin';
import { initializeLocalStorage, readLocalStoage } from './utils';
import { getPersistKey } from '../src/util';

const STORE_ID = 'mock-store';
const STATE_KEY = 'lorem';
const STATE_VALUE = { name: 'ipsum' };

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
      expect(readLocalStoage(getPersistKey(STORE_ID, STATE_KEY))).toBeNull();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('does not rehydrate store', async () => {
      //* arrange
      const persistKey = getPersistKey(STORE_ID, STATE_KEY);
      initializeLocalStorage(persistKey, STATE_VALUE);

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
      const persistKey = getPersistKey(STORE_ID, STATE_KEY);
      const store = useStore();

      //* act
      store[STATE_KEY] = STATE_VALUE;
      await nextTick();

      //* assert
      expect(readLocalStoage(persistKey)).toEqual(STATE_VALUE);
      expect(localStorage.setItem).toHaveBeenCalledWith(persistKey, JSON.stringify(STATE_VALUE));
    });

    it('rehydrates store from localStorage', async () => {
      //* arrange
      const persistKey = getPersistKey(STORE_ID, STATE_KEY);
      initializeLocalStorage(persistKey, STATE_VALUE);

      //* act
      await nextTick();
      const store = useStore();

      //* assert
      expect(store[STATE_KEY]).toEqual(STATE_VALUE);
      expect(localStorage.getItem).toHaveBeenCalledWith(persistKey);
    });
  });
});
