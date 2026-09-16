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
  return crypto.randomUUID();
}
