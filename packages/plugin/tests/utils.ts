import { getPersistKey } from '../src/util';

export function initializeLocalStorage(...entries: { persistKey: string; value: unknown }[]): void {
  localStorage.clear();
  if (entries) {
    entries.forEach(entry => {
      localStorage.setItem(entry.persistKey, JSON.stringify(entry.value));
    });
  }
}

export function readLocalStoage(persistKey: string): Record<string, unknown> | null {
  const persistValue = localStorage.getItem(persistKey);
  return persistValue ? JSON.parse(persistValue) : null;
}
