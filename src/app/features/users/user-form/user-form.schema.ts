import { resource } from '@angular/core';
import {
  SchemaPath,
  debounce,
  email,
  maxLength,
  minLength,
  required,
  schema,
  validate,
  validateAsync,
} from '@angular/forms/signals';

import {
  DOCUMENT_PATTERNS,
  NAME_PATTERN,
  PASSWORD_PATTERN,
  PHONE_PATTERN,
} from '../../../shared/validators/user-validators';
import { UserFormModel } from './user-form.model';

/** Campos únicos en `users` que se verifican contra Firestore. */
export type UniqueUserField = 'documentNumber' | 'institutionalCode' | 'email';

/** Devuelve true si el valor ya está registrado. */
export type UniqueChecker = (field: UniqueUserField, value: string) => Promise<boolean>;

const UNIQUE_DEBOUNCE_MS = 400;

/** Patrón opcional: vacío es válido (lo controla `required` si aplica). */
function optionalPattern(path: SchemaPath<string>, regex: RegExp, message: string): void {
  validate(path, ({ value }) => {
    const v = value().trim();
    return v && !regex.test(v) ? { kind: 'pattern', message } : null;
  });
}

/** Valida en Firestore que el valor no exista. Solo corre cuando las validaciones síncronas pasan. */
function unique(
  path: SchemaPath<string>,
  field: UniqueUserField,
  normalize: (v: string) => string,
  message: string,
  isTaken: UniqueChecker,
): void {
  debounce(path, UNIQUE_DEBOUNCE_MS);
  validateAsync(path, {
    params: ({ value }) => normalize(value()) || undefined,
    factory: (params) =>
      resource({
        params,
        loader: ({ params: value }) => isTaken(field, value),
      }),
    onSuccess: (taken) => (taken ? { kind: 'unique', message } : null),
    // Si falla la consulta no bloqueamos; el servicio vuelve a validar al guardar.
    onError: () => null,
  });
}

/**
 * Reglas del formulario de registro de usuarios.
 * Toda la validación vive aquí, separada de la plantilla y del componente.
 */
export function userFormSchema(isTaken: UniqueChecker) {
  return schema<UserFormModel>((path) => {
    const { personal, contact, account } = path;

    // ---------- Datos personales ----------
    for (const [field, label] of [
      [personal.firstName, 'los nombres'],
      [personal.lastName, 'los apellidos'],
    ] as const) {
      required(field, { message: `Ingresa ${label}.` });
      maxLength(field, 50, { message: 'Máximo 50 caracteres.' });
      optionalPattern(field, NAME_PATTERN, 'Solo letras, espacios, apóstrofes y guiones.');
    }

    required(personal.documentNumber, { message: 'Ingresa el número de documento.' });
    // La longitud máxima depende del tipo (DNI 8, CE/Pasaporte 12) y el directive la aplica como maxlength.
    maxLength(personal.documentNumber, ({ valueOf }) => (valueOf(personal.documentType) === 'DNI' ? 8 : 12), {
      message: 'Demasiados caracteres.',
    });
    // Validación cruzada: el formato depende del tipo de documento.
    validate(personal.documentNumber, ({ value, valueOf }) => {
      const v = value().trim();
      const rule = DOCUMENT_PATTERNS[valueOf(personal.documentType)];
      return v && !rule.pattern.test(v) ? { kind: 'pattern', message: `Debe tener ${rule.hint}.` } : null;
    });
    unique(personal.documentNumber, 'documentNumber', (v) => v.trim().toUpperCase(),
      'Ya existe un usuario con ese número de documento.', isTaken);

    required(personal.birthDate, { message: 'Ingresa la fecha de nacimiento.' });
    validate(personal.birthDate, ({ value }) => {
      if (!value()) return null;
      const date = new Date(`${value()}T00:00:00`);
      const today = new Date();
      if (Number.isNaN(date.getTime())) return { kind: 'date', message: 'La fecha no es válida.' };
      if (date > today) return { kind: 'futureDate', message: 'La fecha no puede ser futura.' };
      const oldest = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
      return date < oldest ? { kind: 'date', message: 'La fecha no es válida.' } : null;
    });

    required(personal.gender, { message: 'Selecciona el sexo.' });

    // ---------- Contacto ----------
    required(contact.email, { message: 'Ingresa el correo.' });
    email(contact.email, { message: 'Ingresa un correo válido.' });
    maxLength(contact.email, 100, { message: 'Máximo 100 caracteres.' });
    unique(contact.email, 'email', (v) => v.trim().toLowerCase(), 'Ya existe un usuario con ese correo.', isTaken);

    maxLength(contact.phone, 9, { message: 'Máximo 9 dígitos.' });
    optionalPattern(contact.phone, PHONE_PATTERN, 'Debe tener 9 dígitos y empezar con 9.');
    maxLength(contact.address, 150, { message: 'Máximo 150 caracteres.' });

    // ---------- Cuenta institucional ----------
    // El código institucional (PREFIJO-DOCUMENTO) se genera; su unicidad la garantiza el documento.
    required(account.role, { message: 'Selecciona un rol.' });

    required(account.password, { message: 'Ingresa una contraseña.' });
    minLength(account.password, 8, { message: 'Mínimo 8 caracteres.' });
    optionalPattern(account.password, PASSWORD_PATTERN, 'Debe incluir letras y números.');

    required(account.confirmPassword, { message: 'Confirma la contraseña.' });
    // Validación cruzada entre campos.
    validate(account.confirmPassword, ({ value, valueOf }) =>
      value() && value() !== valueOf(account.password)
        ? { kind: 'passwordMismatch', message: 'Las contraseñas no coinciden.' }
        : null,
    );
  });
}
