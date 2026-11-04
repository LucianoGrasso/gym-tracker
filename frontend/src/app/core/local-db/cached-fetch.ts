import type { LocalDb } from './local-db';

/** Pide datos frescos y los guarda; si falla (sin señal), usa la última copia guardada. */
export async function cachedFetch<T>(db: LocalDb, key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const value = await fetcher();
    await db.cache.put({ key, value, updatedAt: Date.now() });
    return value;
  } catch (error) {
    const hit = await db.cache.get(key);
    if (hit) {
      return hit.value as T;
    }
    throw error;
  }
}
