import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../api/api-error';
import { LOCAL_DB, type OutboxOp } from '../local-db/local-db';
import type { SyncState } from './sync-label';

const MAX_BACKOFF_MS = 5 * 60_000;
const RETRYABLE_4XX = new Set([408, 419, 429]);

/** Envía la outbox (IndexedDB) a la API en orden FIFO. */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly db = inject(LOCAL_DB);
  private readonly http = inject(HttpClient);

  readonly state = signal<SyncState>('idle');
  readonly pending = signal(0);
  readonly failed = signal(0);

  private running = false;
  private rerun = false;
  private backoffMs = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  async enqueue(method: OutboxOp['method'], url: string, body: unknown = null): Promise<void> {
    await this.db.outbox.add({ method, url, body, createdAt: Date.now(), attempts: 0, failed: false, lastError: null });
    await this.refreshCounts();
    void this.flush();
  }

  /** Escucha reconexión y regreso a la app; procesa lo pendiente. */
  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => void this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.flush();
    });
    void this.refreshCounts().then(() => this.flush());
  }

  async retryFailed(): Promise<void> {
    await this.db.outbox.filter((op) => op.failed).modify({ failed: false, attempts: 0 });
    await this.refreshCounts();
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    this.clearRetry();
    try {
      await this.processQueue();
    } finally {
      this.running = false;
      // Tras un 401 no se reintenta solo: espera un nuevo login (flush explícito).
      const again = this.rerun && this.state() !== 'auth';
      this.rerun = false;
      if (again) {
        void this.flush();
      }
    }
  }

  private async processQueue(): Promise<void> {
    for (;;) {
      const op = await this.db.outbox.filter((o) => !o.failed).first();
      if (!op) {
        this.backoffMs = 0;
        this.state.set(this.failed() > 0 ? 'error' : 'idle');
        return;
      }
      this.state.set('syncing');
      try {
        await firstValueFrom(this.http.request(op.method, op.url, { body: op.body ?? undefined }));
        await this.db.outbox.delete(op.seq!);
        this.backoffMs = 0;
      } catch (error) {
        const status = error instanceof HttpErrorResponse ? error.status : -1;
        if (status === 401) {
          this.state.set('auth');
          return;
        }
        if (status >= 400 && status < 500 && !RETRYABLE_4XX.has(status)) {
          await this.db.outbox.update(op.seq!, { failed: true, attempts: op.attempts + 1, lastError: apiErrorMessage(error) });
          await this.refreshCounts();
          continue;
        }
        await this.db.outbox.update(op.seq!, { attempts: op.attempts + 1, lastError: apiErrorMessage(error) });
        this.state.set(status === 0 ? 'offline' : 'error');
        this.scheduleRetry();
        return;
      } finally {
        await this.refreshCounts();
      }
    }
  }

  private scheduleRetry(): void {
    this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, MAX_BACKOFF_MS);
    this.retryTimer = setTimeout(() => void this.flush(), this.backoffMs);
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async refreshCounts(): Promise<void> {
    const all = await this.db.outbox.toArray();
    this.failed.set(all.filter((op) => op.failed).length);
    this.pending.set(all.filter((op) => !op.failed).length);
  }
}
