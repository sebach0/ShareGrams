import type { RelationalType } from '../../relational/types';
import type { DomainType } from './types';

/**
 * Único lugar que traduce un RelationalType (Fase 9) a un tipo de dominio
 * normalizado para el Manifest -- independiente del mapeo a Java
 * (javaTypeMapper.ts de la Fase 10), que es un mapeo distinto con un
 * propósito distinto (generar código Java, no describir un contrato para
 * un cliente genérico). `enum`/`uuid`/`relation` existen en DomainType
 * para cuando la Fase 9 los soporte -- hoy nunca se producen, el switch
 * exhaustivo solo cubre los 8 RelationalType reales.
 */
export function mapRelationalTypeToDomain(type: RelationalType): DomainType | null {
  switch (type) {
    case 'VARCHAR':
      return 'string';
    case 'INTEGER':
      return 'integer';
    case 'BIGINT':
      return 'long';
    case 'NUMERIC':
      return 'decimal';
    case 'BOOLEAN':
      return 'boolean';
    case 'DATE':
      return 'date';
    case 'TIMESTAMP':
      return 'datetime';
    case 'DOUBLE_PRECISION':
      return 'decimal';
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return null;
    }
  }
}
