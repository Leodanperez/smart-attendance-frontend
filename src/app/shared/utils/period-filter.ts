import { effect, inject, signal } from '@angular/core';

import { Course } from '../../core/models/course.model';
import { AcademicPeriodService } from '../../core/services/academic-period.service';

/**
 * Filtro de periodo reutilizable para pantallas con cursos.
 * Por defecto selecciona el periodo en curso (una sola vez); '' = todos.
 * Crear en un contexto de inyección (campo de componente).
 */
export class PeriodFilter {
  readonly periods = inject(AcademicPeriodService).periods;
  readonly periodId = signal('');

  constructor(initial?: () => string | undefined) {
    let applied = false;
    effect(() => {
      if (applied) return;
      const preset = initial?.();
      const active = this.periods().find((p) => p.status === 'ACTIVE');
      if (preset || active) {
        this.periodId.set(preset ?? active!.id);
        applied = true;
      }
    });
  }

  matches(course: Pick<Course, 'academicPeriodId'>): boolean {
    const id = this.periodId();
    return !id || course.academicPeriodId === id;
  }
}
