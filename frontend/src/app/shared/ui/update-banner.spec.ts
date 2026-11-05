import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RELOAD_PAGE, UpdateBanner } from './update-banner';

function setup() {
  const versionUpdates = new Subject<VersionEvent>();
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: SwUpdate, useValue: { versionUpdates } },
      { provide: RELOAD_PAGE, useValue: reload },
    ],
  });
  const fixture = TestBed.createComponent(UpdateBanner);
  return { fixture, versionUpdates, reload };
}

describe('UpdateBanner', () => {
  it('stays hidden while no new version is ready', async () => {
    const { fixture, versionUpdates } = setup();
    await fixture.whenStable();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('nueva versión');
  });

  it('offers to reload once a new version is ready', async () => {
    const { fixture, versionUpdates, reload } = setup();
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Hay una nueva versión de GymTracker.');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders nothing when the service worker is not available', async () => {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(UpdateBanner);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
