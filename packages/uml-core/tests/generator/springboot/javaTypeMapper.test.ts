import { describe, expect, it } from 'vitest';
import { mapRelationalTypeToJava } from '../../../src/generator/springboot/javaTypeMapper';
import type { RelationalType } from '../../../src/relational/types';

describe('mapRelationalTypeToJava', () => {
  const expected: Record<RelationalType, { name: string; importFqcn?: string }> = {
    VARCHAR: { name: 'String' },
    INTEGER: { name: 'Integer' },
    BIGINT: { name: 'Long' },
    DOUBLE_PRECISION: { name: 'Double' },
    BOOLEAN: { name: 'Boolean' },
    DATE: { name: 'LocalDate', importFqcn: 'java.time.LocalDate' },
    TIMESTAMP: { name: 'LocalDateTime', importFqcn: 'java.time.LocalDateTime' },
    NUMERIC: { name: 'BigDecimal', importFqcn: 'java.math.BigDecimal' },
  };

  it('mapea cada RelationalType real de la Fase 9 a un tipo Java', () => {
    for (const [type, expectedJavaType] of Object.entries(expected)) {
      expect(mapRelationalTypeToJava(type as RelationalType)).toEqual(expectedJavaType);
    }
  });

  it('devuelve null ante un tipo relacional desconocido', () => {
    expect(mapRelationalTypeToJava('MONEY' as RelationalType)).toBeNull();
  });
});
