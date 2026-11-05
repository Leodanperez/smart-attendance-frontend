import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  ApexAxisChartSeries,
  ApexNonAxisChartSeries,
  NgApexchartsModule,
} from 'ng-apexcharts';
import type { ApexOptions } from 'apexcharts';

import { ThemeService } from '../../core/services/theme.service';

export type ChartKind = 'bar' | 'bar-horizontal' | 'area' | 'line' | 'donut' | 'radialBar';

export interface ChartPoint {
  label: string;
  value: number;
}

/** Paleta de colores para los gráficos, derivada de los tokens --c-* de styles.css. */
interface ThemePalette {
  primary: string;
  onSurface: string;
  onSurfaceVariant: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  outlineVariant: string;
  active: string;
  warning: string;
  danger: string;
  info: string;
}

/** Espejo en TS de los tokens de styles.css (evita condiciones de carrera con getComputedStyle al togglear). */
const LIGHT_PALETTE: ThemePalette = {
  primary: '#3b82f6',
  onSurface: '#09090b',
  onSurfaceVariant: '#52525b',
  surfaceContainer: '#f4f4f5',
  surfaceContainerHigh: '#e9e9eb',
  outlineVariant: '#d4d4d8',
  active: '#10b981',
  warning: '#f59e0b',
  danger: '#dc2626',
  info: '#3b82f6',
};

const DARK_PALETTE: ThemePalette = {
  primary: '#3b82f6',
  onSurface: '#f4f4f5',
  onSurfaceVariant: '#a1a1aa',
  surfaceContainer: '#18181b',
  surfaceContainerHigh: '#27272a',
  outlineVariant: '#3f3f46',
  active: '#4edea3',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#60a5fa',
};

/**
 * Wrapper de ApexCharts integrado con el tema de la app.
 * Lee los tokens CSS (--c-*) y recolorea automáticamente al cambiar entre claro y oscuro.
 */
@Component({
  selector: 'app-chart',
  imports: [NgApexchartsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <figure class="card h-full">
      <figcaption class="font-medium text-on-surface">{{ title() }}</figcaption>
      @if (hasData()) {
        <div class="mt-2">
          <apx-chart
            [series]="options().series!"
            [chart]="options().chart!"
            [colors]="options().colors!"
            [plotOptions]="options().plotOptions!"
            [dataLabels]="options().dataLabels!"
            [stroke]="options().stroke!"
            [fill]="options().fill!"
            [grid]="options().grid!"
            [xaxis]="options().xaxis!"
            [yaxis]="options().yaxis!"
            [labels]="options().labels!"
            [legend]="options().legend!"
            [tooltip]="options().tooltip!"
            [states]="options().states!"
          />
        </div>
      } @else {
        <p class="mt-4 text-sm text-on-surface-variant">Sin datos para los filtros seleccionados.</p>
      }
    </figure>
  `,
})
export class Chart {
  private readonly theme = inject(ThemeService);

  readonly title = input.required<string>();
  readonly kind = input<ChartKind>('bar');
  readonly data = input<ChartPoint[]>([]);
  /** Máximo del eje de valores (p. ej. 100 para porcentajes). */
  readonly max = input<number | null>(null);
  /** Sufijo a mostrar en tooltips/etiquetas (p. ej. "%"). */
  readonly unit = input<string>('');
  /** Altura del gráfico en px. */
  readonly height = input<number>(260);

  protected readonly hasData = computed(() => this.data().length > 0);

  /** Paleta reactiva al tema: cambia al togglear claro/oscuro. */
  private readonly palette = computed<ThemePalette>(() =>
    this.theme.isDark() ? DARK_PALETTE : LIGHT_PALETTE,
  );

  protected readonly options = computed<ApexOptions>(() => {
    const kind = this.kind();
    const p = this.palette();
    const points = this.data();
    const unit = this.unit();
    const height = this.height();

    const base: ApexOptions = {
      chart: {
        type: this.apexType(kind),
        height,
        fontFamily: 'inherit',
        background: 'transparent',
        toolbar: { show: false },
        animations: { enabled: true, speed: 400 },
        parentHeightOffset: 0,
      },
      states: {
        hover: { filter: { type: 'lighten' } },
        active: { filter: { type: 'none' } },
      },
      tooltip: {
        theme: this.theme.isDark() ? 'dark' : 'light',
        y: { formatter: (v: number) => `${v}${unit}` },
      },
      legend: {
        labels: { colors: p.onSurfaceVariant },
        fontFamily: 'inherit',
      },
      grid: {
        borderColor: p.outlineVariant,
        strokeDashArray: 4,
        padding: { left: 8, right: 8 },
      },
    };

    if (kind === 'donut' || kind === 'radialBar') {
      return this.circularOptions(base, kind, points, p, unit);
    }
    return this.cartesianOptions(base, kind, points, p, unit);
  });

  private cartesianOptions(
    base: ApexOptions,
    kind: ChartKind,
    points: ChartPoint[],
    p: ThemePalette,
    unit: string,
  ): ApexOptions {
    const horizontal = kind === 'bar-horizontal';
    const isArea = kind === 'area';
    const isLine = kind === 'line' || isArea;
    const max = this.max();

    const series: ApexAxisChartSeries = [
      { name: this.title(), data: points.map((d) => d.value) },
    ];

    return {
      ...base,
      series,
      colors: [p.primary],
      plotOptions: {
        bar: {
          horizontal,
          borderRadius: 6,
          borderRadiusApplication: 'end',
          columnWidth: '55%',
          barHeight: '65%',
        },
      },
      dataLabels: { enabled: false },
      stroke: isLine
        ? { curve: 'smooth', width: 3, lineCap: 'round' }
        : { show: false, width: 0 },
      fill: isArea
        ? {
          type: 'gradient',
          gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 95] },
        }
        : { type: 'solid', opacity: 1 },
      xaxis: {
        categories: points.map((d) => d.label),
        labels: { style: { colors: p.onSurfaceVariant, fontFamily: 'inherit' } },
        axisBorder: { color: p.outlineVariant },
        axisTicks: { color: p.outlineVariant },
      },
      yaxis: {
        max: max ?? undefined,
        labels: {
          style: { colors: p.onSurfaceVariant, fontFamily: 'inherit' },
          formatter: (v: number) => `${Math.round(v)}${unit}`,
        },
      },
    };
  }

  private circularOptions(
    base: ApexOptions,
    kind: ChartKind,
    points: ChartPoint[],
    p: ThemePalette,
    unit: string,
  ): ApexOptions {
    const series: ApexNonAxisChartSeries = points.map((d) => d.value);
    const palette = [p.primary, p.active, p.warning, p.info, p.danger];

    if (kind === 'radialBar') {
      return {
        ...base,
        series,
        labels: points.map((d) => d.label),
        colors: palette,
        plotOptions: {
          radialBar: {
            hollow: { size: '58%' },
            track: { background: p.surfaceContainerHigh },
            dataLabels: {
              name: { color: p.onSurfaceVariant, fontFamily: 'inherit' },
              value: {
                color: p.onSurface,
                fontFamily: 'inherit',
                fontWeight: 700,
                formatter: (v: number) => `${Math.round(v)}${unit}`,
              },
            },
          },
        },
        stroke: { lineCap: 'round' },
      };
    }

    // donut
    return {
      ...base,
      series,
      labels: points.map((d) => d.label),
      colors: palette,
      stroke: { colors: [p.surfaceContainer], width: 2 },
      dataLabels: {
        enabled: true,
        style: { fontFamily: 'inherit', fontWeight: 600 },
        dropShadow: { enabled: false },
      },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              total: {
                show: true,
                color: p.onSurfaceVariant,
                fontFamily: 'inherit',
              },
              value: { color: p.onSurface, fontFamily: 'inherit', fontWeight: 700 },
            },
          },
        },
      },
      legend: { ...base.legend, position: 'bottom' },
    };
  }

  private apexType(kind: ChartKind): NonNullable<ApexOptions['chart']>['type'] {
    switch (kind) {
      case 'bar':
      case 'bar-horizontal':
        return 'bar';
      case 'area':
        return 'area';
      case 'line':
        return 'line';
      case 'donut':
        return 'donut';
      case 'radialBar':
        return 'radialBar';
    }
  }

}
