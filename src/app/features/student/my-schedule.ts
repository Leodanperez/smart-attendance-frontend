import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import {
  Course,
  WEEK_DAYS,
  WEEK_DAY_LABELS,
  WeekDay,
} from '../../core/models/course.model';
import { AcademicScopeService } from '../../core/services/academic-scope.service';

interface ScheduleItem {
  courseId: string;
  courseCode: string;
  courseName: string;
  section: string;
  room: string;
  start: string;
  end: string;
}

/** Mi horario (STUDENT): grilla semanal con los bloques de todos sus cursos inscritos. */
@Component({
  selector: 'app-my-schedule',
  imports: [RouterLink],
  template: `
    <h1 class="page-title">Mi horario</h1>
    <p class="page-subtitle">Horario semanal de tus cursos inscritos.</p>

    @if (scope.error()) {
      <p role="alert" class="alert-error mt-4">{{ scope.error() }}</p>
    }

    @if (!hasAny()) {
      <div class="card mt-6 text-center">
        <p class="text-sm text-on-surface-variant">
          Tus cursos todavía no tienen horario definido, o aún no estás inscrito en ninguno.
        </p>
      </div>
    } @else {
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        @for (day of daysWithClasses(); track day.day) {
          <section class="card" [attr.aria-labelledby]="'day-' + day.day">
            <h2 [id]="'day-' + day.day" class="font-semibold text-primary">{{ dayLabels[day.day] }}</h2>
            <ul class="mt-3 space-y-2">
              @for (item of day.items; track item.courseId + item.start) {
                <li class="rounded-lg border border-outline-variant/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-sm font-semibold text-on-surface">{{ item.start }}–{{ item.end }}</span>
                    <span class="font-mono text-xs text-on-surface-variant">{{ item.courseCode }}</span>
                  </div>
                  <a [routerLink]="['/courses', item.courseId]" class="mt-1 block truncate text-sm text-primary hover:underline">
                    {{ item.courseName }}
                  </a>
                  <p class="text-xs text-on-surface-variant">
                    Sección {{ item.section || '—' }}{{ item.room ? ' · Aula ' + item.room : '' }}
                  </p>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
})
export class MySchedule {
  protected readonly scope = inject(AcademicScopeService);
  private readonly courses = toSignal(this.scope.courses$, { initialValue: [] as Course[] });

  protected readonly dayLabels = WEEK_DAY_LABELS;

  /** Bloques de todos los cursos agrupados por día de la semana, ordenados por hora. */
  protected readonly daysWithClasses = computed(() => {
    const byDay = new Map<WeekDay, ScheduleItem[]>();
    for (const c of this.courses()) {
      for (const block of c.schedule ?? []) {
        const item: ScheduleItem = {
          courseId: c.id,
          courseCode: c.courseCode,
          courseName: c.name,
          section: c.section,
          room: c.room,
          start: block.start,
          end: block.end,
        };
        const list = byDay.get(block.day) ?? [];
        list.push(item);
        byDay.set(block.day, list);
      }
    }
    return WEEK_DAYS
      .filter((day) => byDay.has(day))
      .map((day) => ({
        day,
        items: byDay.get(day)!.sort((a, b) => a.start.localeCompare(b.start)),
      }));
  });

  protected readonly hasAny = computed(() => this.daysWithClasses().length > 0);
}
