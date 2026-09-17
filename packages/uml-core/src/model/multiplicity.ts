import type { Multiplicity } from './types';

/**
 * Interpreta una multiplicidad que llega de una fuente externa no tipada
 * (una tool call de IA, un campo de formulario, un XMI parseado) hacia el
 * tipo interno. Devuelve null si no se puede interpretar con confianza --
 * a propósito no "adivina" un valor por defecto, eso lo decide quien llama.
 */
export function parseMultiplicity(raw: { lower: unknown; upper: unknown } | null | undefined): Multiplicity | null {
  if (!raw) return null;
  const lower = typeof raw.lower === 'number' ? raw.lower : Number(raw.lower);
  const upper = parseUpper(raw.upper);
  if (!Number.isInteger(lower) || upper === null) return null;
  return { lower, upper };
}

function parseUpper(value: unknown): number | '*' | null {
  if (value === '*') return '*';
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}
