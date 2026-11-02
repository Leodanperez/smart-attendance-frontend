import { Timestamp } from '@angular/fire/firestore';

export const COURSE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
};
export const COURSE_STATUS_BADGE: Record<CourseStatus, string> = {
  ACTIVE: 'badge badge-green',
  INACTIVE: 'badge badge-gray',
};

/** Documento courses/{courseId} (modelo 6.2). */
export interface Course {
  id: string;
  name: string;
  description: string;
  courseCode: string;
  section: string;
  teacherIds: string[];
  status: CourseStatus;
  createdBy: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type CourseInput = Pick<
  Course,
  'name' | 'description' | 'courseCode' | 'section' | 'teacherIds' | 'status'
>;

export function normalizeCourse(data: Record<string, unknown>, id: string): Course {
  return {
    ...(data as unknown as Course),
    id,
    name: (data['name'] as string | undefined) ?? '',
    description: (data['description'] as string | undefined) ?? '',
    courseCode: (data['courseCode'] as string | undefined) ?? '',
    section: (data['section'] as string | undefined) ?? '',
    teacherIds: Array.isArray(data['teacherIds']) ? (data['teacherIds'] as string[]) : [],
    status: data['status'] === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  };
}

export function courseLabel(course: Pick<Course, 'courseCode' | 'name' | 'section'> | undefined): string {
  if (!course) return '—';
  const section = course.section ? ` (${course.section})` : '';
  return `${course.courseCode} · ${course.name}${section}`;
}
