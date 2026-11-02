import { Timestamp } from '@angular/fire/firestore';

export const USER_ROLES = ['STUDENT', 'TEACHER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Estados definidos en el modelo compartido con Android. */
export const USER_STATUSES = ['PENDING', 'ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

export const DOCUMENT_TYPES = ['DNI', 'CE', 'PASSPORT'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  TEACHER: 'Docente',
  STUDENT: 'Estudiante',
};
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  PENDING: 'Pendiente',
  ACTIVE: 'Activo',
  DISABLED: 'Deshabilitado',
};
export const USER_STATUS_BADGE: Record<UserStatus, string> = {
  PENDING: 'badge badge-yellow',
  ACTIVE: 'badge badge-green',
  DISABLED: 'badge badge-red',
};
export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Masculino',
  FEMALE: 'Femenino',
  OTHER: 'Otro',
};
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DNI: 'DNI',
  CE: 'Carné de extranjería',
  PASSPORT: 'Pasaporte',
};
export const AUTH_PROVIDER_LABELS: Record<string, string> = {
  password: 'Correo y contraseña',
  'google.com': 'Google',
};

/** Documento users/{uid} (modelo 6.1 + datos personales del panel). */
export interface UserProfile {
  uid: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string;
  photoUrl: string | null;
  institutionalCode: string | null;
  role: UserRole;
  status: UserStatus;
  authProvider: string;
  /** false => Android muestra "Completar perfil" (A05). */
  profileCompleted: boolean;
  documentType?: DocumentType;
  documentNumber?: string;
  birthDate?: string; // 'YYYY-MM-DD'
  gender?: Gender;
  phone?: string | null;
  address?: string | null;
  createdBy?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  institutionalCode: string;
  documentType: DocumentType;
  documentNumber: string;
  birthDate: string;
  gender: Gender;
  phone: string;
  address: string;
  role: UserRole;
  status: UserStatus;
}

/** Datos institucionales editables por un ADMIN (no incluye rol ni estado). */
export interface InstitutionalDataInput {
  firstName: string;
  lastName: string;
  institutionalCode: string | null;
  documentType: DocumentType;
  documentNumber: string;
  birthDate: string;
  gender: Gender;
  phone: string | null;
  address: string | null;
}

/** Datos que el propio usuario puede editar en su perfil. */
export interface OwnProfileInput {
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
}

/** Usuario en sesión. */
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  role: UserRole;
  status: UserStatus;
}

export const HOME_ROUTE = '/dashboard';

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Normaliza estados antiguos: sin estado => ACTIVE, 'INACTIVE' => DISABLED. */
export function normalizeStatus(value: unknown): UserStatus {
  if (value === 'PENDING' || value === 'ACTIVE' || value === 'DISABLED') return value;
  if (value === 'INACTIVE') return 'DISABLED';
  return 'ACTIVE';
}

export function fullName(
  user: Partial<Pick<UserProfile, 'firstName' | 'lastName' | 'displayName' | 'email'>> | null | undefined,
): string {
  if (!user) return '—';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.displayName || user.email || '—';
}

export function normalizeProfile(data: Record<string, unknown>, uid: string): UserProfile {
  return {
    ...(data as unknown as UserProfile),
    uid,
    firstName: (data['firstName'] as string | undefined) ?? '',
    lastName: (data['lastName'] as string | undefined) ?? '',
    email: (data['email'] as string | undefined) ?? '',
    photoUrl: (data['photoUrl'] as string | null | undefined) ?? null,
    institutionalCode: (data['institutionalCode'] as string | null | undefined) ?? null,
    role: isUserRole(data['role']) ? data['role'] : 'STUDENT',
    status: normalizeStatus(data['status']),
    authProvider: (data['authProvider'] as string | undefined) ?? 'password',
    profileCompleted: (data['profileCompleted'] as boolean | undefined) ?? true,
  };
}

export function sortByName<T extends Pick<UserProfile, 'firstName' | 'lastName'>>(a: T, b: T): number {
  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es');
}
