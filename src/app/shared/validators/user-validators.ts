import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

import { DocumentType } from '../../core/models/user.model';

export const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
export const PHONE_PATTERN = /^9\d{8}$/;
export const INSTITUTIONAL_CODE_PATTERN = /^[A-Za-z0-9-]{3,20}$/;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export const DOCUMENT_PATTERNS: Record<DocumentType, { pattern: RegExp; hint: string }> = {
  DNI: { pattern: /^\d{8}$/, hint: '8 dígitos' },
  CE: { pattern: /^[A-Za-z0-9]{9,12}$/, hint: '9 a 12 caracteres' },
  PASSPORT: { pattern: /^[A-Za-z0-9]{6,12}$/, hint: '6 a 12 caracteres' },
};

export const nameValidators = [Validators.required, Validators.maxLength(50), Validators.pattern(NAME_PATTERN)];

export function documentValidators(type: DocumentType) {
  return [Validators.required, Validators.pattern(DOCUMENT_PATTERNS[type].pattern)];
}

/** Fecha no futura y edad máxima de 100 años. */
export const birthDateValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as string;
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { invalidDate: true };
  const today = new Date();
  if (date > today) return { futureDate: true };
  const minDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
  if (date < minDate) return { tooOld: true };
  return null;
};

export const passwordsMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
};

export const todayIso = () => new Date().toISOString().slice(0, 10);
