type Cell = string | number | boolean | null | undefined;

function escapeCell(value: Cell): string {
  let text = value == null ? '' : String(value);
  // Evita inyección de fórmulas al abrir en Excel.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Descarga un CSV (UTF-8 con BOM para que Excel respete tildes). */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function fileDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
