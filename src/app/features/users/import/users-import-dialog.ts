import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-angular';

import { ROLE_LABELS, USER_STATUS_LABELS } from '../../../core/models/user.model';
import { errorMessage } from '../../../core/services/error-message';
import { UserService } from '../../../core/services/user.service';
import { Icon } from '../../../shared/components/icon';
import { downloadCsv, fileDate } from '../../../shared/utils/csv';
import {
  IMPORT_HEADERS,
  IMPORT_TEMPLATE_ROWS,
  ImportIssue,
  ParsedImport,
  parseImport,
  readImportFile,
} from './users-import';

export interface UsersImportDialogData {
  /** true si ya existe un usuario con ese documento o correo (para marcar duplicados contra la BD). */
  isTaken: (field: 'documentNumber' | 'email', value: string) => boolean;
}

type Step = 'pick' | 'preview' | 'importing' | 'done';

interface ImportResult {
  line: number;
  name: string;
  document: string;
  ok: boolean;
  reason?: string;
}

/**
 * Importar usuarios desde Excel/CSV: elegir archivo → vista previa (filas válidas vs. con error) →
 * crear uno por uno con barra de progreso → resumen final. Cierra con `true` si creó al menos uno
 * (para que la lista se recargue).
 */
@Component({
  selector: 'app-users-import-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[46rem] max-w-full' },
  template: `
    <div class="animate-scale-in flex max-h-[85vh] flex-col rounded-2xl border border-outline-variant/40 bg-surface-container shadow-2xl">
      <div class="flex items-center gap-3 border-b border-outline-variant/50 px-6 py-4">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary">
          <app-icon [name]="icons.file" [size]="20" />
        </span>
        <h2 id="import-title" class="flex-1 text-lg font-semibold text-on-surface">Importar usuarios desde Excel</h2>
        @if (step() !== 'importing') {
          <button type="button" class="btn-icon" aria-label="Cerrar" (click)="close()">
            <app-icon [name]="icons.close" />
          </button>
        }
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-6">
        @switch (step()) {
          @case ('pick') {
            <p class="text-sm text-on-surface-variant">
              Sube un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con las columnas:
              <span class="font-mono text-xs">nombres, apellidos, tipodni, dni, fechanac, sexo, correo, rol, estado, contraseña</span>.
            </p>
            <p class="mt-2 text-xs text-on-surface-variant">
              El código institucional se genera solo. Si dejas vacíos <strong>correo</strong> y <strong>contraseña</strong>,
              también se generan a partir del DNI (igual que al registrar uno por uno).
            </p>

            <button type="button" class="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline" (click)="downloadTemplate()">
              <app-icon [name]="icons.download" [size]="16" /> Descargar plantilla de ejemplo (CSV)
            </button>

            <label
              class="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-surface-container-high"
            >
              <app-icon [name]="icons.upload" [size]="28" class="text-on-surface-variant" />
              <span class="text-sm font-medium text-on-surface">Haz clic para elegir un archivo</span>
              <span class="text-xs text-on-surface-variant">.xlsx o .csv</span>
              <input type="file" accept=".xlsx,.csv" class="sr-only" (change)="onFile($event)" />
            </label>

            @if (error()) {
              <p role="alert" class="alert-error mt-4">{{ error() }}</p>
            }
          }

          @case ('preview') {
            @if (parsed(); as p) {
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div class="card p-3 text-center">
                  <p class="text-2xl font-bold text-on-surface">{{ p.total }}</p>
                  <p class="text-xs text-on-surface-variant">Filas leídas</p>
                </div>
                <div class="card p-3 text-center">
                  <p class="text-2xl font-bold text-status-active">{{ p.valid.length }}</p>
                  <p class="text-xs text-on-surface-variant">Listas para subir</p>
                </div>
                <div class="card p-3 text-center">
                  <p class="text-2xl font-bold text-status-danger">{{ p.issues.length }}</p>
                  <p class="text-xs text-on-surface-variant">Con errores</p>
                </div>
              </div>

              @if (p.issues.length) {
                <h3 class="mt-5 flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <app-icon [name]="icons.alert" [size]="16" class="text-status-danger" /> Filas que NO se van a subir
                </h3>
                <div class="table-wrap mt-2 max-h-56 overflow-y-auto">
                  <table class="table">
                    <thead>
                      <tr>
                        <th scope="col">Fila</th>
                        <th scope="col">Nombre</th>
                        <th scope="col">DNI</th>
                        <th scope="col">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (i of p.issues; track i.line) {
                        <tr>
                          <td>{{ i.line }}</td>
                          <td>{{ i.name }}</td>
                          <td class="font-mono text-xs">{{ i.document }}</td>
                          <td class="text-xs text-status-danger">{{ i.reason }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              @if (p.valid.length) {
                <h3 class="mt-5 text-sm font-semibold text-on-surface">Se van a crear ({{ p.valid.length }})</h3>
                <div class="table-wrap mt-2 max-h-56 overflow-y-auto">
                  <table class="table">
                    <thead>
                      <tr>
                        <th scope="col">Fila</th>
                        <th scope="col">Nombre</th>
                        <th scope="col">DNI</th>
                        <th scope="col">Correo</th>
                        <th scope="col">Rol</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of p.valid; track r.line) {
                        <tr>
                          <td>{{ r.line }}</td>
                          <td>{{ r.input.firstName }} {{ r.input.lastName }}</td>
                          <td class="font-mono text-xs">{{ r.input.documentNumber }}</td>
                          <td class="font-mono text-xs">{{ r.input.email }}</td>
                          <td>{{ roleLabels[r.input.role] }}</td>
                          <td>{{ statusLabels[r.input.status] }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="alert-error mt-4">Ninguna fila es válida. Corrige el archivo y vuelve a subirlo.</p>
              }
            }
          }

          @case ('importing') {
            <div class="flex flex-col items-center gap-4 py-6 text-center">
              <app-icon [name]="icons.loader" [size]="28" class="animate-spin text-primary" />
              <p class="text-sm font-medium text-on-surface">
                Creando usuario {{ progressDone() }} de {{ progressTotal() }}…
              </p>
              <div class="h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-container-high">
                <div class="h-full rounded-full bg-primary transition-all duration-200" [style.width.%]="progressPercent()"></div>
              </div>
              <p class="text-xs text-on-surface-variant">{{ currentName() }}</p>
            </div>
          }

          @case ('done') {
            <div class="flex flex-col items-center gap-2 py-4 text-center">
              <app-icon [name]="icons.check" [size]="32" class="text-status-active" />
              <p class="text-base font-semibold text-on-surface">
                {{ successCount() }} de {{ results().length }} usuario(s) creado(s)
              </p>
            </div>

            @if (notUploaded().length) {
              <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
                <h3 class="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <app-icon [name]="icons.alert" [size]="16" class="text-status-danger" />
                  No se subieron ({{ notUploaded().length }})
                </h3>
                <button type="button" class="btn btn-secondary btn-sm" (click)="downloadNotUploaded()">
                  <app-icon [name]="icons.download" [size]="14" /> Descargar lista (CSV)
                </button>
              </div>
              <div class="table-wrap mt-2 max-h-72 overflow-y-auto">
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">Fila</th>
                      <th scope="col">Nombre</th>
                      <th scope="col">DNI</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of notUploaded(); track r.line) {
                      <tr>
                        <td>{{ r.line }}</td>
                        <td>{{ r.name }}</td>
                        <td class="font-mono text-xs">{{ r.document }}</td>
                        <td class="text-xs text-status-danger">{{ r.reason }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }
      </div>

      <div class="flex justify-end gap-3 border-t border-outline-variant/50 px-6 py-4">
        @switch (step()) {
          @case ('pick') {
            <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
          }
          @case ('preview') {
            <button type="button" class="btn btn-secondary" (click)="step.set('pick')">Elegir otro archivo</button>
            <button type="button" class="btn btn-primary" [disabled]="!parsed()?.valid?.length" (click)="startImport()">
              Subir {{ parsed()?.valid?.length }} usuario(s)
            </button>
          }
          @case ('importing') {
            <button type="button" class="btn btn-secondary" [disabled]="stopRequested()" (click)="stopRequested.set(true)">
              {{ stopRequested() ? 'Deteniendo…' : 'Detener' }}
            </button>
          }
          @case ('done') {
            <button type="button" class="btn btn-primary" (click)="ref.close(successCount() > 0)">Cerrar</button>
          }
        }
      </div>
    </div>
  `,
})
export class UsersImportDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly data = inject<UsersImportDialogData>(DIALOG_DATA);
  private readonly userService = inject(UserService);

  protected readonly icons = {
    file: FileSpreadsheet,
    upload: Upload,
    download: Download,
    close: X,
    alert: CircleAlert,
    check: CircleCheck,
    loader: LoaderCircle,
  };
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly statusLabels = USER_STATUS_LABELS;

  protected readonly step = signal<Step>('pick');
  protected readonly error = signal<string | null>(null);
  protected readonly parsed = signal<ParsedImport | null>(null);

  protected readonly progressDone = signal(0);
  protected readonly progressTotal = signal(0);
  protected readonly currentName = signal('');
  protected readonly progressPercent = computed(() =>
    this.progressTotal() ? Math.round((this.progressDone() / this.progressTotal()) * 100) : 0,
  );

  protected readonly results = signal<ImportResult[]>([]);
  protected readonly successCount = computed(() => this.results().filter((r) => r.ok).length);
  protected readonly failedResults = computed(() => this.results().filter((r) => !r.ok));

  protected readonly stopRequested = signal(false);
  /** Filas rechazadas al validar (se guardan al empezar para unirlas al resultado final). */
  private readonly previewIssues = signal<ImportIssue[]>([]);

  /** Todo lo que NO se subió: rechazadas al validar + las que fallaron al crear (o no se procesaron). */
  protected readonly notUploaded = computed<ImportIssue[]>(() =>
    [
      ...this.previewIssues(),
      ...this.failedResults().map((r) => ({
        line: r.line,
        name: r.name,
        document: r.document,
        reason: r.reason ?? 'Error desconocido',
      })),
    ].sort((a, b) => a.line - b.line),
  );

  downloadTemplate(): void {
    downloadCsv('plantilla-usuarios', [...IMPORT_HEADERS], IMPORT_TEMPLATE_ROWS);
  }

  async onFile(event: Event): Promise<void> {
    this.error.set(null);
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const rows = await readImportFile(file);
      const parsed = parseImport(rows);
      // Duplicados contra lo que ya existe en Firestore (además de los del propio archivo).
      for (const issue of this.markExistingDuplicates(parsed)) parsed.issues.push(issue);
      this.parsed.set(parsed);
      this.step.set('preview');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : errorMessage(e));
    } finally {
      (event.target as HTMLInputElement).value = '';
    }
  }

  /** Mueve a `issues` las filas válidas cuyo documento o correo ya existen en la base. */
  private markExistingDuplicates(parsed: ParsedImport): ImportIssue[] {
    const stillValid: typeof parsed.valid = [];
    const newIssues: ImportIssue[] = [];
    for (const row of parsed.valid) {
      const docTaken = this.data.isTaken('documentNumber', row.input.documentNumber);
      const emailTaken = this.data.isTaken('email', row.input.email);
      if (docTaken || emailTaken) {
        newIssues.push({
          line: row.line,
          name: `${row.input.firstName} ${row.input.lastName}`,
          document: row.input.documentNumber,
          reason: docTaken ? 'dni: ya registrado' : 'correo: ya registrado',
        });
      } else {
        stillValid.push(row);
      }
    }
    parsed.valid = stillValid;
    return newIssues;
  }

  async startImport(): Promise<void> {
    const parsed = this.parsed();
    if (!parsed?.valid.length) return;
    this.previewIssues.set(parsed.issues);
    this.stopRequested.set(false);
    this.step.set('importing');
    this.progressDone.set(0);
    this.progressTotal.set(parsed.valid.length);
    // Mientras se crean usuarios no se puede cerrar con Esc ni haciendo clic fuera.
    this.ref.disableClose = true;

    const results: ImportResult[] = [];
    let stopReason: string | null = null;
    for (const row of parsed.valid) {
      if (this.stopRequested()) stopReason ??= 'No se procesó: importación detenida.';
      const name = `${row.input.firstName} ${row.input.lastName}`;
      const base = { line: row.line, name, document: row.input.documentNumber };

      if (stopReason) {
        results.push({ ...base, ok: false, reason: stopReason });
        continue;
      }

      this.currentName.set(name);
      try {
        await this.userService.createUser(row.input);
        results.push({ ...base, ok: true });
      } catch (e) {
        results.push({ ...base, ok: false, reason: errorMessage(e) });
        // Firebase Auth limita las altas masivas: se corta para no seguir fallando una por una.
        if ((e as { code?: string } | null)?.code === 'auth/too-many-requests') {
          stopReason = 'No se procesó: Firebase limitó las altas por demasiados intentos. Reintenta más tarde.';
        }
      }
      this.progressDone.update((n) => n + 1);
    }

    this.ref.disableClose = false;
    this.results.set(results);
    this.step.set('done');
  }

  downloadNotUploaded(): void {
    downloadCsv(
      `usuarios-no-subidos-${fileDate()}`,
      ['Fila', 'Nombre', 'Documento', 'Motivo'],
      this.notUploaded().map((r) => [r.line, r.name, r.document, r.reason]),
    );
  }

  close(): void {
    this.ref.close(false);
  }
}
