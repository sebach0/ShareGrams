import type { RelationalType } from '../../relational/types';

export interface JavaType {
  /** Nombre del tipo tal como aparece en el código Java (ej. "BigDecimal"). */
  name: string;
  /** Import completo si el tipo no es java.lang (ej. "java.math.BigDecimal"); ausente para String/Integer/Long/Boolean. */
  importFqcn?: string;
}

/**
 * Única fuente de verdad para RelationalType -> tipo Java. Igual que
 * mapPrimitiveType en la Fase 9: switch exhaustivo (un RelationalType nuevo
 * sin mapear acá rompe la compilación) y null en runtime ante un valor que
 * llegue desde afuera del sistema de tipos, en vez de adivinar String.
 */
export function mapRelationalTypeToJava(type: RelationalType): JavaType | null {
  switch (type) {
    case 'VARCHAR':
      return { name: 'String' };
    case 'INTEGER':
      return { name: 'Integer' };
    case 'BIGINT':
      return { name: 'Long' };
    case 'DOUBLE_PRECISION':
      return { name: 'Double' };
    case 'BOOLEAN':
      return { name: 'Boolean' };
    case 'DATE':
      return { name: 'LocalDate', importFqcn: 'java.time.LocalDate' };
    case 'TIMESTAMP':
      return { name: 'LocalDateTime', importFqcn: 'java.time.LocalDateTime' };
    case 'NUMERIC':
      return { name: 'BigDecimal', importFqcn: 'java.math.BigDecimal' };
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return null;
    }
  }
}
