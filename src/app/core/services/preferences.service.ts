import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type FontScale = 'normal' | 'large' | 'xlarge';

export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  normal: 'Normal',
  large: 'Grande',
  xlarge: 'Muy grande',
};

const FONT_SIZES: Record<FontScale, string> = {
  normal: '100%',
  large: '112.5%',
  xlarge: '125%',
};

// Preferencia visual no sensible: se puede guardar en localStorage.
const STORAGE_KEY = 'sa.fontScale';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly document = inject(DOCUMENT);

  readonly fontScale = signal<FontScale>(this.read());

  constructor() {
    effect(() => {
      const scale = this.fontScale();
      this.document.documentElement.style.fontSize = FONT_SIZES[scale];
      try {
        localStorage.setItem(STORAGE_KEY, scale);
      } catch {
        // localStorage no disponible: se ignora.
      }
    });
  }

  private read(): FontScale {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'large' || value === 'xlarge' ? value : 'normal';
    } catch {
      return 'normal';
    }
  }
}
