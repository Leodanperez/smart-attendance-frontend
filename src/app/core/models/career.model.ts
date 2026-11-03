import { Timestamp } from '@angular/fire/firestore';

import { courseInitials } from './course.model';

export const CAREER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CareerStatus = (typeof CAREER_STATUSES)[number];

export const CAREER_STATUS_LABELS: Record<CareerStatus, string> = {
  ACTIVE: 'Activa',
  INACTIVE: 'Inactiva',
};
export const CAREER_STATUS_BADGE: Record<CareerStatus, string> = {
  ACTIVE: 'badge badge-green',
  INACTIVE: 'badge badge-gray',
};

/** Carrera profesional del instituto. Documento careers/{careerId}. */
export interface Career {
  id: string;
  name: string;
  /** Generado de las iniciales del nombre, único. Ej: "Desarrollo de Sistemas de Información" → DSI. */
  code: string;
  description: string;
  /** Duración de la carrera en ciclos (1 ciclo = 1 periodo académico). */
  durationSemesters: number;
  status: CareerStatus;
  createdBy: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type CareerInput = Pick<Career, 'name' | 'description' | 'durationSemesters' | 'status'>;

export const DEFAULT_CAREER_SEMESTERS = 6;
export const MAX_CAREER_SEMESTERS = 12;

/** Iniciales de la carrera (misma regla que los cursos). */
export const careerInitials = courseInitials;

export function normalizeCareer(data: Record<string, unknown>, id: string): Career {
  const semesters = Number(data['durationSemesters']);
  return {
    ...(data as unknown as Career),
    id,
    name: (data['name'] as string | undefined) ?? '',
    code: (data['code'] as string | undefined) ?? '',
    description: (data['description'] as string | undefined) ?? '',
    durationSemesters: Number.isFinite(semesters) && semesters > 0 ? semesters : DEFAULT_CAREER_SEMESTERS,
    status: data['status'] === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
}

/** Lista 1..n para elegir el ciclo de un curso. */
export function semesterOptions(career: Pick<Career, 'durationSemesters'> | undefined): number[] {
  const total = career?.durationSemesters ?? MAX_CAREER_SEMESTERS;
  return Array.from({ length: total }, (_, i) => i + 1);
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** "III ciclo" */
export function semesterLabel(semester: number | null | undefined): string {
  if (!semester) return '—';
  return `${ROMAN[semester - 1] ?? semester} ciclo`;
}
