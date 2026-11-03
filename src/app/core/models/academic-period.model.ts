import { Timestamp } from '@angular/fire/firestore';

export const PERIOD_TERMS = [1, 2] as const;
export type PeriodTerm = (typeof PERIOD_TERMS)[number];

export const PERIOD_STATUSES = ['PLANNED', 'ACTIVE', 'CLOSED'] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  PLANNED: 'Planificado',
  ACTIVE: 'En curso',
  CLOSED: 'Cerrado',
};
export const PERIOD_STATUS_BADGE: Record<PeriodStatus, string> = {
  PLANNED: 'badge badge-blue',
  ACTIVE: 'badge badge-green',
  CLOSED: 'badge badge-gray',
};

const TERM_ROMAN: Record<PeriodTerm, string> = { 1: 'I', 2: 'II' };

/**
 * Periodo académico: academicPeriods/{name}. El ID es el nombre (2026-I, 2026-II), así no hay duplicados.
 * Solo uno puede estar ACTIVE (en curso).
 */
export interface AcademicPeriod {
  id: string;
  name: string; // 2026-I
  year: number;
  term: PeriodTerm;
  startsOn: string; // YYYY-MM-DD
  endsOn: string; // YYYY-MM-DD
  status: PeriodStatus;
  createdBy: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PeriodInput {
  year: number;
  term: PeriodTerm;
  startsOn: string;
  endsOn: string;
}

/** "2026-I" / "2026-II" */
export function periodName(year: number, term: PeriodTerm): string {
  return `${year}-${TERM_ROMAN[term]}`;
}

/** Fechas sugeridas: I = marzo–julio, II = agosto–diciembre. */
export function defaultPeriodDates(year: number, term: PeriodTerm): { startsOn: string; endsOn: string } {
  return term === 1
    ? { startsOn: `${year}-03-01`, endsOn: `${year}-07-31` }
    : { startsOn: `${year}-08-01`, endsOn: `${year}-12-20` };
}

/** Periodo que sigue al último registrado (o el actual por fecha si no hay ninguno). */
export function nextPeriod(periods: readonly AcademicPeriod[], today = new Date()): { year: number; term: PeriodTerm } {
  const latest = [...periods].sort(comparePeriods)[0];
  if (!latest) return { year: today.getFullYear(), term: today.getMonth() < 7 ? 1 : 2 };
  return latest.term === 1 ? { year: latest.year, term: 2 } : { year: latest.year + 1, term: 1 };
}

/** Más reciente primero. */
export function comparePeriods(a: Pick<AcademicPeriod, 'year' | 'term'>, b: Pick<AcademicPeriod, 'year' | 'term'>): number {
  return b.year - a.year || b.term - a.term;
}

export function normalizePeriod(data: Record<string, unknown>, id: string): AcademicPeriod {
  const year = Number(data['year']) || Number(id.slice(0, 4)) || new Date().getFullYear();
  const term: PeriodTerm = data['term'] === 2 || id.endsWith('-II') ? 2 : 1;
  const status = data['status'];
  return {
    ...(data as unknown as AcademicPeriod),
    id,
    name: (data['name'] as string | undefined) ?? periodName(year, term),
    year,
    term,
    startsOn: (data['startsOn'] as string | undefined) ?? '',
    endsOn: (data['endsOn'] as string | undefined) ?? '',
    status: status === 'ACTIVE' || status === 'CLOSED' ? status : 'PLANNED',
  };
}

/** "01 mar – 31 jul 2026" */
export function periodRangeLabel(p: Pick<AcademicPeriod, 'startsOn' | 'endsOn'>): string {
  if (!p.startsOn || !p.endsOn) return '—';
  const fmt = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });
  const start = new Date(`${p.startsOn}T00:00:00`);
  const end = new Date(`${p.endsOn}T00:00:00`);
  return `${fmt.format(start)} – ${fmt.format(end)} ${end.getFullYear()}`;
}
