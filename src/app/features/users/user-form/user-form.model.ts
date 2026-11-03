import {
  CreateUserInput,
  DocumentType,
  Gender,
  UserRole,
  UserStatus,
} from '../../../core/models/user.model';

/**
 * Modelo del formulario de registro (fuente de verdad del Signal Form).
 * Agrupado por secciones; se transforma a `users/{uid}` (firebase-data-model.json) al enviar.
 * Los selects sin elegir usan '' para que `required` los detecte.
 * El código institucional no está aquí: se genera como PREFIJO-DOCUMENTO (STU-/TEA-/ADM-).
 */
export interface UserFormModel {
  personal: {
    firstName: string;
    lastName: string;
    documentType: DocumentType;
    documentNumber: string;
    birthDate: string; // YYYY-MM-DD
    gender: Gender | '';
  };
  contact: {
    email: string;
    phone: string;
    address: string;
  };
  account: {
    role: UserRole | '';
    status: UserStatus;
    password: string;
    confirmPassword: string;
  };
}

export function initialUserForm(): UserFormModel {
  return {
    personal: {
      firstName: '',
      lastName: '',
      documentType: 'DNI',
      documentNumber: '',
      birthDate: '',
      gender: '',
    },
    contact: { email: '', phone: '', address: '' },
    account: {
      role: '',
      status: 'ACTIVE',
      password: '',
      confirmPassword: '',
    },
  };
}

/** Normaliza y convierte el valor del formulario al input del servicio (ya validado). */
export function toCreateUserInput(value: UserFormModel): CreateUserInput {
  const { personal, contact, account } = value;
  return {
    firstName: personal.firstName.trim(),
    lastName: personal.lastName.trim(),
    documentType: personal.documentType,
    documentNumber: personal.documentNumber.trim().toUpperCase(),
    birthDate: personal.birthDate,
    gender: personal.gender as Gender,
    email: contact.email.trim().toLowerCase(),
    phone: contact.phone.trim(),
    address: contact.address.trim(),
    role: account.role as UserRole,
    status: account.status,
    password: account.password,
  };
}
