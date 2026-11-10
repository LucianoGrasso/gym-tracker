import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_FONTS, loadAppFonts } from './fonts';

describe('loadAppFonts', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads every weight the app uses', async () => {
    const load = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('document', { fonts: { load } });

    await loadAppFonts();

    expect(load.mock.calls.map((c) => c[0])).toEqual(APP_FONTS);
    expect(APP_FONTS).toContain('600 1em "Barlow Condensed"');
  });

  it('gives up after 3 s so a slow network never blocks the app', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { fonts: { load: () => new Promise(() => undefined) } });

    let done = false;
    void loadAppFonts().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('resolves right away without the Font Loading API, or if a font fails', async () => {
    vi.stubGlobal('document', {});
    await expect(loadAppFonts()).resolves.toBeUndefined();
    vi.stubGlobal('document', { fonts: { load: vi.fn().mockRejectedValue(new Error('404')) } });
    await expect(loadAppFonts()).resolves.toBeUndefined();
  });
});
