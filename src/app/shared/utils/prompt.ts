/** Pide un motivo obligatorio. Devuelve null si se cancela o queda vacío. */
export function askReason(message: string): string | null {
  const value = window.prompt(message);
  if (value === null) return null;
  const reason = value.trim();
  if (!reason) {
    window.alert('El motivo es obligatorio.');
    return null;
  }
  return reason.slice(0, 500);
}

/** Motivo opcional: devuelve '' si se deja vacío, null si se cancela. */
export function askOptionalReason(message: string): string | null {
  const value = window.prompt(message);
  return value === null ? null : value.trim().slice(0, 500);
}
