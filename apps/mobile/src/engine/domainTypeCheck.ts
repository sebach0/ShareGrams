import type { DomainType } from '../domain/manifest';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Compara un valor JS contra un DomainType del Manifest (regla 20/25: el id
 * nunca se asume integer -- puede ser long/uuid/string, y esto lee siempre
 * el tipo real declarado por el backend conectado). Los valores numéricos
 * (integer/long/decimal) deben llegar como `number` de JSON, nunca como
 * string -- DynamicCommand es un contrato estructurado, no un formulario de
 * texto (esa conversión, si hace falta, es responsabilidad de la UI que
 * arma el comando, no de este motor).
 */
export function matchesDomainType(value: unknown, type: DomainType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
    case 'long':
      return typeof value === 'number' && Number.isInteger(value);
    case 'decimal':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return typeof value === 'string' && DATE_RE.test(value);
    case 'datetime':
      return typeof value === 'string' && DATETIME_RE.test(value);
    case 'uuid':
      return typeof value === 'string' && UUID_RE.test(value);
    case 'enum':
      return typeof value === 'string';
    case 'relation':
      return typeof value === 'string' || typeof value === 'number';
    default:
      return false;
  }
}
