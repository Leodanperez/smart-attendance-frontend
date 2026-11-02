import { Timestamp } from '@angular/fire/firestore';

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Presente',
  LATE: 'Tardanza',
  ABSENT: 'Falta',
  JUSTIFIED: 'Justificada',
};
export const ATTENDANCE_STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: 'badge badge-green',
  LATE: 'badge badge-yellow',
  ABSENT: 'badge badge-red',
  JUSTIFIED: 'badge badge-blue',
};

export type AttendanceSource = 'QR' | 'MANUAL';
export const ATTENDANCE_SOURCE_LABELS: Record<string, string> = {
  QR: 'QR',
  MANUAL: 'Manual',
};

/** Documento attendances/{sessionId_studentId} (modelo 6.7). */
export interface Attendance {
  id: string;
  sessionId: string;
  courseId: string;
  studentId: string;
  status: AttendanceStatus;
  registeredAt: Timestamp | null;
  source: AttendanceSource;
  updatedBy?: string | null;
  updateReason?: string | null;
  updatedAt?: Timestamp | null;
}

export const attendanceId = (sessionId: string, studentId: string) => `${sessionId}_${studentId}`;

/**
 * Regla institucional de cálculo:
 * - Sesiones válidas: sesiones CERRADAS del curso que terminaron después de la inscripción del estudiante.
 * - Cuentan como asistencia: PRESENT y LATE.
 * - JUSTIFIED no cuenta como falta y se excluye del total.
 * - Sin registro en una sesión cerrada = falta.
 */
export const ATTENDED_STATUSES: readonly AttendanceStatus[] = ['PRESENT', 'LATE'];
export const ATTENDANCE_RULE_TEXT =
  'Porcentaje = (presentes + tardanzas) / (sesiones cerradas desde la inscripción − justificadas). Sin registro en una sesión cerrada cuenta como falta.';
