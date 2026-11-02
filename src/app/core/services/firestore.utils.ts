import { Timestamp } from '@angular/fire/firestore';
import { Observable, combineLatest, map, of } from 'rxjs';

export function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date };
  return typeof maybe.toDate === 'function' ? maybe.toDate() : null;
}

export const tsMillis = (value: unknown): number => tsToDate(value)?.getTime() ?? 0;

/** Une varias listas observables en una sola; [] si no hay fuentes. */
export function combineLists<T>(sources: Observable<T[]>[]): Observable<T[]> {
  return sources.length ? combineLatest(sources).pipe(map((lists) => lists.flat())) : of([]);
}

export const uniq = <T>(items: readonly T[]): T[] => [...new Set(items)];

export const sameIds = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** Clave estable para comparar listas de ids. */
export const sortedIds = (ids: readonly string[]): string[] => uniq(ids).sort();

export function firestoreError(error: unknown): { code: string } {
  const code = (error as { code?: string } | null)?.code ?? 'unknown';
  return { code };
}
