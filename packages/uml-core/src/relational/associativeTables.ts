import type { RelationalTable } from './types';

/**
 * Tabla asociativa "pura" (N:M sin atributos propios): origen many-to-many
 * y exactamente las 2 columnas FK que forman toda su PK. Se usa tanto por
 * el generador Spring Boot (para saber qué tablas NO necesitan Entity
 * propia, se resuelven como @ManyToMany) como por el generador de Domain
 * Manifest (Fase 12) -- vive acá, en relational/, para que ningún
 * generador tenga que redefinirla ni reinterpretar el RelationalModel dos
 * veces de formas distintas.
 */
export function isPureJoinTable(table: RelationalTable): boolean {
  return table.origin.kind === 'many-to-many' && table.columns.length === 2;
}
