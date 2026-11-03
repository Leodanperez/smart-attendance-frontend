import { Component, computed, input } from '@angular/core';

export interface BarDatum {
  label: string;
  value: number;
  /** Texto a mostrar (por defecto el valor). */
  display?: string;
}

/** Gráfico de barras horizontal ligero y accesible (los valores también se muestran como texto). */
@Component({
  selector: 'app-bar-chart',
  template: `
    <figure class="card h-full">
      <figcaption class="font-medium text-on-surface">{{ title() }}</figcaption>
      @if (data().length) {
        <ul class="mt-4 space-y-3">
          @for (item of data(); track item.label) {
            <li>
              <div class="flex justify-between gap-2 text-xs text-on-surface-variant">
                <span class="truncate">{{ item.label }}</span>
                <span class="font-medium text-on-surface">{{ item.display ?? item.value }}</span>
              </div>
              <div class="mt-1 h-2 rounded-full bg-surface-container-high" aria-hidden="true">
                <div class="h-2 rounded-full bg-primary" [style.width.%]="width(item.value)"></div>
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="mt-4 text-sm text-on-surface-variant">Sin datos para los filtros seleccionados.</p>
      }
    </figure>
  `,
})
export class BarChart {
  readonly title = input.required<string>();
  readonly data = input<BarDatum[]>([]);
  /** Máximo de la escala (p. ej. 100 para porcentajes). */
  readonly max = input<number | null>(null);

  private readonly scale = computed(
    () => this.max() ?? Math.max(1, ...this.data().map((d) => d.value)),
  );

  protected width(value: number): number {
    return Math.max(0, Math.min(100, (value / this.scale()) * 100));
  }
}
