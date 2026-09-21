import type { FieldDefinition } from './manifest';

/**
 * Única fuente de verdad para mostrar un valor de campo como texto (regla
 * 14): la usan tanto la lista como el detalle, para que un cambio de
 * formato (por ejemplo cómo se ve un decimal) no haya que repetirlo en dos
 * lugares. Deliberadamente simple -- sin librerías de formateo de fecha/
 * i18n, ver regla 55 ("no sobreingenierizar").
 */
export function formatFieldValue(value: unknown, field: FieldDefinition): string {
  if (value === null || value === undefined || value === '') return '—';

  switch (field.type) {
    case 'boolean':
      return value ? 'Sí' : 'No';
    case 'decimal':
      return typeof value === 'number' ? value.toFixed(2) : String(value);
    case 'datetime':
      // El backend ya manda ISO ("2026-10-09T14:30:00") -- solo se cambia
      // la "T" por un espacio para que sea legible, sin reinterpretar el
      // valor ni asumir una zona horaria que el contrato no define.
      return typeof value === 'string' ? value.replace('T', ' ') : String(value);
    default:
      return String(value);
  }
}
