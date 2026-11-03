import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { CircleCheck, Clock, Hourglass, Users, UserX } from 'lucide-angular';
import { catchError, of, switchMap } from 'rxjs';

import {
  ATTENDANCE_SOURCE_LABELS,
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
  Attendance,
  AttendanceStatus,
  attendanceId,
} from '../../core/models/attendance.model';
import { courseLabel } from '../../core/models/course.model';
import { ClassSession, SESSION_STATUS_BADGE, SESSION_STATUS_LABELS } from '../../core/models/session.model';
import { fullName } from '../../core/models/user.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { errorMessage } from '../../core/services/error-message';
import { tsMillis, tsToDate } from '../../core/services/firestore.utils';
import { SessionService } from '../../core/services/session.service';
import { StatCard } from '../../shared/components/stat-card';
import { TsDatePipe } from '../../shared/pipes/ts-date.pipe';
import { downloadCsv, fileDate } from '../../shared/utils/csv';
import { DialogService } from '../../shared/dialogs/dialog.service';
import { SessionQr } from './session-qr';
import { ToastService } from '../../shared/toast/toast.service';

type RowStatus = AttendanceStatus | 'PENDING';

interface Row {
  studentId: string;
  code: string | null;
  name: string;
  record: Attendance | undefined;
  status: RowStatus;
}

/** W11 — Asistencia en tiempo real. Solo muestra sesiones de cursos visibles para el usuario. */
@Component({
  selector: 'app-live-attendance',
  imports: [DatePipe, TsDatePipe, StatCard, SessionQr],
  template: `
    <h1 class="page-title">Asistencia en vivo</h1>

    <div class="card mt-4">
      <label for="session" class="label">Sesión</label>
      <select id="session" class="input max-w-2xl" #sel [value]="sessionId() ?? ''" (change)="select(sel.value)">
        <option value="">Selecciona una sesión</option>
        @for (s of sessions(); track s.id) {
          <option [value]="s.id">
            {{ s.status === 'ACTIVE' ? '● ' : '' }}{{ s.title }} — {{ courseName(s.courseId) }} ({{ s.startsAt | tsDate | date: 'dd/MM HH:mm' }})
          </option>
        }
      </select>
    </div>

    @if (error() || scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ error() || scope.error() }}</p>
    }
    @if (message()) {
      <p role="status" class="alert-success mt-4">{{ message() }}</p>
    }

    @if (session(); as s) {
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-on-surface">{{ s.title }}</h2>
          <p class="text-sm text-on-surface-variant">
            {{ courseName(s.courseId) }} · {{ s.startsAt | tsDate | date: 'dd/MM/yyyy HH:mm' }} – {{ s.expiresAt | tsDate | date: 'HH:mm' }}
            @if (s.lateAfter) { · tardanza desde {{ s.lateAfter | tsDate | date: 'HH:mm' }} }
          </p>
        </div>
        <div class="flex items-center gap-2">
          @if (s.status === 'ACTIVE') {
            <span class="inline-flex items-center gap-1.5 rounded-full bg-status-active/10 px-3 py-1 text-xs font-bold text-status-active"
              role="status" aria-label="Actualización en tiempo real activa">
              <span class="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-active opacity-75"></span>
                <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-active"></span>
              </span>
              EN VIVO
            </span>
          }
          <span [class]="sessionBadge[s.status]">{{ sessionStatus[s.status] }}</span>
          @if (s.status === 'ACTIVE') {
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="close(s)">Cerrar sesión</button>
          }
        </div>
      </div>

      @if (s.status === 'ACTIVE') {
        <p class="mt-2 text-sm text-on-surface-variant" aria-live="polite">
          <strong class="text-status-active">{{ registeredCount() }}</strong> de {{ rows().length }} estudiantes han registrado su asistencia.
        </p>
      }

      <section class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Indicadores" aria-live="polite">
        <app-stat-card label="Total inscritos" [value]="rows().length" [icon]="icons.enrolled" />
        <app-stat-card label="Presentes" [value]="count('PRESENT')" [icon]="icons.present" />
        <app-stat-card label="Tardanzas" [value]="count('LATE')" [icon]="icons.late" />
        <app-stat-card [label]="s.status === 'ACTIVE' ? 'Pendientes' : 'Sin registro'" [value]="count('PENDING')" [icon]="icons.pending" />
        <app-stat-card label="Faltas / justificadas" [value]="count('ABSENT') + ' / ' + count('JUSTIFIED')" [icon]="icons.absent" />
      </section>

      <div class="mt-4 grid gap-4" [class.lg:grid-cols-3]="s.status === 'ACTIVE'">
        @if (s.status === 'ACTIVE') {
          <app-session-qr [sessionId]="s.id" [courseId]="s.courseId" [active]="s.status === 'ACTIVE'" />
        }

        <section [class.lg:col-span-2]="s.status === 'ACTIVE'" aria-labelledby="table-title">
          <h3 id="table-title" class="sr-only">Registros</h3>
          <div class="card grid gap-3 sm:grid-cols-3">
            <div class="sm:col-span-2">
              <label for="search" class="label">Buscar</label>
              <input id="search" type="search" class="input" placeholder="Nombre o código" #q (input)="search.set(q.value)" />
            </div>
            <div>
              <label for="status" class="label">Estado</label>
              <select id="status" class="input" #st (change)="statusFilter.set($any(st.value))">
                <option value="">Todos</option>
                <option value="PENDING">Pendiente / sin registro</option>
                @for (x of statuses; track x) {
                  <option [value]="x">{{ statusLabels[x] }}</option>
                }
              </select>
            </div>
          </div>

          <div class="mt-3 flex justify-end">
            <button type="button" class="btn btn-secondary btn-sm" (click)="exportCsv(s)">Exportar CSV</button>
          </div>

          <div class="table-wrap mt-2">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Hora de registro</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Fuente</th>
                  <th scope="col">Corregir</th>
                </tr>
              </thead>
              <tbody>
                @for (r of filtered(); track r.studentId) {
                  <tr>
                    <td>{{ r.code || '—' }}</td>
                    <td class="font-medium text-on-surface">{{ r.name }}</td>
                    <td class="whitespace-nowrap">{{ r.record?.registeredAt | tsDate | date: 'HH:mm:ss' }}</td>
                    <td>
                      @if (r.status === 'PENDING') {
                        <span class="badge badge-gray">{{ s.status === 'ACTIVE' ? 'Pendiente' : 'Sin registro' }}</span>
                      } @else {
                        <span [class]="statusBadge[r.status]">{{ statusLabels[r.status] }}</span>
                      }
                      @if (r.record?.updateReason) {
                        <span class="block text-xs text-on-surface-variant" [title]="r.record?.updateReason ?? ''">Corregida</span>
                      }
                    </td>
                    <td>{{ r.record ? sourceLabels[r.record.source] || r.record.source : '—' }}</td>
                    <td>
                      <label class="sr-only" [for]="'fix-' + r.studentId">Corregir estado de {{ r.name }}</label>
                      <select [id]="'fix-' + r.studentId" class="input py-1 text-xs" [disabled]="busy()"
                        #fix (change)="correct(s, r, $any(fix.value)); fix.value = ''">
                        <option value="">Cambiar…</option>
                        @for (x of statuses; track x) {
                          @if (x !== r.status) {
                            <option [value]="x">{{ statusLabels[x] }}</option>
                          }
                        }
                      </select>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="text-center text-on-surface-variant">Sin estudiantes inscritos.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    } @else if (sessionId()) {
      <p class="mt-4 text-sm text-on-surface-variant">Cargando sesión… (si no carga, no tienes acceso a ella)</p>
    }
  `,
})
export class LiveAttendance {
  /** Query param ?sessionId= */
  readonly sessionIdParam = input<string | undefined>(undefined, { alias: 'sessionId' });

  protected readonly scope = inject(AcademicScopeService);
  private readonly sessionService = inject(SessionService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  protected readonly icons = { enrolled: Users, present: CircleCheck, late: Clock, pending: Hourglass, absent: UserX };
  protected readonly statuses = ATTENDANCE_STATUSES;
  protected readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  protected readonly statusBadge = ATTENDANCE_STATUS_BADGE;
  protected readonly sourceLabels = ATTENDANCE_SOURCE_LABELS;
  protected readonly sessionStatus = SESSION_STATUS_LABELS;
  protected readonly sessionBadge = SESSION_STATUS_BADGE;

  protected readonly sessionId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly statusFilter = signal<RowStatus | ''>('');
  protected readonly busy = signal(false);
  private readonly toast = inject(ToastService);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] });
  private readonly allSessions = toSignal(this.scope.sessions$, { initialValue: [] as ClassSession[] });
  private readonly enrollments = toSignal(this.scope.enrollments$, { initialValue: [] });
  private readonly students = toSignal(this.scope.students$, { initialValue: [] });

  /** Activas primero. */
  protected readonly sessions = computed(() =>
    [...this.allSessions()].sort(
      (a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || tsMillis(b.startsAt) - tsMillis(a.startsAt),
    ),
  );

  /** Documento de la sesión en vivo (estado, cierre). */
  protected readonly session = toSignal(
    toObservable(this.sessionId).pipe(
      switchMap((id) => (id ? this.sessionService.getById(id).pipe(catchError(() => of(null))) : of(null))),
    ),
    { initialValue: null as ClassSession | null },
  );

  /** Registros de asistencia de la sesión, en tiempo real. */
  private readonly records = toSignal(
    toObservable(this.session).pipe(
      switchMap((s) =>
        s
          ? this.attendanceService.getBySession(s).pipe(
            catchError((e) => {
              this.error.set(errorMessage(e));
              return of([] as Attendance[]);
            }),
          )
          : of([] as Attendance[]),
      ),
    ),
    { initialValue: [] as Attendance[] },
  );

  constructor() {
    effect(() => {
      const preset = this.sessionIdParam();
      if (preset) this.sessionId.set(preset);
    });
  }

  protected readonly rows = computed<Row[]>(() => {
    const s = this.session();
    if (!s) return [];
    const byStudent = new Map(this.students().map((p) => [p.uid, p]));
    const byKey = new Map(this.records().map((r) => [attendanceId(r.sessionId, r.studentId), r]));
    const enrolled = this.enrollments().filter(
      (e) => e.courseId === s.courseId && e.status === 'ACTIVE' && tsMillis(e.enrolledAt) <= tsMillis(s.expiresAt),
    );
    // Incluye registros de estudiantes que ya no figuran inscritos (para no ocultarlos).
    const ids = new Set([...enrolled.map((e) => e.studentId), ...this.records().map((r) => r.studentId)]);
    return [...ids]
      .map((studentId): Row => {
        const profile = byStudent.get(studentId);
        const record = byKey.get(attendanceId(s.id, studentId));
        return {
          studentId,
          code: profile?.institutionalCode ?? null,
          name: profile ? fullName(profile) : studentId,
          record,
          status: record?.status ?? 'PENDING',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.rows().filter(
      (r) =>
        (!this.statusFilter() || r.status === this.statusFilter()) &&
        (!term || `${r.name} ${r.code ?? ''}`.toLowerCase().includes(term)),
    );
  });

  protected count(status: RowStatus): number {
    return this.rows().filter((r) => r.status === status).length;
  }

  /** Cuántos ya registraron (presente, tardanza o justificado), para el contador en vivo. */
  protected readonly registeredCount = computed(() => this.rows().filter((r) => r.status !== 'PENDING' && r.status !== 'ABSENT').length);

  protected courseName(id: string): string {
    return courseLabel(this.courses().find((c) => c.id === id));
  }

  protected select(id: string): void {
    this.sessionId.set(id || null);
    this.error.set(null);
    this.message.set(null);
    void this.router.navigate([], { queryParams: { sessionId: id || null }, replaceUrl: true });
  }

  async correct(session: ClassSession, row: Row, status: AttendanceStatus | ''): Promise<void> {
    if (!status) return;
    const reason = await this.dialogs.reason({
      title: 'Corregir asistencia',
      message: `${row.name} quedará como "${this.statusLabels[status]}".`,
      confirmText: 'Guardar corrección',
      tone: 'warning',
    });
    if (!reason) return;
    await this.run(async () => {
      await this.attendanceService.correct(session, row.studentId, status, reason, row.record);
      return `Asistencia de ${row.name} actualizada.`;
    });
  }

  async close(session: ClassSession): Promise<void> {
    const ok = await this.dialogs.confirm({
      title: 'Cerrar sesión de clase',
      message: `"${session.title}" se cerrará y ya no se podrá registrar asistencia por QR.`,
      confirmText: 'Cerrar sesión',
      tone: 'danger',
    });
    if (!ok) return;
    await this.run(async () => {
      await this.sessionService.close(session);
      return 'Sesión cerrada.';
    });
  }

  exportCsv(session: ClassSession): void {
    downloadCsv(
      `asistencia-${session.title.replace(/[^\w-]+/g, '_')}-${fileDate()}`,
      ['Código', 'Nombre', 'Hora de registro', 'Estado', 'Fuente', 'Motivo de corrección'],
      this.filtered().map((r) => [
        r.code,
        r.name,
        tsToDate(r.record?.registeredAt)?.toLocaleString('es-PE') ?? '',
        r.status === 'PENDING' ? 'Sin registro' : this.statusLabels[r.status],
        r.record?.source ?? '',
        r.record?.updateReason ?? '',
      ]),
    );
  }

  private async run(action: () => Promise<string>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const msg = await action();
      if (msg) this.toast.success(msg);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
