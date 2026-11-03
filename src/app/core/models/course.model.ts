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
  /** Carrera a la que pertenece el curso (careers/{careerId}). */
  careerId: string | null;
  /** Copia del nombre de la carrera para mostrar sin otra lectura. */
  careerName: string | null;
  /** Ciclo de la carrera en que se dicta (V, VI…): 1..durationSemesters. */
  semester: number | null;
  /** Periodo académico en que se dicta (academicPeriods/{id}, p. ej. "2026-II"). */
  academicPeriodId: string | null;
  /** Copia del nombre del periodo ("2026-II"). */
  academicPeriodName: string | null;
  section: string;
  teacherIds: string[];
  status: CourseStatus;
  createdBy: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** El código del curso no se ingresa: se genera al crearlo y no cambia. */
export type CourseInput = Pick<
  Course,
  | 'name'
  | 'description'
  | 'section'
  | 'teacherIds'
  | 'status'
  | 'careerId'
  | 'careerName'
  | 'semester'
  | 'academicPeriodId'
  | 'academicPeriodName'
>;

/** Palabras que no aportan a las iniciales. */
const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'para', 'por', 'con', 'al', 'o', 'u']);

/**
 * Iniciales del curso (3 letras):
 * - 3+ palabras: primera letra de las tres primeras. "Programación Orientada a Objetos" → POO
 * - 2 palabras: 1.ª y 3.ª letra de la primera + 1.ª de la segunda. "Ingeniería de Software" → IGS
 * - 1 palabra: sus tres primeras letras. "Matemática" → MAT
 */
export function courseInitials(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()));
  if (!words.length) return 'CUR';
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]).join('');
  const [first, second] = words;
  if (second) return `${first[0]}${first[2] ?? first[1] ?? first[0]}${second[0]}`;
  return first.padEnd(3, 'X').slice(0, 3);
}

/** Número aleatorio de 4 dígitos (Web Crypto). */
function random4(): string {
  return String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
}

/** Código del curso: INICIALES-AÑO-NNNN (p. ej. IGS-2026-4821). */
export function generateCourseCode(name: string, year = new Date().getFullYear()): string {
  return `${courseInitials(name)}-${year}-${random4()}`;
}

/** Vista previa sin la parte aleatoria (IGS-2026-####). */
export function courseCodePreview(name: string, year = new Date().getFullYear()): string {
  return `${courseInitials(name)}-${year}-####`;
}

export function normalizeCourse(data: Record<string, unknown>, id: string): Course {
  return {
    ...(data as unknown as Course),
    id,
    name: (data['name'] as string | undefined) ?? '',
    description: (data['description'] as string | undefined) ?? '',
    courseCode: (data['courseCode'] as string | undefined) ?? '',
    careerId: (data['careerId'] as string | null | undefined) ?? null,
    careerName: (data['careerName'] as string | null | undefined) ?? null,
    semester: typeof data['semester'] === 'number' ? (data['semester'] as number) : null,
    academicPeriodId: (data['academicPeriodId'] as string | null | undefined) ?? null,
    academicPeriodName:
      (data['academicPeriodName'] as string | null | undefined) ??
      ((data['academicPeriodId'] as string | null | undefined) ?? null),
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
