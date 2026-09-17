import { describe, expect, it } from 'vitest';
import { parseMultiplicity } from '../src/model/multiplicity';

describe('parseMultiplicity', () => {
  it('acepta cotas numéricas', () => {
    expect(parseMultiplicity({ lower: 0, upper: 1 })).toEqual({ lower: 0, upper: 1 });
  });

  it('acepta "*" como cota superior', () => {
    expect(parseMultiplicity({ lower: 1, upper: '*' })).toEqual({ lower: 1, upper: '*' });
  });

  it('acepta una cota superior numérica venida como string', () => {
    expect(parseMultiplicity({ lower: '0', upper: '5' })).toEqual({ lower: 0, upper: 5 });
  });

  it('devuelve null si falta el objeto', () => {
    expect(parseMultiplicity(undefined)).toBeNull();
    expect(parseMultiplicity(null)).toBeNull();
  });

  it('devuelve null si la cota inferior no es un entero válido', () => {
    expect(parseMultiplicity({ lower: 'muchos', upper: 1 })).toBeNull();
  });

  it('devuelve null si la cota superior no es ni entero ni "*"', () => {
    expect(parseMultiplicity({ lower: 0, upper: 'muchos' })).toBeNull();
  });
});
