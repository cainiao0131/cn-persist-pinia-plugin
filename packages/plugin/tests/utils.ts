import { getPersistKey } from '../src/util';

export function initializeLocalStorage(persistKey: string, stateValue: unknown): void {
  localStorage.clear();
  localStorage.setItem(persistKey, JSON.stringify(stateValue));
}

export function readLocalStoage(persistKey: string): Record<string, unknown> | null {
  const persistValue = localStorage.getItem(persistKey);
  return persistValue ? JSON.parse(persistValue) : null;
}
