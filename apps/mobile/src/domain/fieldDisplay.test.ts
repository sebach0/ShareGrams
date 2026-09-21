import { describe, expect, it } from 'vitest';
import { formatFieldValue } from './fieldDisplay';
import type { FieldDefinition } from './manifest';

function field(type: FieldDefinition['type']): FieldDefinition {
  return { name: 'x', label: 'X', type, required: false, editable: true, generated: false };
}

describe('formatFieldValue', () => {
  it('null/undefined/vacío -> "—"', () => {
    expect(formatFieldValue(null, field('string'))).toBe('—');
    expect(formatFieldValue(undefined, field('string'))).toBe('—');
    expect(formatFieldValue('', field('string'))).toBe('—');
  });

  it('string -> tal cual', () => {
    expect(formatFieldValue('Carlos', field('string'))).toBe('Carlos');
  });

  it('integer/long -> String()', () => {
    expect(formatFieldValue(15, field('integer'))).toBe('15');
    expect(formatFieldValue(15, field('long'))).toBe('15');
  });

  it('decimal -> dos decimales', () => {
    expect(formatFieldValue(19.5, field('decimal'))).toBe('19.50');
    expect(formatFieldValue(19, field('decimal'))).toBe('19.00');
  });

  it('boolean -> Sí/No', () => {
    expect(formatFieldValue(true, field('boolean'))).toBe('Sí');
    expect(formatFieldValue(false, field('boolean'))).toBe('No');
  });

  it('date -> tal cual (ya viene ISO legible)', () => {
    expect(formatFieldValue('2026-10-09', field('date'))).toBe('2026-10-09');
  });

  it('datetime -> "T" cambiada por espacio', () => {
    expect(formatFieldValue('2026-10-09T14:30:00', field('datetime'))).toBe('2026-10-09 14:30:00');
  });

  it('enum -> tal cual', () => {
    expect(formatFieldValue('PENDIENTE', field('enum'))).toBe('PENDIENTE');
  });
});
