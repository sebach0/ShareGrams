import type { Multiplicity } from '../model/types';

/**
 * El transformador solo sabe interpretar 4 formas de multiplicidad: 0..1,
 * 1, 0..* y 1..* (que es lo mismo que decir: lower en {0,1}, y upper es 1 o
 * "*"). Cualquier otra cosa -- "*" con lower>1, un tope numérico exacto
 * como 2..5, etc. -- no tiene una regla determinista de FK/tabla asociativa
 * definida todavía, así que se rechaza explícitamente en vez de forzar una
 * interpretación.
 */
export function isSupportedMultiplicity(multiplicity: Multiplicity): boolean {
  if (multiplicity.lower !== 0 && multiplicity.lower !== 1) return false;
  return multiplicity.upper === 1 || multiplicity.upper === '*';
}

/** true si este extremo admite más de una instancia (upper "*" o >1). */
export function isToMany(multiplicity: Multiplicity): boolean {
  return multiplicity.upper === '*' || (typeof multiplicity.upper === 'number' && multiplicity.upper > 1);
}

/** true si este extremo es opcional (0 instancias válidas) -- determina si la FK que lo referencia puede ser NULL. */
export function isOptionalEnd(multiplicity: Multiplicity): boolean {
  return multiplicity.lower === 0;
}
