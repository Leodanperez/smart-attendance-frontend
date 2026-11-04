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

import { UserProfile, fullName } from '../../core/models/user.model';

let nextId = 0;

/**
 * Selector múltiple de estudiantes con buscador (nombre, código institucional, correo o documento).
 * Componente controlado: recibe `selected` (uids) y emite `selectedChange`.
 */
@Component({
  selector: 'app-student-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label [for]="uid + '-combo'" class="label">{{ label() }}</label>
    <div class="relative">
      <button [id]="uid + '-combo'" type="button" class="input flex w-full items-center justify-between gap-2 text-left"
        aria-haspopup="listbox" [attr.aria-expanded]="open()" [disabled]="disabled()" (click)="open.set(!open())">
        <span class="truncate" [class.text-on-surface-variant]="!selectedStudents().length">{{ summary() }}</span>
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
            <label [for]="uid + '-search'" class="sr-only">Buscar estudiante</label>
            <input [id]="uid + '-search'" type="search" class="input" autocomplete="off"
              placeholder="Buscar por nombre, código, correo o documento"
              [value]="query()" (input)="query.set($any($event.target).value)" />
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="font-medium text-on-surface-variant">{{ visible().length }} estudiante(s)</span>
              <span class="flex gap-1">
                <button type="button" class="rounded-full px-3 py-1 font-medium text-primary transition-colors hover:bg-primary-fixed" (click)="selectVisible()">Seleccionar visibles</button>
                <button type="button" class="rounded-full px-3 py-1 font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high" (click)="clear()">Limpiar</button>
              </span>
            </div>
          </div>

          <ul class="max-h-72 space-y-0.5 overflow-y-auto p-2" role="listbox" aria-multiselectable="true"
            aria-label="Estudiantes disponibles">
            @for (s of visible(); track s.uid) {
              <li role="option" [attr.aria-selected]="isSelected(s.uid)">
                <label class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-container-high"
                  [class.bg-primary-fixed]="isSelected(s.uid)">
                  <input type="checkbox" class="size-4 accent-primary" [checked]="isSelected(s.uid)" (change)="toggle(s.uid)" />
                  <span aria-hidden="true"
                    class="grid size-9 shrink-0 place-items-center rounded-full bg-surface-container-high text-xs font-semibold text-on-surface-variant">
                    {{ initials(s) }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-on-surface">{{ name(s) }}</span>
                    <span class="block truncate text-xs text-on-surface-variant">
                      {{ s.institutionalCode || 'Sin código' }} · {{ s.email }}
                    </span>
                  </span>
                </label>
              </li>
            } @empty {
              <li class="px-3 py-8 text-center text-sm text-on-surface-variant">No hay estudiantes con ese filtro.</li>
            }
          </ul>
        </div>
      }
    </div>

    @if (selectedStudents().length) {
      <ul class="mt-3 flex flex-wrap gap-2" aria-label="Estudiantes seleccionados">
        @for (s of selectedStudents(); track s.uid) {
          <li class="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary-fixed py-1 pr-1 pl-3 text-xs font-medium text-primary">
            <span class="truncate">{{ name(s) }}{{ s.institutionalCode ? ' · ' + s.institutionalCode : '' }}</span>
            <button type="button"
              class="grid size-5 place-items-center rounded-full transition-colors hover:bg-primary/15"
              [attr.aria-label]="'Quitar a ' + name(s)" (click)="toggle(s.uid)">
              <svg aria-hidden="true" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class StudentPicker {
  readonly students = input.required<readonly UserProfile[]>();
  readonly selected = input<readonly string[]>([]);
  readonly label = input('Estudiantes');
  readonly placeholder = input('Buscar y seleccionar estudiantes…');
  readonly disabled = input(false);
  readonly selectedChange = output<string[]>();

  protected readonly uid = `student-picker-${nextId++}`;
  protected readonly name = fullName;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly selectedStudents = computed(() => {
    const ids = new Set(this.selected());
    return this.students().filter((s) => ids.has(s.uid));
  });

  protected readonly summary = computed(() => {
    const n = this.selectedStudents().length;
    return n ? `${n} estudiante(s) seleccionado(s)` : this.placeholder();
  });

  protected readonly visible = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.students()
      .filter(
        (s) =>
          !term ||
          [fullName(s), s.institutionalCode, s.email, s.documentNumber]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term)),
      )
      .slice()
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'));
  });

  protected isSelected(uid: string): boolean {
    return this.selected().includes(uid);
  }

  protected toggle(uid: string): void {
    const current = this.selected();
    this.selectedChange.emit(current.includes(uid) ? current.filter((x) => x !== uid) : [...current, uid]);
  }

  protected selectVisible(): void {
    this.selectedChange.emit([...new Set([...this.selected(), ...this.visible().map((s) => s.uid)])]);
  }

  protected clear(): void {
    this.selectedChange.emit([]);
  }

  protected initials(s: UserProfile): string {
    return (
      fullName(s)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase() || '?'
    );
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}
