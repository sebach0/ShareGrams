import type { UMLModel } from './types';

export function createEmptyModel(): UMLModel {
  return { classes: [], relationships: [] };
}

/**
 * Los ids se generan en el punto de entrada del comando (UI, IA, importador),
 * nunca dentro del reducer, para que el mismo comando produzca el mismo
 * resultado si se reenvía o se aplica en más de una réplica (necesario desde
 * Fase 4 para colaboración).
 */
export function generateId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.randomUUID() exige un "secure context" (HTTPS o localhost) y no
  // existe en HTTP plano (ej. un deploy académico sin dominio/certificado).
  // crypto.getRandomValues() sí funciona en cualquier contexto.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
