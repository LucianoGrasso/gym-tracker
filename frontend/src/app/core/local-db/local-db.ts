import { InjectionToken } from '@angular/core';
import Dexie, { type EntityTable } from 'dexie';
import type { Session } from '../models/workout';

export interface OutboxOp {
  seq?: number;
  method: 'PUT' | 'DELETE';
  url: string;
  body: unknown;
  createdAt: number;
  attempts: number;
  failed: boolean;
  lastError: string | null;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  updatedAt: number;
}

export class LocalDb extends Dexie {
  outbox!: EntityTable<OutboxOp, 'seq'>;
  sessions!: EntityTable<Session, 'id'>;
  cache!: EntityTable<CacheEntry, 'key'>;

  constructor(name = 'gymtracker') {
    super(name);
    this.version(1).stores({ outbox: '++seq', sessions: 'id', cache: 'key' });
  }
}

export const LOCAL_DB = new InjectionToken<LocalDb>('LOCAL_DB', {
  providedIn: 'root',
  factory: () => new LocalDb(),
});
