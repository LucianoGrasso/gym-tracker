import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushService } from '../push/push.service';
import { RestTimerService, remainingSeconds, restNoticeBody } from './rest-timer.service';

describe('remainingSeconds', () => {
  it('rounds up and never goes below zero', () => {
    expect(remainingSeconds(10_500, 0)).toBe(11);
    expect(remainingSeconds(1_000, 5_000)).toBe(0);
    expect(remainingSeconds(null, 0)).toBe(0);
  });
});

describe('RestTimerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T22:00:00Z'));
    localStorage.clear();
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
  });

  afterEach(() => vi.useRealTimers());

  it('counts down, survives a reload and vibrates at the end', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(90);
    expect(timer.remaining()).toBe(90);

    vi.advanceTimersByTime(30_000);
    expect(timer.remaining()).toBe(60);

    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(RestTimerService);
    expect(reloaded.remaining()).toBe(60);

    vi.advanceTimersByTime(61_000);
    expect(reloaded.running()).toBe(false);
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('announces the end of the rest for a few seconds', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(10);
    vi.advanceTimersByTime(7_100);
    expect(timer.ending()).toBe(true);

    vi.advanceTimersByTime(3_000);
    expect(timer.running()).toBe(false);
    expect(timer.finished()).toBe(true);

    vi.advanceTimersByTime(4_000);
    expect(timer.finished()).toBe(false);
  });

  it('does not announce the end when the rest is skipped or dismissed', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(10);
    timer.stop();
    expect(timer.finished()).toBe(false);

    timer.start(1);
    vi.advanceTimersByTime(1_500);
    expect(timer.finished()).toBe(true);
    timer.dismiss();
    expect(timer.finished()).toBe(false);
  });

  it('adds time and stops', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(60);
    timer.add(30);
    expect(timer.remaining()).toBe(90);

    timer.stop();
    expect(timer.running()).toBe(false);
    expect(localStorage.getItem('gymtracker.restEndsAt')).toBeNull();
  });
});

describe('restNoticeBody', () => {
  it('names the exercise and the coming set', () => {
    expect(restNoticeBody('Press de banca', 3, 4)).toBe('Press de banca · serie 3 de 4');
    expect(restNoticeBody('Press de banca', 5, 4)).toBe('Press de banca · serie 5');
    expect(restNoticeBody('Dominadas', 2, null)).toBe('Dominadas · serie 2');
  });
});

describe('RestTimerService push notices', () => {
  const NOTICE = { body: 'Press de banca · serie 2 de 4', url: '/entrenamiento/w1' };
  const push = { schedule: vi.fn(), cancel: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T22:00:00Z'));
    localStorage.clear();
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
    push.schedule.mockReset().mockResolvedValue(undefined);
    push.cancel.mockReset().mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PushService, useValue: push }] });
  });

  afterEach(() => vi.useRealTimers());

  it('schedules the push, reschedules it on +30 s and cancels it on skip', () => {
    const timer = TestBed.inject(RestTimerService);

    timer.start(90, NOTICE);
    expect(push.schedule).toHaveBeenLastCalledWith(90, NOTICE.body, NOTICE.url);

    vi.advanceTimersByTime(10_000);
    timer.add(30);
    expect(push.schedule).toHaveBeenLastCalledWith(110, NOTICE.body, NOTICE.url);

    timer.stop();
    expect(push.cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves push alone when there is no notice', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(90);
    timer.add(30);
    timer.stop();
    expect(push.schedule).not.toHaveBeenCalled();
    expect(push.cancel).not.toHaveBeenCalled();
  });

  it('does not cancel after the rest ended by itself (the push already fired)', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(5, NOTICE);
    vi.advanceTimersByTime(6_000);
    timer.stop();
    expect(push.cancel).not.toHaveBeenCalled();
  });

  it('schedules the running rest on demand (after enabling notifications)', () => {
    const timer = TestBed.inject(RestTimerService);
    timer.start(90, NOTICE);
    push.schedule.mockClear();
    vi.advanceTimersByTime(20_000);

    timer.scheduleCurrent();
    expect(push.schedule).toHaveBeenCalledWith(70, NOTICE.body, NOTICE.url);
  });
});
