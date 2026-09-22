import { describe, expect, it } from 'vitest';
import { generateLocalId, isLocalId } from './localId';

describe('generateLocalId', () => {
  it('genera un id con el prefijo local: y forma de UUID', () => {
    const id = generateLocalId();
    expect(id).toMatch(/^local:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('genera ids distintos en cada llamada', () => {
    expect(generateLocalId()).not.toBe(generateLocalId());
  });
});

describe('isLocalId', () => {
  it('true para un id local', () => {
    expect(isLocalId('local:abc-123')).toBe(true);
  });

  it('false para un id numérico remoto', () => {
    expect(isLocalId(5)).toBe(false);
  });

  it('false para un string que no tiene el prefijo', () => {
    expect(isLocalId('5')).toBe(false);
  });
});
