import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PushStatus } from '../../core/models/push';
import { PushService } from '../../core/push/push.service';
import { RestTimerService } from '../../core/workout/rest-timer.service';
import { RestTimerBar } from './rest-timer-bar';

async function render(status: PushStatus, running = true) {
  const push = {
    status: signal<PushStatus>(status),
    error: signal<string | null>(null),
    enable: vi.fn().mockResolvedValue(true),
    decline: vi.fn(),
  };
  const timer = {
    running: signal(running),
    finished: signal(false),
    ending: signal(false),
    remaining: signal(90),
    add: vi.fn(),
    stop: vi.fn(),
    dismiss: vi.fn(),
    scheduleCurrent: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: PushService, useValue: push },
      { provide: RestTimerService, useValue: timer },
    ],
  });
  const fixture = TestBed.createComponent(RestTimerBar);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  return { fixture, el, push, timer, button };
}

describe('RestTimerBar', () => {
  it('offers rest notifications the first time a rest starts', async () => {
    const { el, button, push, timer, fixture } = await render('unasked');
    expect(el.textContent).toContain('¿Te aviso cuando termine el descanso');

    button('Activar')!.click();
    await fixture.whenStable();

    expect(push.enable).toHaveBeenCalled();
    expect(timer.scheduleCurrent).toHaveBeenCalled();
  });

  it('remembers "Ahora no"', async () => {
    const { button, push } = await render('unasked');
    button('Ahora no')!.click();
    expect(push.decline).toHaveBeenCalled();
  });

  it('does not schedule when enabling failed', async () => {
    const { button, push, timer, fixture } = await render('unasked');
    push.enable.mockResolvedValue(false);
    button('Activar')!.click();
    await fixture.whenStable();
    expect(timer.scheduleCurrent).not.toHaveBeenCalled();
  });

  it.each<PushStatus>(['on', 'declined', 'blocked', 'unsupported'])('does not ask when status is %s', async (status) => {
    const { el } = await render(status);
    expect(el.textContent).not.toContain('¿Te aviso');
  });

  it('does not ask without a running rest', async () => {
    const { el } = await render('unasked', false);
    expect(el.textContent).not.toContain('¿Te aviso');
  });
});
