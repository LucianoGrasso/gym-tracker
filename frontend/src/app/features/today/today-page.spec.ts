import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { InvitationsApi } from '../../core/api/invitations-api';
import { TodayApi } from '../../core/api/today-api';
import { AuthService } from '../../core/auth/auth.service';
import { LOCAL_DB, LocalDb } from '../../core/local-db/local-db';
import { WorkoutSessionService } from '../../core/workout/workout-session.service';
import type { Today } from '../../core/models/routine';
import { TodayPage } from './today-page';

const bench = {
  id: 1,
  name: 'Press de banca',
  muscle_group: 'chest' as const,
  secondary_muscles: [],
  equipment: 'barbell' as const,
  is_unilateral: false,
  uses_bodyweight: false,
  notes: null,
  archived_at: null,
};

const today: Today = {
  date: '2026-11-02',
  weekday: 1,
  routine: { id: 1, name: 'Rutina 4 días' },
  day: {
    id: 10,
    routine_id: 1,
    name: 'Lunes – Pecho (Bilbo)',
    weekday: 1,
    position: 0,
    exercises: [
      {
        id: 100,
        routine_day_id: 10,
        exercise: bench,
        position: 0,
        target_sets: 1,
        target_reps_min: null,
        target_reps_max: null,
        target_text: '~30 reps explosivas, 40-45 kg',
        default_set_type: 'bilbo',
        rest_seconds: 180,
        notes: null,
        last_performance: {
          workout_id: 'w1',
          date: '2026-10-26',
          sets: [
            {
              id: 's1',
              set_number: 1,
              set_type: 'bilbo',
              weight_kg: 42.5,
              reps: 30,
              side: 'both',
              rir: null,
              pain_level: null,
              notes: null,
            },
          ],
        },
      },
    ],
  },
  days: [{ id: 10, name: 'Lunes – Pecho (Bilbo)', weekday: 1 }],
};

@Component({ template: '' })
class Blank {}

async function render(data: Today, activeId: string | null = null) {
  const sessions = {
    activeId: signal(activeId),
    startFromDay: vi.fn().mockResolvedValue({ id: 'new-session' }),
    startFree: vi.fn().mockResolvedValue({ id: 'free-session' }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'entrenamiento/:id', component: Blank }]),
      { provide: TodayApi, useValue: { get: () => Promise.resolve(data) } },
      { provide: WorkoutSessionService, useValue: sessions },
      {
        provide: AuthService,
        useValue: { user: signal({ id: 1, name: 'Luciano Grasso', email: 'l@x.cl' }) },
      },
      { provide: LOCAL_DB, useValue: new LocalDb(`test-${crypto.randomUUID()}`) },
      { provide: InvitationsApi, useValue: { list: () => Promise.resolve([]) } },
    ],
  });
  const fixture = TestBed.createComponent(TodayPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, sessions, el, text: el.textContent as string };
}

describe('TodayPage', () => {
  it('shows the day, its targets and the last performance', async () => {
    const { text } = await render(today);
    expect(text).toContain('Lunes 02/11/2026');
    expect(text).toContain('Lunes – Pecho (Bilbo)');
    expect(text).toContain('Press de banca');
    expect(text).toContain('~30 reps explosivas, 40-45 kg');
    expect(text).toContain('Última vez: 42,5 kg × 30 · 26/10/2026');
  });

  it('greets the user by first name', async () => {
    const { text } = await render(today);
    expect(text).toMatch(/Buen(os días|as tardes|as noches)/);
    expect(text).toContain('Luciano');
    expect(text).not.toContain('Grasso');
  });

  it('summarizes the day', async () => {
    const { text } = await render(today);
    expect(text).toContain('1 ejercicio');
    expect(text).toContain('1 serie');
  });

  it('shows a rest day with the available days', async () => {
    const { text } = await render({ ...today, weekday: 3, date: '2026-11-04', day: null });
    expect(text).toContain('Hoy es día de descanso');
    expect(text).toContain('Lunes – Pecho (Bilbo)');
  });

  it('suggests a template when there is no active routine', async () => {
    const { text, el } = await render({ ...today, routine: null, day: null, days: [] });
    expect(text).toContain('Elige una plantilla para empezar');
    expect(el.querySelector('a[href="/rutinas/plantillas"]')).not.toBeNull();
  });

  it('offers a "Mi cuenta" menu next to the greeting, which is not a link', async () => {
    const { el } = await render(today);
    const button = el.querySelector('app-account-menu button');
    expect(button?.textContent).toContain('Mi cuenta');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('h1')?.closest('a')).toBeNull();
  });

  it('starts a workout from the day', async () => {
    const { el, fixture, sessions } = await render(today);
    const start = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Empezar entrenamiento'),
    )!;
    expect(start.disabled).toBe(false);

    start.click();
    await fixture.whenStable();

    expect(sessions.startFromDay).toHaveBeenCalledWith(today);
    expect(TestBed.inject(Router).url).toBe('/entrenamiento/new-session');
  });

  it('offers to continue the active workout', async () => {
    const { el } = await render(today, 'abc');
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Continuar entrenamiento'),
    )!;
    expect(link.getAttribute('href')).toBe('/entrenamiento/abc');
  });
});
