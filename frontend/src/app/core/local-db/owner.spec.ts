import { describe, expect, it } from 'vitest';
import { LocalDb } from './local-db';
import { claimLocalData } from './owner';

async function dbWithData() {
  const db = new LocalDb(`test-${crypto.randomUUID()}`);
  await db.outbox.add({ method: 'PUT', url: '/api/workouts/a', body: {}, createdAt: 1, attempts: 0, failed: false, lastError: null });
  await db.cache.put({ key: 'today', value: { day: 'Lunes' }, updatedAt: 1 });
  return db;
}

describe('claimLocalData', () => {
  it('adopts data that has no owner yet (installs from before this check)', async () => {
    const db = await dbWithData();

    expect(await claimLocalData(db, 7)).toBe(false);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.cache.get('today')).toBeDefined();
  });

  it('keeps everything for the same user, so pending changes still sync after logging in again', async () => {
    const db = await dbWithData();
    await claimLocalData(db, 7);

    expect(await claimLocalData(db, 7)).toBe(false);
    expect(await db.outbox.count()).toBe(1);
  });

  it("wipes another user's data, so it never reaches this account", async () => {
    const db = await dbWithData();
    await claimLocalData(db, 7);
    await db.sessions.put({ id: 's1' } as never);

    expect(await claimLocalData(db, 8)).toBe(true);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.cache.get('today')).toBeUndefined();
    expect(await claimLocalData(db, 8)).toBe(false);
  });
});
