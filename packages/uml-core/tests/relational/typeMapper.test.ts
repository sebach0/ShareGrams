import { describe, expect, it } from 'vitest';
import { mapPrimitiveType } from '../../src/relational/typeMapper';
import { PRIMITIVE_TYPES } from '../../src/model/types';
import type { PrimitiveType } from '../../src/model/types';

describe('mapPrimitiveType', () => {
  const expected: Record<PrimitiveType, string> = {
    String: 'VARCHAR',
    Integer: 'INTEGER',
    Long: 'BIGINT',
    Double: 'DOUBLE_PRECISION',
    Boolean: 'BOOLEAN',
    Date: 'DATE',
    DateTime: 'TIMESTAMP',
    BigDecimal: 'NUMERIC',
  };

  it('mapea cada tipo primitivo soportado por el modelo UML', () => {
    for (const type of PRIMITIVE_TYPES) {
      expect(mapPrimitiveType(type)).toBe(expected[type]);
    }
  });

  it('cubre exactamente los mismos tipos que declara el modelo (ningún tipo primitivo queda sin mapeo)', () => {
    expect(Object.keys(expected).sort()).toEqual([...PRIMITIVE_TYPES].sort());
  });

  it('devuelve null ante un tipo desconocido llegado desde afuera del sistema de tipos', () => {
    expect(mapPrimitiveType('Money' as PrimitiveType)).toBeNull();
  });
});
