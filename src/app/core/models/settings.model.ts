/** Documento settings/general. */
export interface AppSettings {
  institutionName: string;
  defaultSessionMinutes: number;
  defaultLateAfterMinutes: number;
  lowAttendanceThreshold: number; // %
  qrRefreshSeconds: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  institutionName: 'Smart Attendance',
  defaultSessionMinutes: 90,
  defaultLateAfterMinutes: 15,
  lowAttendanceThreshold: 70,
  qrRefreshSeconds: 60,
};
