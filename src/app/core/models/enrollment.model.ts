import { Timestamp } from '@angular/fire/firestore';

export const ENROLLMENT_STATUSES = ['ACTIVE', 'DROPPED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVE: 'Activa',
  DROPPED: 'Retirada',
};

/** Documento enrollments/{courseId_studentId} (modelo 6.3). */
export interface Enrollment {
  id: string;
  courseId: string;
  studentId: string;
  status: EnrollmentStatus;
  enrolledAt: Timestamp | null;
  enrolledBy: string | null;
}

export const ENROLLMENT_CODE_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type EnrollmentCodeStatus = (typeof ENROLLMENT_CODE_STATUSES)[number];

/** Documento enrollmentCodes/{codeId} (modelo 6.4). Solo se guarda el hash. */
export interface EnrollmentCode {
  id: string;
  courseId: string;
  codeHash: string;
  status: EnrollmentCodeStatus;
  expiresAt: Timestamp;
  maxUses: number;
  uses: number;
  createdBy: string;
  createdAt: Timestamp | null;
}

export const enrollmentId = (courseId: string, studentId: string) => `${courseId}_${studentId}`;
