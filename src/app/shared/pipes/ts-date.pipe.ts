import { Pipe, PipeTransform } from '@angular/core';

import { tsToDate } from '../../core/services/firestore.utils';

/** Convierte Timestamp de Firestore a Date para usar con el pipe date. */
@Pipe({ name: 'tsDate' })
export class TsDatePipe implements PipeTransform {
  transform(value: unknown): Date | null {
    return tsToDate(value);
  }
}
