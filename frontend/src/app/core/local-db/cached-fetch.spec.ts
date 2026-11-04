import { describe, expect, it } from 'vitest';
import { cachedFetch } from './cached-fetch';
import { LocalDb } from './local-db';

describe('cachedFetch', () => {
  it('stores fresh values and falls back to them when the fetch fails', async () => {
    const db = new LocalDb(`test-${crypto.randomUUID()}`);

    expect(await cachedFetch(db, 'today', async () => ({ day: 'Lunes' }))).toEqual({ day: 'Lunes' });
    expect(await cachedFetch(db, 'today', async () => { throw new Error('offline'); })).toEqual({ day: 'Lunes' });
  });

  it('rethrows when there is nothing cached', async () => {
    const db = new LocalDb(`test-${crypto.randomUUID()}`);

    await expect(cachedFetch(db, 'none', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  });
});
