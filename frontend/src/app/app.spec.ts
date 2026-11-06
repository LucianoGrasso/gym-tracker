import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { SyncService } from './core/sync/sync.service';
import { WorkoutSessionService } from './core/workout/workout-session.service';

@Component({ template: '<p>pantalla</p>' })
class Screen {}

async function render(guard: () => Promise<boolean>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'hoy', component: Screen, canActivate: [guard] }]),
      { provide: HttpClient, useValue: { get: () => of(null) } },
      { provide: SyncService, useValue: { start: vi.fn() } },
      { provide: WorkoutSessionService, useValue: { restoreActive: vi.fn().mockResolvedValue(null) } },
    ],
  });
  const fixture = TestBed.createComponent(App);
  void TestBed.inject(Router).navigateByUrl('/hoy');
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return fixture;
}

describe('App', () => {
  it('shows a loading skeleton while the first screen is not ready', async () => {
    const fixture = await render(() => new Promise<boolean>(() => undefined));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.textContent).toContain('Cargando tus datos');
  });

  it('removes the skeleton once the first screen is shown', async () => {
    const fixture = await render(() => Promise.resolve(true));
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
    expect(el.textContent).toContain('pantalla');
  });
});
