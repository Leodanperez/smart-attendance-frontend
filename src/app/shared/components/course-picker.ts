import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { semesterLabel } from '../../core/models/career.model';
import { Course } from '../../core/models/course.model';

let nextId = 0;

/**
 * Selector de cursos: filtro por carrera + combobox con buscador.
 * - `multiple=false`: elige un curso (se cierra al elegir).
 * - `multiple=true`: elige varios (checkboxes, chips y "Seleccionar visibles").
 * Es un componente controlado: recibe `selected` y emite `selectedChange`.
 */
@Component({
  selector: 'app-course-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid gap-4 sm:grid-cols-3">
      <div>
        <label [for]="uid + '-career'" class="label">Carrera</label>
        <select [id]="uid + '-career'" class="input" #cf [value]="careerFilter()" (change)="careerFilter.set(cf.value)">
          <option value="">Todas las carreras</option>
          @for (ca of careerOptions(); track ca.id) {
            <option [value]="ca.id">{{ ca.name }}</option>
          }
        </select>
      </div>

      <!-- Combobox: buscador + selección -->
      <div class="relative sm:col-span-2">
        <label [for]="uid + '-combo'" class="label">{{ label() }}</label>
        <button [id]="uid + '-combo'" type="button" class="input flex w-full items-center justify-between gap-2 text-left"
          aria-haspopup="listbox" [attr.aria-expanded]="open()" (click)="open.set(!open())">
          <span class="truncate" [class.text-on-surface-variant]="!selectedCourses().length">{{ summary() }}</span>
          <svg
            aria-hidden="true"
            class="size-4 shrink-0 text-on-surface-variant transition-transform duration-200"
            [class.rotate-180]="open()"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          ><path d="m6 9 6 6 6-6" /></svg>
        </button>

        @if (open()) {
          <div class="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container shadow-2xl ring-1 ring-black/5">
            <div class="border-b border-outline-variant/50 p-3">
              <label [for]="uid + '-search'" class="sr-only">Buscar curso</label>
              <input [id]="uid + '-search'" type="search" class="input" autocomplete="off"
                placeholder="Buscar por nombre, código, sección o carrera"
                [value]="query()" (input)="query.set($any($event.target).value)" />
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span class="font-medium text-on-surface-variant">{{ visibleCourses().length }} curso(s)</span>
                <span class="flex gap-1">
                  @if (multiple()) {
                    <button type="button" class="rounded-full px-3 py-1 font-medium text-primary transition-colors hover:bg-primary-fixed" (click)="selectVisible()">Seleccionar visibles</button>
                  }
                  <button type="button" class="rounded-full px-3 py-1 font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high" (click)="clear()">Limpiar</button>
                </span>
              </div>
            </div>

            <ul class="max-h-72 space-y-0.5 overflow-y-auto p-2" role="listbox"
              [attr.aria-multiselectable]="multiple()" aria-label="Cursos disponibles">
              @for (c of visibleCourses(); track c.id) {
                <li role="option" [attr.aria-selected]="isSelected(c.id)">
                  <label
                    class="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-container-high"
                    [class.bg-primary-fixed]="isSelected(c.id)"
                  >
                    @if (multiple()) {
                      <input type="checkbox" class="mt-1 size-4 accent-primary" [checked]="isSelected(c.id)" (change)="toggle(c.id)" />
                    } @else {
                      <input type="radio" [name]="uid" class="mt-1 size-4 accent-primary" [checked]="isSelected(c.id)" (click)="pick(c.id)" />
                    }
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-2">
                        <span class="truncate text-sm font-medium text-on-surface">{{ c.name }}</span>
                        <span class="shrink-0 rounded-md bg-surface-container-high px-1.5 py-0.5 text-xs font-medium text-on-surface-variant">
                          Sec. {{ c.section || '—' }}
                        </span>
                        @if (c.status === 'INACTIVE') {
                          <span class="shrink-0 rounded-md bg-status-danger/10 px-1.5 py-0.5 text-xs font-medium text-status-danger">Inactivo</span>
                        }
                      </span>
                      <span class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-on-surface-variant">
                        <span class="font-medium">{{ c.courseCode }}</span>
                        <span>{{ c.careerName || 'Sin carrera' }}</span>
                        <span>{{ semesterLabel(c.semester) }}</span>
                        <span>{{ c.academicPeriodName || '—' }}</span>
                      </span>
                    </span>
                  </label>
                </li>
              } @empty {
                <li class="px-3 py-8 text-center text-sm text-on-surface-variant">No hay cursos con ese filtro.</li>
              }
            </ul>
          </div>
        }
      </div>
    </div>

    @if (multiple() && selectedCourses().length) {
      <ul class="mt-4 flex flex-wrap gap-2" aria-label="Cursos seleccionados">
        @for (c of selectedCourses(); track c.id) {
          <li class="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary-fixed py-1 pr-1 pl-3 text-xs font-medium text-primary">
            <span class="truncate">{{ c.name }} ({{ c.section || '—' }}) · {{ c.careerName || 'Sin carrera' }}</span>
            <button type="button"
              class="grid size-5 place-items-center rounded-full transition-colors hover:bg-primary/15"
              [attr.aria-label]="'Quitar ' + c.name" (click)="toggle(c.id)">
              <svg aria-hidden="true" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class CoursePicker {
  readonly courses = input.required<readonly Course[]>();
  readonly selected = input<readonly string[]>([]);
  readonly multiple = input(false);
  readonly label = input('Curso');
  readonly placeholder = input('Buscar y seleccionar curso…');
  readonly selectedChange = output<string[]>();

  protected readonly uid = `course-picker-${nextId++}`;
  protected readonly semesterLabel = semesterLabel;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly careerFilter = signal('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Carreras presentes en los cursos recibidos. */
  protected readonly careerOptions = computed(() => {
    const map = new Map<string, string>();
    for (const c of this.courses()) {
      if (c.careerId) map.set(c.careerId, c.careerName ?? c.careerId);
    }
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  /** Cursos filtrados por carrera y por el texto del buscador. */
  protected readonly visibleCourses = computed(() => {
    const term = this.query().trim().toLowerCase();
    const career = this.careerFilter();
    return this.courses()
      .filter((c) => !career || c.careerId === career)
      .filter(
        (c) =>
          !term ||
          [c.name, c.courseCode, c.section, c.room, c.careerName, c.academicPeriodName]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term)),
      );
  });

  protected readonly selectedCourses = computed(() => {
    const ids = new Set(this.selected());
    return this.courses().filter((c) => ids.has(c.id));
  });

  /** Texto del botón del combobox. */
  protected readonly summary = computed(() => {
    const list = this.selectedCourses();
    if (!list.length) return this.placeholder();
    if (this.multiple()) return `${list.length} curso(s) seleccionado(s)`;
    const c = list[0];
    return `${c.name} · Sec. ${c.section || '—'} · ${c.courseCode}`;
  });

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected toggle(id: string): void {
    const current = this.selected();
    this.selectedChange.emit(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  /** Modo único: elige y cierra. */
  protected pick(id: string): void {
    this.selectedChange.emit([id]);
    this.open.set(false);
    this.query.set('');
  }

  protected selectVisible(): void {
    this.selectedChange.emit([...new Set([...this.selected(), ...this.visibleCourses().map((c) => c.id)])]);
  }

  protected clear(): void {
    this.selectedChange.emit([]);
  }

  /** Cierra el desplegable al hacer clic fuera. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}
