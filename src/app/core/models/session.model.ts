import { Timestamp } from '@angular/fire/firestore';

export const SESSION_STATUSES = ['ACTIVE', 'CLOSED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  ACTIVE: 'Activa',
  CLOSED: 'Cerrada',
};
export const SESSION_STATUS_BADGE: Record<SessionStatus, string> = {
  ACTIVE: 'badge badge-green',
  CLOSED: 'badge badge-gray',
};

/** Documento sessions/{sessionId} (modelo 6.5). */
export interface ClassSession {
  id: string;
  courseId: string;
  title: string;
  teacherId: string;
  status: SessionStatus;
  startsAt: Timestamp;
  expiresAt: Timestamp;
  lateAfter: Timestamp | null;
  createdAt: Timestamp | null;
  closedAt: Timestamp | null;
}

export interface CreateSessionInput {
  courseId: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  lateAfterMinutes: number | null;
}

/** Token temporal del QR (generado por el panel; solo se guarda su hash). */
export interface SessionQrToken {
  token: string;
  expiresAt: number; // epoch ms
}
