import type { PrimitiveType } from '../model/types';
import type { RelationalType } from './types';

/**
 * Único lugar que traduce un PrimitiveType UML a un tipo relacional lógico.
 * PrimitiveType es una unión cerrada (8 valores) validada por TypeScript en
 * todo el resto del código, así que en la práctica un tipo "no soportado"
 * no debería poder llegar acá -- pero el `switch` es exhaustivo (el `default`
 * fuerza un error de compilación si se agrega un PrimitiveType nuevo sin
 * mapearlo acá) y devuelve null en runtime en vez de adivinar un VARCHAR,
 * por si el valor llega desde afuera del sistema de tipos (JSON externo,
 * versión vieja de un modelo guardado, etc.).
 */
export function mapPrimitiveType(type: PrimitiveType): RelationalType | null {
  switch (type) {
    case 'String':
      return 'VARCHAR';
    case 'Integer':
      return 'INTEGER';
    case 'Long':
      return 'BIGINT';
    case 'Double':
      return 'DOUBLE_PRECISION';
    case 'Boolean':
      return 'BOOLEAN';
    case 'Date':
      return 'DATE';
    case 'DateTime':
      return 'TIMESTAMP';
    case 'BigDecimal':
      return 'NUMERIC';
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return null;
    }
  }
}
