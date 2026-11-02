import { Timestamp } from '@angular/fire/firestore';

export type AuditEntityType =
  | 'USER'
  | 'COURSE'
  | 'ENROLLMENT'
  | 'ENROLLMENT_CODE'
  | 'SESSION'
  | 'ATTENDANCE'
  | 'SETTINGS';

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  USER: 'Usuario',
  COURSE: 'Curso',
  ENROLLMENT: 'Inscripción',
  ENROLLMENT_CODE: 'Código de inscripción',
  SESSION: 'Sesión',
  ATTENDANCE: 'Asistencia',
  SETTINGS: 'Configuración',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Datos de usuario actualizados',
  USER_STATUS_CHANGED: 'Estado de usuario cambiado',
  USER_ROLE_CHANGED: 'Rol de usuario cambiado',
  COURSE_CREATED: 'Curso creado',
  COURSE_UPDATED: 'Curso actualizado',
  COURSE_STATUS_CHANGED: 'Estado de curso cambiado',
  TEACHER_ASSIGNED: 'Docente asignado',
  TEACHER_REMOVED: 'Docente retirado',
  ENROLLMENT_CREATED: 'Estudiante inscrito',
  ENROLLMENT_DROPPED: 'Inscripción retirada',
  ENROLLMENT_CODE_CREATED: 'Código de inscripción generado',
  ENROLLMENT_CODE_DISABLED: 'Código de inscripción desactivado',
  SESSION_CREATED: 'Sesión creada',
  SESSION_CLOSED: 'Sesión cerrada',
  ATTENDANCE_MANUALLY_UPDATED: 'Asistencia corregida',
  SETTINGS_UPDATED: 'Configuración actualizada',
};

/** Documento auditLogs/{logId} (modelo 6.8). */
export interface AuditLog {
  id: string;
  actorId: string;
  actorName?: string | null;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  reason: string | null;
  details?: Record<string, unknown> | null;
  createdAt: Timestamp | null;
}
