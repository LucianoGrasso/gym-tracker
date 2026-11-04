import { ulid } from 'ulid';

/** ULID en minúsculas (Laravel también los guarda así). */
export function newId(): string {
  return ulid().toLowerCase();
}
