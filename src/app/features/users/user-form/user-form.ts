import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FieldTree, FormField, TreeValidationResult, form, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  ArrowLeft,
  CircleAlert,
  Hash,
  IdCard,
  LoaderCircle,
  Lock,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  X,
} from 'lucide-angular';

import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  GENDERS,
  GENDER_LABELS,
  ROLE_LABELS,
  USER_ROLES,
  USER_STATUSES,
  USER_STATUS_LABELS,
  ROLE_CODE_PREFIX,
  buildInstitutionalCode,
} from '../../../core/models/user.model';
import { errorMessage } from '../../../core/services/error-message';
import { UserService } from '../../../core/services/user.service';
import { FieldError, showInvalid } from '../../../shared/components/field-error';
import { Icon } from '../../../shared/components/icon';
import { PasswordToggle } from '../../../shared/components/password-toggle';
import { ToastService } from '../../../shared/toast/toast.service';
import { UserFormModel, initialUserForm, toCreateUserInput } from './user-form.model';
import { userFormSchema } from './user-form.schema';

/**
 * Registro de usuarios (ADMIN) con Signal Forms.
 * - El modelo es un signal: única fuente de verdad.
 * - La validación vive en `userFormSchema` (síncrona, condicional, cruzada y asíncrona).
 * - Los errores del servidor se asignan al campo correspondiente.
 */
@Component({
  selector: 'app-user-form',
  imports: [FormField, RouterLink, FieldError, Icon, PasswordToggle],
  templateUrl: './user-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserForm {
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // Opciones de los selects
  protected readonly roles = USER_ROLES;
  protected readonly statuses = USER_STATUSES;
  protected readonly genders = GENDERS;
  protected readonly documentTypes = DOCUMENT_TYPES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly statusLabels = USER_STATUS_LABELS;
  protected readonly genderLabels = GENDER_LABELS;
  protected readonly documentTypeLabels = DOCUMENT_TYPE_LABELS;
  protected readonly invalid = showInvalid;
  protected readonly icons = {
    back: ArrowLeft,
    alert: CircleAlert,
    personal: IdCard,
    contact: Mail,
    account: ShieldCheck,
    code: Hash,
    mail: Mail,
    phone: Phone,
    address: MapPin,
    lock: Lock,
    save: Save,
    cancel: X,
    loader: LoaderCircle,
  };

  /** Modelo del formulario. */
  protected readonly model = signal<UserFormModel>(initialUserForm());

  /** Árbol de campos con su estado (valor, errores, touched, pending…). */
  protected readonly userForm = form(
    this.model,
    userFormSchema((field, value) => this.userService.isTaken(field, value)),
  );

  protected readonly submitAttempted = signal(false);

  // Estado derivado
  protected readonly isDni = computed(() => this.userForm.personal.documentType().value() === 'DNI');
  /** Vista previa del código que se generará: STU-/TEA-/ADM- + número de documento. */
  protected readonly codePreview = computed(() => {
    const role = this.userForm.account.role().value();
    const doc = this.userForm.personal.documentNumber().value();
    if (role) return buildInstitutionalCode(role, doc) ?? `${ROLE_CODE_PREFIX[role]}-DOCUMENTO`;
    return doc.trim() ? `ROL-${doc.trim().toUpperCase()}` : 'Elige un rol e ingresa el documento';
  });
  /** Errores del servidor sin campo asociado. */
  protected readonly formErrors = computed(() =>
    this.userForm()
      .errors()
      .map((e) => e.message)
      .filter((m): m is string => !!m),
  );
  protected readonly invalidCount = computed(() => this.userForm().errorSummary().length);

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitAttempted.set(true);

    await submit(this.userForm, {
      action: async (fields) => {
        try {
          const input = toCreateUserInput(fields().value());
          const uid = await this.userService.createUser(input);
          this.toast.success(`${input.firstName} ${input.lastName} · ${this.codePreview()}`, { title: 'Usuario registrado' });
          await this.router.navigate(['/users', uid]);
          return null;
        } catch (error) {
          return this.toFormErrors(error, fields);
        }
      },
      onInvalid: () => this.focusFirstInvalid(),
    });
  }

  /** Traduce errores de Firebase a errores del formulario, en el campo que corresponda. */
  private toFormErrors(error: unknown, fields: FieldTree<UserFormModel>): TreeValidationResult {
    const message = errorMessage(error);
    this.toast.error(message, { title: 'No se pudo registrar' });
    const code = (error as { code?: string } | null)?.code;
    const fieldByCode: Record<string, FieldTree<string>> = {
      'auth/email-already-in-use': fields.contact.email,
      'auth/invalid-email': fields.contact.email,
      'app/document-in-use': fields.personal.documentNumber,
      'app/institutional-code-in-use': fields.personal.documentNumber,
      'auth/weak-password': fields.account.password,
    };
    const target = code ? fieldByCode[code] : undefined;
    if (target) queueMicrotask(() => this.focusFirstInvalid());
    return target ? { kind: 'server', message, fieldTree: target } : { kind: 'server', message };
  }

  private focusFirstInvalid(): void {
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
  }
}
