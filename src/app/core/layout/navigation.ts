import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  CircleUser,
  ClipboardList,
  GraduationCap,
  History,
  LayoutDashboard,
  LucideIconData,
  Radio,
  Settings,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-angular';

import { UserRole } from '../models/user.model';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIconData;
  roles: readonly UserRole[];
  exact?: boolean;
}

export interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const ALL: readonly UserRole[] = ['ADMIN', 'TEACHER', 'STUDENT'];

/** Menú del panel por rol (03 §4). La seguridad real está en las reglas de Firestore. */
export const NAVIGATION: NavGroup[] = [
  {
    title: null,
    items: [{ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ALL }],
  },
  {
    title: 'Usuarios',
    items: [
      { label: 'Usuarios', path: '/users', icon: Users, roles: ['ADMIN'], exact: true },
      { label: 'Registrar usuario', path: '/users/new', icon: UserPlus, roles: ['ADMIN'], exact: true },
    ],
  },
  {
    title: 'Académico',
    items: [
      { label: 'Periodos académicos', path: '/academic-periods', icon: CalendarDays, roles: ['ADMIN'] },
      { label: 'Carreras', path: '/careers', icon: GraduationCap, roles: ['ADMIN'] },
      { label: 'Cursos', path: '/courses', icon: BookOpen, roles: ['ADMIN'] },
      { label: 'Mis cursos', path: '/courses', icon: BookOpen, roles: ['TEACHER', 'STUDENT'] },
      { label: 'Mi horario', path: '/my-schedule', icon: CalendarDays, roles: ['STUDENT'] },
      { label: 'Asignación de docentes', path: '/teacher-assignments', icon: UserCog, roles: ['ADMIN'] },
      { label: 'Inscripciones', path: '/enrollments', icon: ClipboardList, roles: ['ADMIN'] },
      { label: 'Estudiantes', path: '/students', icon: Users, roles: ['TEACHER'] },
    ],
  },
  {
    title: 'Asistencia',
    items: [
      { label: 'Mi asistencia', path: '/my-attendance', icon: ClipboardList, roles: ['STUDENT'] },
      { label: 'Sesiones', path: '/sessions', icon: CalendarClock, roles: ['ADMIN', 'TEACHER'] },
      { label: 'Asistencia en vivo', path: '/live-attendance', icon: Radio, roles: ['ADMIN', 'TEACHER'] },
      { label: 'Reportes', path: '/reports', icon: ChartColumn, roles: ['ADMIN', 'TEACHER'] },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Auditoría', path: '/audit', icon: History, roles: ['ADMIN'] },
      { label: 'Configuración', path: '/settings', icon: Settings, roles: ['ADMIN'] },
      { label: 'Mi perfil', path: '/profile', icon: CircleUser, roles: ALL },
    ],
  },
];

export function navigationFor(role: UserRole | undefined): NavGroup[] {
  if (!role) return [];
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length);
}
