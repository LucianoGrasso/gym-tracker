import type { LocalDb } from './local-db';

const OWNER_KEY = 'owner';

/**
 * Deja los datos locales (cola de cambios, sesiones, caché) a nombre de `userId`. Si eran de otra
 * cuenta los borra: sus cambios pendientes no deben enviarse con esta sesión ni sus datos mostrarse.
 * Devuelve true si borró (hay que reiniciar la app para soltar también lo que quedó en memoria).
 * Sin dueño registrado (instalaciones anteriores a esto) adopta los datos para no perder nada.
 */
export async function claimLocalData(db: LocalDb, userId: number): Promise<boolean> {
  const owner = (await db.cache.get(OWNER_KEY))?.value as number | undefined;
  if (owner === userId) return false;

  const switched = owner !== undefined;
  await db.transaction('rw', db.outbox, db.sessions, db.cache, async () => {
    if (switched) {
      await Promise.all([db.outbox.clear(), db.sessions.clear(), db.cache.clear()]);
    }
    await db.cache.put({ key: OWNER_KEY, value: userId, updatedAt: Date.now() });
  });
  return switched;
}
