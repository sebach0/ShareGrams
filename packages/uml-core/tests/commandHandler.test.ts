import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/engine/CommandHandler';
import { createEmptyModel } from '../src/model/factory';
import type { UMLModel } from '../src/model/types';
import type { CommandResult } from '../src/commands/types';

function expectOk(result: CommandResult): UMLModel {
  if (!result.ok) {
    throw new Error(`Expected ok, got error ${result.error.code}: ${result.error.message}`);
  }
  return result.model;
}

function expectFail(result: CommandResult, code: string): void {
  if (result.ok) {
    throw new Error('Expected failure, got ok');
  }
  expect(result.error.code).toBe(code);
}

describe('CREATE_CLASS', () => {
  it('crea una clase nueva', () => {
    const model = createEmptyModel();
    const result = applyCommand(model, {
      type: 'CREATE_CLASS',
      classId: 'c1',
      name: 'Cliente',
      position: { x: 0, y: 0 },
    });
    const next = expectOk(result);
    expect(next.classes).toHaveLength(1);
    expect(next.classes[0].name).toBe('Cliente');
    expect(next.classes[0].attributes).toEqual([]);
  });

  it('rechaza nombre vacío', () => {
    const result = applyCommand(createEmptyModel(), {
      type: 'CREATE_CLASS',
      classId: 'c1',
      name: '   ',
      position: { x: 0, y: 0 },
    });
    expectFail(result, 'INVALID_NAME');
  });

  it('rechaza nombres duplicados (case-insensitive)', () => {
    let model = expectOk(
      applyCommand(createEmptyModel(), {
        type: 'CREATE_CLASS',
        classId: 'c1',
        name: 'Cliente',
        position: { x: 0, y: 0 },
      }),
    );
    const result = applyCommand(model, {
      type: 'CREATE_CLASS',
      classId: 'c2',
      name: 'cliente',
      position: { x: 10, y: 10 },
    });
    expectFail(result, 'DUPLICATE_NAME');
  });

  it('rechaza id duplicado', () => {
    let model = expectOk(
      applyCommand(createEmptyModel(), {
        type: 'CREATE_CLASS',
        classId: 'c1',
        name: 'Cliente',
        position: { x: 0, y: 0 },
      }),
    );
    const result = applyCommand(model, {
      type: 'CREATE_CLASS',
      classId: 'c1',
      name: 'Pedido',
      position: { x: 10, y: 10 },
    });
    expectFail(result, 'DUPLICATE_ID');
  });
});

describe('UPDATE_CLASS y MOVE_CLASS', () => {
  function modelWithOneClass(): UMLModel {
    return expectOk(
      applyCommand(createEmptyModel(), {
        type: 'CREATE_CLASS',
        classId: 'c1',
        name: 'Cliente',
        position: { x: 0, y: 0 },
      }),
    );
  }

  it('renombra una clase existente', () => {
    const next = expectOk(
      applyCommand(modelWithOneClass(), { type: 'UPDATE_CLASS', classId: 'c1', name: 'Customer' }),
    );
    expect(next.classes[0].name).toBe('Customer');
  });

  it('falla si la clase no existe', () => {
    const result = applyCommand(modelWithOneClass(), {
      type: 'UPDATE_CLASS',
      classId: 'no-existe',
      name: 'X',
    });
    expectFail(result, 'CLASS_NOT_FOUND');
  });

  it('mueve una clase', () => {
    const next = expectOk(
      applyCommand(modelWithOneClass(), {
        type: 'MOVE_CLASS',
        classId: 'c1',
        position: { x: 100, y: 200 },
      }),
    );
    expect(next.classes[0].position).toEqual({ x: 100, y: 200 });
  });
});

describe('DELETE_CLASS', () => {
  it('elimina la clase y en cascada sus relaciones', () => {
    let model = createEmptyModel();
    model = expectOk(
      applyCommand(model, { type: 'CREATE_CLASS', classId: 'c1', name: 'Cliente', position: { x: 0, y: 0 } }),
    );
    model = expectOk(
      applyCommand(model, { type: 'CREATE_CLASS', classId: 'c2', name: 'Pedido', position: { x: 10, y: 10 } }),
    );
    model = expectOk(
      applyCommand(model, {
        type: 'CREATE_RELATIONSHIP',
        relationshipId: 'r1',
        relationshipType: 'ASSOCIATION',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        sourceMultiplicity: { lower: 1, upper: 1 },
        targetMultiplicity: { lower: 0, upper: '*' },
      }),
    );

    const next = expectOk(applyCommand(model, { type: 'DELETE_CLASS', classId: 'c1' }));
    expect(next.classes).toHaveLength(1);
    expect(next.relationships).toHaveLength(0);
  });
});

describe('atributos', () => {
  function modelWithOneClass(): UMLModel {
    return expectOk(
      applyCommand(createEmptyModel(), {
        type: 'CREATE_CLASS',
        classId: 'c1',
        name: 'Cliente',
        position: { x: 0, y: 0 },
      }),
    );
  }

  it('agrega un atributo', () => {
    const next = expectOk(
      applyCommand(modelWithOneClass(), {
        type: 'ADD_ATTRIBUTE',
        classId: 'c1',
        attributeId: 'a1',
        name: 'nombre',
        attributeType: 'String',
      }),
    );
    expect(next.classes[0].attributes).toEqual([{ id: 'a1', name: 'nombre', type: 'String' }]);
  });

  it('rechaza atributos duplicados dentro de la misma clase', () => {
    const model = expectOk(
      applyCommand(modelWithOneClass(), {
        type: 'ADD_ATTRIBUTE',
        classId: 'c1',
        attributeId: 'a1',
        name: 'nombre',
        attributeType: 'String',
      }),
    );
    const result = applyCommand(model, {
      type: 'ADD_ATTRIBUTE',
      classId: 'c1',
      attributeId: 'a2',
      name: 'Nombre',
      attributeType: 'String',
    });
    expectFail(result, 'DUPLICATE_NAME');
  });

  it('actualiza un atributo', () => {
    const model = expectOk(
      applyCommand(modelWithOneClass(), {
        type: 'ADD_ATTRIBUTE',
        classId: 'c1',
        attributeId: 'a1',
        name: 'nombre',
        attributeType: 'String',
      }),
    );
    const next = expectOk(
      applyCommand(model, {
        type: 'UPDATE_ATTRIBUTE',
        classId: 'c1',
        attributeId: 'a1',
        name: 'edad',
        attributeType: 'Integer',
      }),
    );
    expect(next.classes[0].attributes[0]).toEqual({ id: 'a1', name: 'edad', type: 'Integer' });
  });

  it('elimina un atributo', () => {
    const model = expectOk(
      applyCommand(modelWithOneClass(), {
        type: 'ADD_ATTRIBUTE',
        classId: 'c1',
        attributeId: 'a1',
        name: 'nombre',
        attributeType: 'String',
      }),
    );
    const next = expectOk(applyCommand(model, { type: 'DELETE_ATTRIBUTE', classId: 'c1', attributeId: 'a1' }));
    expect(next.classes[0].attributes).toHaveLength(0);
  });
});

describe('relaciones y multiplicidad', () => {
  function modelWithTwoClasses(): UMLModel {
    let model = createEmptyModel();
    model = expectOk(
      applyCommand(model, { type: 'CREATE_CLASS', classId: 'c1', name: 'Cliente', position: { x: 0, y: 0 } }),
    );
    model = expectOk(
      applyCommand(model, { type: 'CREATE_CLASS', classId: 'c2', name: 'Pedido', position: { x: 10, y: 10 } }),
    );
    return model;
  }

  it('crea una asociación con multiplicidad en ambos extremos', () => {
    const next = expectOk(
      applyCommand(modelWithTwoClasses(), {
        type: 'CREATE_RELATIONSHIP',
        relationshipId: 'r1',
        relationshipType: 'ASSOCIATION',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        sourceMultiplicity: { lower: 1, upper: 1 },
        targetMultiplicity: { lower: 0, upper: '*' },
      }),
    );
    expect(next.relationships).toHaveLength(1);
  });

  it('rechaza una asociación sin multiplicidad', () => {
    const result = applyCommand(modelWithTwoClasses(), {
      type: 'CREATE_RELATIONSHIP',
      relationshipId: 'r1',
      relationshipType: 'ASSOCIATION',
      sourceClassId: 'c1',
      targetClassId: 'c2',
    });
    expectFail(result, 'MISSING_MULTIPLICITY');
  });

  it('crea una generalización sin multiplicidad', () => {
    const next = expectOk(
      applyCommand(modelWithTwoClasses(), {
        type: 'CREATE_RELATIONSHIP',
        relationshipId: 'r1',
        relationshipType: 'GENERALIZATION',
        sourceClassId: 'c1',
        targetClassId: 'c2',
      }),
    );
    expect(next.relationships[0].sourceMultiplicity).toBeUndefined();
  });

  it('rechaza multiplicidad en una generalización', () => {
    const result = applyCommand(modelWithTwoClasses(), {
      type: 'CREATE_RELATIONSHIP',
      relationshipId: 'r1',
      relationshipType: 'GENERALIZATION',
      sourceClassId: 'c1',
      targetClassId: 'c2',
      sourceMultiplicity: { lower: 1, upper: 1 },
    });
    expectFail(result, 'INVALID_MULTIPLICITY');
  });

  it('falla si alguna clase de la relación no existe', () => {
    const result = applyCommand(modelWithTwoClasses(), {
      type: 'CREATE_RELATIONSHIP',
      relationshipId: 'r1',
      relationshipType: 'ASSOCIATION',
      sourceClassId: 'c1',
      targetClassId: 'no-existe',
      sourceMultiplicity: { lower: 1, upper: 1 },
      targetMultiplicity: { lower: 0, upper: '*' },
    });
    expectFail(result, 'CLASS_NOT_FOUND');
  });

  function modelWithAssociation(): UMLModel {
    return expectOk(
      applyCommand(modelWithTwoClasses(), {
        type: 'CREATE_RELATIONSHIP',
        relationshipId: 'r1',
        relationshipType: 'ASSOCIATION',
        sourceClassId: 'c1',
        targetClassId: 'c2',
        sourceMultiplicity: { lower: 1, upper: 1 },
        targetMultiplicity: { lower: 0, upper: '*' },
      }),
    );
  }

  it('actualiza los roles de una relación', () => {
    const next = expectOk(
      applyCommand(modelWithAssociation(), {
        type: 'UPDATE_RELATIONSHIP',
        relationshipId: 'r1',
        sourceRole: 'cliente',
        targetRole: 'pedidos',
      }),
    );
    expect(next.relationships[0].sourceRole).toBe('cliente');
    expect(next.relationships[0].targetRole).toBe('pedidos');
  });

  it('actualiza la multiplicidad de un extremo', () => {
    const next = expectOk(
      applyCommand(modelWithAssociation(), {
        type: 'UPDATE_MULTIPLICITY',
        relationshipId: 'r1',
        end: 'target',
        multiplicity: { lower: 1, upper: '*' },
      }),
    );
    expect(next.relationships[0].targetMultiplicity).toEqual({ lower: 1, upper: '*' });
  });

  it('rechaza multiplicidad inválida (upper < lower)', () => {
    const result = applyCommand(modelWithAssociation(), {
      type: 'UPDATE_MULTIPLICITY',
      relationshipId: 'r1',
      end: 'target',
      multiplicity: { lower: 5, upper: 1 },
    });
    expectFail(result, 'INVALID_MULTIPLICITY');
  });

  it('elimina una relación', () => {
    const next = expectOk(
      applyCommand(modelWithAssociation(), { type: 'DELETE_RELATIONSHIP', relationshipId: 'r1' }),
    );
    expect(next.relationships).toHaveLength(0);
  });
});
