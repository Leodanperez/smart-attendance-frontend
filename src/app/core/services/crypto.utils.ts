// Alfabeto sin caracteres ambiguos (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código aleatorio criptográficamente seguro (Web Crypto), sin sesgo de módulo. */
export function randomCode(length = 8): string {
  const limit = 256 - (256 % ALPHABET.length);
  const result: string[] = [];
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && result.length < length) result.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return result.join('');
}

/** SHA-256 en hexadecimal. El código se hashea en MAYÚSCULAS (el cliente lo normaliza al canjear). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
