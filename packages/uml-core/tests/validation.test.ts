import { describe, expect, it } from 'vitest';
import { isValidModel, validateModel } from '../src/model/validation';
import { createEmptyModel } from '../src/model/factory';
import type { UMLModel } from '../src/model/types';

describe('validateModel', () => {
  it('acepta un modelo vacío', () => {
    expect(validateModel(createEmptyModel())).toEqual([]);
    expect(isValidModel(createEmptyModel())).toBe(true);
  });

  it('acepta un modelo consistente', () => {
    const model: UMLModel = {
      classes: [
        { id: 'c1', name: 'Cliente', attributes: [{ id: 'a1', name: 'nombre', type: 'String' }], position: { x: 0, y: 0 } },
        { id: 'c2', name: 'Pedido', attributes: [], position: { x: 10, y: 10 } },
      ],
      relationships: [
        {
          id: 'r1',
          type: 'ASSOCIATION',
          sourceClassId: 'c1',
          targetClassId: 'c2',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 0, upper: '*' },
        },
      ],
    };
    expect(isValidModel(model)).toBe(true);
  });

  it('detecta ids de clase duplicados', () => {
    const model: UMLModel = {
      classes: [
        { id: 'c1', name: 'Cliente', attributes: [], position: { x: 0, y: 0 } },
        { id: 'c1', name: 'Pedido', attributes: [], position: { x: 10, y: 10 } },
      ],
      relationships: [],
    };
    const errors = validateModel(model);
    expect(errors.some((e) => e.code === 'DUPLICATE_CLASS_ID')).toBe(true);
  });

  it('detecta relaciones que apuntan a clases inexistentes', () => {
    const model: UMLModel = {
      classes: [{ id: 'c1', name: 'Cliente', attributes: [], position: { x: 0, y: 0 } }],
      relationships: [
        {
          id: 'r1',
          type: 'ASSOCIATION',
          sourceClassId: 'c1',
          targetClassId: 'no-existe',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 0, upper: '*' },
        },
      ],
    };
    const errors = validateModel(model);
    expect(errors.some((e) => e.code === 'DANGLING_RELATIONSHIP')).toBe(true);
  });

  it('detecta atributos duplicados dentro de la misma clase', () => {
    const model: UMLModel = {
      classes: [
        {
          id: 'c1',
          name: 'Cliente',
          attributes: [
            { id: 'a1', name: 'nombre', type: 'String' },
            { id: 'a1', name: 'correo', type: 'String' },
          ],
          position: { x: 0, y: 0 },
        },
      ],
      relationships: [],
    };
    const errors = validateModel(model);
    expect(errors.some((e) => e.code === 'DUPLICATE_ATTRIBUTE_ID')).toBe(true);
  });
});
