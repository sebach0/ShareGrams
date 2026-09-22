import { describe, expect, it } from 'vitest';
import { isLocalId } from './localId';

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
