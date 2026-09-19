import { describe, expect, it } from 'vitest';
import { transformUmlToRelational } from '../../src/relational/transformer';
import type { PrimitiveType, UMLAttribute, UMLClass, UMLModel, UMLRelationship, Multiplicity } from '../../src/model/types';
import type { RelationalModel, RelationalTable } from '../../src/relational/types';
import type { TransformResult } from '../../src/relational/transformer';

function pk(id: string, name: string, type: PrimitiveType): UMLAttribute {
  return { id, name, type, isPrimaryKey: true };
}
function col(id: string, name: string, type: PrimitiveType): UMLAttribute {
  return { id, name, type };
}
function cls(id: string, name: string, attributes: UMLAttribute[] = []): UMLClass {
  return { id, name, attributes, position: { x: 0, y: 0 } };
}
function rel(
  id: string,
  type: UMLRelationship['type'],
  sourceClassId: string,
  targetClassId: string,
  sourceMultiplicity?: Multiplicity,
  targetMultiplicity?: Multiplicity,
): UMLRelationship {
  return { id, type, sourceClassId, targetClassId, sourceMultiplicity, targetMultiplicity };
}

function expectOk(result: TransformResult): RelationalModel {
  if (!result.ok) {
    throw new Error(`Se esperaba éxito, hubo errores: ${result.errors.map((e) => `${e.code}: ${e.message}`).join(' | ')}`);
  }
  return result.model;
}

function expectFail(result: TransformResult, code: string): void {
  if (result.ok) throw new Error('Se esperaba un error, la transformación tuvo éxito');
  expect(result.errors.map((e) => e.code)).toContain(code);
}

function table(model: RelationalModel, name: string): RelationalTable {
  const found = model.tables.find((t) => t.name === name);
  if (!found) throw new Error(`No se encontró la tabla "${name}" (tablas: ${model.tables.map((t) => t.name).join(', ')})`);
  return found;
}

const ONE: Multiplicity = { lower: 1, upper: 1 };
const ZERO_OR_ONE: Multiplicity = { lower: 0, upper: 1 };
const MANY: Multiplicity = { lower: 0, upper: '*' };
const ONE_OR_MANY: Multiplicity = { lower: 1, upper: '*' };

describe('clases -> tablas', () => {
  it('transforma una clase simple en una tabla', () => {
    const model: UMLModel = { classes: [cls('c1', 'Cliente', [pk('a1', 'id', 'Long')])], relationships: [] };
    const result = expectOk(transformUmlToRelational(model));
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('cliente');
  });

  it('transforma una clase con varios atributos, cada uno como columna', () => {
    const model: UMLModel = {
      classes: [
        cls('c1', 'Cliente', [pk('a1', 'id', 'Long'), col('a2', 'nombre', 'String'), col('a3', 'email', 'String')]),
      ],
      relationships: [],
    };
    const result = expectOk(transformUmlToRelational(model));
    expect(table(result, 'cliente').columns.map((c) => c.name)).toEqual(['id', 'nombre', 'email']);
  });

  it('normaliza PascalCase a snake_case en el nombre de tabla', () => {
    const model: UMLModel = { classes: [cls('c1', 'DetallePedido', [pk('a1', 'id', 'Long')])], relationships: [] };
    const result = expectOk(transformUmlToRelational(model));
    expect(result.tables[0].name).toBe('detalle_pedido');
  });
});

describe('tipos', () => {
  it('rechaza un tipo no soportado con un diagnóstico explícito', () => {
    const model: UMLModel = {
      classes: [cls('c1', 'Cliente', [pk('a1', 'id', 'Long'), col('a2', 'saldo', 'Money' as PrimitiveType)])],
      relationships: [],
    };
    expectFail(transformUmlToRelational(model), 'UNSUPPORTED_ATTRIBUTE_TYPE');
  });
});

describe('primary key', () => {
  it('usa el atributo marcado isPrimaryKey como PK de la tabla', () => {
    const model: UMLModel = { classes: [cls('c1', 'Cliente', [pk('a1', 'id', 'Long')])], relationships: [] };
    const result = expectOk(transformUmlToRelational(model));
    expect(table(result, 'cliente').primaryKey).toEqual({ columns: ['id'] });
  });

  it('rechaza una clase raíz sin ningún atributo marcado como PK', () => {
    const model: UMLModel = { classes: [cls('c1', 'Cliente', [col('a1', 'nombre', 'String')])], relationships: [] };
    expectFail(transformUmlToRelational(model), 'MISSING_PRIMARY_KEY');
  });

  it('rechaza una clase con más de un atributo marcado como PK', () => {
    const model: UMLModel = {
      classes: [cls('c1', 'Cliente', [pk('a1', 'id', 'Long'), pk('a2', 'codigo', 'String')])],
      relationships: [],
    };
    expectFail(transformUmlToRelational(model), 'MULTIPLE_PRIMARY_KEYS');
  });
});

describe('relación 1:N', () => {
  it('Cliente 1 -- 0..* Pedido: la FK vive en pedido, NOT NULL', () => {
    const model: UMLModel = {
      classes: [cls('cliente', 'Cliente', [pk('c-id', 'id', 'Long')]), cls('pedido', 'Pedido', [pk('p-id', 'id', 'Long')])],
      relationships: [rel('r1', 'ASSOCIATION', 'cliente', 'pedido', ONE, MANY)],
    };
    const result = expectOk(transformUmlToRelational(model));
    const pedido = table(result, 'pedido');
    const fkColumn = pedido.columns.find((c) => c.name === 'cliente_id')!;
    expect(fkColumn).toBeDefined();
    expect(fkColumn.nullable).toBe(false);
    expect(pedido.foreignKeys).toEqual([
      { id: 'r1:fk', columns: ['cliente_id'], referencedTable: 'cliente', referencedColumns: ['id'] },
    ]);
    expect(table(result, 'cliente').columns.some((c) => c.name === 'pedido_id')).toBe(false);
  });

  it('la FK es nullable si el extremo "uno" es opcional (0..1)', () => {
    const model: UMLModel = {
      classes: [cls('cliente', 'Cliente', [pk('c-id', 'id', 'Long')]), cls('pedido', 'Pedido', [pk('p-id', 'id', 'Long')])],
      relationships: [rel('r1', 'ASSOCIATION', 'cliente', 'pedido', ZERO_OR_ONE, MANY)],
    };
    const result = expectOk(transformUmlToRelational(model));
    expect(table(result, 'pedido').columns.find((c) => c.name === 'cliente_id')!.nullable).toBe(true);
  });

  it('funciona igual si el lado "muchos" es el source', () => {
    const model: UMLModel = {
      classes: [cls('pedido', 'Pedido', [pk('p-id', 'id', 'Long')]), cls('cliente', 'Cliente', [pk('c-id', 'id', 'Long')])],
      relationships: [rel('r1', 'ASSOCIATION', 'pedido', 'cliente', MANY, ONE)],
    };
    const result = expectOk(transformUmlToRelational(model));
    expect(table(result, 'pedido').columns.find((c) => c.name === 'cliente_id')).toBeDefined();
  });
});

describe('relación 1:1', () => {
  it('Persona 1 -- 1 Pasaporte: FK en pasaporte con UNIQUE', () => {
    const model: UMLModel = {
      classes: [cls('persona', 'Persona', [pk('pe-id', 'id', 'Long')]), cls('pasaporte', 'Pasaporte', [pk('pa-id', 'id', 'Long')])],
      relationships: [rel('r1', 'ASSOCIATION', 'persona', 'pasaporte', ONE, ONE)],
    };
    const result = expectOk(transformUmlToRelational(model));
    const pasaporte = table(result, 'pasaporte');
    expect(pasaporte.columns.find((c) => c.name === 'persona_id')).toBeDefined();
    expect(pasaporte.uniqueConstraints).toEqual([{ columns: ['persona_id'] }]);
    expect(table(result, 'persona').foreignKeys).toEqual([]);
  });
});

describe('relación N:M', () => {
  it('Estudiante * -- * Materia: tabla asociativa con PK compuesta y 2 FK', () => {
    const model: UMLModel = {
      classes: [
        cls('estudiante', 'Estudiante', [pk('e-id', 'id', 'Long')]),
        cls('materia', 'Materia', [pk('m-id', 'id', 'Long')]),
      ],
      relationships: [rel('r1', 'ASSOCIATION', 'estudiante', 'materia', MANY, MANY)],
    };
    const result = expectOk(transformUmlToRelational(model));
    const join = table(result, 'estudiante_materia');
    expect(join.primaryKey).toEqual({ columns: ['estudiante_id', 'materia_id'] });
    expect(join.foreignKeys).toHaveLength(2);
    expect(join.columns.map((c) => c.name)).toEqual(['estudiante_id', 'materia_id']);
    expect(join.columns.every((c) => c.nullable === false)).toBe(true);
  });
});

describe('multiplicidades', () => {
  it('rechaza una multiplicidad no soportada (ej. 2..5)', () => {
    const model: UMLModel = {
      classes: [cls('a', 'A', [pk('a-id', 'id', 'Long')]), cls('b', 'B', [pk('b-id', 'id', 'Long')])],
      relationships: [rel('r1', 'ASSOCIATION', 'a', 'b', { lower: 2, upper: 5 }, ONE)],
    };
    expectFail(transformUmlToRelational(model), 'UNSUPPORTED_MULTIPLICITY');
  });

  it('rechaza una asociación sin multiplicidad en ambos extremos', () => {
    const model: UMLModel = {
      classes: [cls('a', 'A', [pk('a-id', 'id', 'Long')]), cls('b', 'B', [pk('b-id', 'id', 'Long')])],
      relationships: [rel('r1', 'ASSOCIATION', 'a', 'b')],
    };
    expectFail(transformUmlToRelational(model), 'INCOMPLETE_ASSOCIATION');
  });

  it('acepta 1..* igual que 0..* para determinar el lado "muchos"', () => {
    const model: UMLModel = {
      classes: [cls('cliente', 'Cliente', [pk('c-id', 'id', 'Long')]), cls('pedido', 'Pedido', [pk('p-id', 'id', 'Long')])],
      relationships: [rel('r1', 'ASSOCIATION', 'cliente', 'pedido', ONE, ONE_OR_MANY)],
    };
    const result = expectOk(transformUmlToRelational(model));
    expect(table(result, 'pedido').columns.find((c) => c.name === 'cliente_id')).toBeDefined();
  });
});

describe('colisiones de nombre de tabla', () => {
  it('rechaza dos clases que normalizan al mismo nombre de tabla', () => {
    const model: UMLModel = {
      classes: [cls('c1', 'DetallePedido', [pk('a1', 'id', 'Long')]), cls('c2', 'detalle_pedido', [pk('a2', 'id', 'Long')])],
      relationships: [],
    };
    expectFail(transformUmlToRelational(model), 'TABLE_NAME_COLLISION');
  });
});

describe('herencia (GENERALIZATION, estrategia JOINED)', () => {
  it('Persona / Cliente / Empleado: la subclase no necesita PK propia, hereda persona_id', () => {
    const model: UMLModel = {
      classes: [
        cls('persona', 'Persona', [pk('pe-id', 'id', 'Long'), col('pe-nombre', 'nombre', 'String')]),
        cls('cliente', 'Cliente', []),
        cls('empleado', 'Empleado', [col('em-salario', 'salario', 'BigDecimal')]),
      ],
      relationships: [
        rel('g1', 'GENERALIZATION', 'cliente', 'persona'),
        rel('g2', 'GENERALIZATION', 'empleado', 'persona'),
      ],
    };
    const result = expectOk(transformUmlToRelational(model));

    const cliente = table(result, 'cliente');
    expect(cliente.primaryKey).toEqual({ columns: ['persona_id'] });
    expect(cliente.foreignKeys).toEqual([
      { id: 'g1:fk', columns: ['persona_id'], referencedTable: 'persona', referencedColumns: ['id'] },
    ]);

    const empleado = table(result, 'empleado');
    expect(empleado.primaryKey).toEqual({ columns: ['persona_id'] });
    expect(empleado.columns.map((c) => c.name)).toEqual(['salario', 'persona_id']);
  });

  it('rechaza herencia múltiple (una clase con más de un supertipo)', () => {
    const model: UMLModel = {
      classes: [cls('a', 'A', [pk('a-id', 'id', 'Long')]), cls('b', 'B', [pk('b-id', 'id', 'Long')]), cls('c', 'C', [])],
      relationships: [rel('g1', 'GENERALIZATION', 'c', 'a'), rel('g2', 'GENERALIZATION', 'c', 'b')],
    };
    expectFail(transformUmlToRelational(model), 'UNSUPPORTED_MULTIPLE_INHERITANCE');
  });

  it('rechaza un ciclo de generalización', () => {
    const model: UMLModel = {
      classes: [cls('a', 'A', []), cls('b', 'B', [])],
      relationships: [rel('g1', 'GENERALIZATION', 'a', 'b'), rel('g2', 'GENERALIZATION', 'b', 'a')],
    };
    expectFail(transformUmlToRelational(model), 'CIRCULAR_GENERALIZATION');
  });
});

describe('determinismo e integridad', () => {
  const model: UMLModel = {
    classes: [
      cls('cliente', 'Cliente', [pk('c-id', 'id', 'Long'), col('c-nombre', 'nombre', 'String')]),
      cls('pedido', 'Pedido', [pk('p-id', 'id', 'Long')]),
    ],
    relationships: [rel('r1', 'ASSOCIATION', 'cliente', 'pedido', ONE, MANY)],
  };

  it('transformar el mismo modelo dos veces produce exactamente el mismo resultado', () => {
    const first = expectOk(transformUmlToRelational(model));
    const second = expectOk(transformUmlToRelational(model));
    expect(second).toEqual(first);
  });

  it('no muta el modelo UML original', () => {
    const snapshot = JSON.parse(JSON.stringify(model));
    transformUmlToRelational(model);
    expect(model).toEqual(snapshot);
  });
});

describe('caso de aceptación: Cliente / Pedido / Producto', () => {
  it('produce el esquema relacional esperado', () => {
    const model: UMLModel = {
      classes: [
        cls('cliente', 'Cliente', [
          pk('c-id', 'id', 'Long'),
          col('c-nombre', 'nombre', 'String'),
          col('c-email', 'email', 'String'),
        ]),
        cls('pedido', 'Pedido', [
          pk('p-id', 'id', 'Long'),
          col('p-fecha', 'fecha', 'Date'),
          col('p-total', 'total', 'BigDecimal'),
        ]),
        cls('producto', 'Producto', [
          pk('pr-id', 'id', 'Long'),
          col('pr-nombre', 'nombre', 'String'),
          col('pr-precio', 'precio', 'BigDecimal'),
        ]),
      ],
      relationships: [
        rel('r-cliente-pedido', 'ASSOCIATION', 'cliente', 'pedido', ONE, MANY),
        rel('r-pedido-producto', 'ASSOCIATION', 'pedido', 'producto', MANY, MANY),
      ],
    };

    const result = expectOk(transformUmlToRelational(model));
    expect(result.tables.map((t) => t.name)).toEqual(['cliente', 'pedido', 'producto', 'pedido_producto']);

    const cliente = table(result, 'cliente');
    expect(cliente.columns.map((c) => [c.name, c.type])).toEqual([
      ['id', 'BIGINT'],
      ['nombre', 'VARCHAR'],
      ['email', 'VARCHAR'],
    ]);
    expect(cliente.primaryKey).toEqual({ columns: ['id'] });

    const pedido = table(result, 'pedido');
    expect(pedido.columns.map((c) => c.name)).toEqual(['id', 'fecha', 'total', 'cliente_id']);
    expect(pedido.columns.find((c) => c.name === 'cliente_id')).toMatchObject({ type: 'BIGINT', nullable: false });
    expect(pedido.primaryKey).toEqual({ columns: ['id'] });

    const producto = table(result, 'producto');
    expect(producto.primaryKey).toEqual({ columns: ['id'] });

    const joinTable = table(result, 'pedido_producto');
    expect(joinTable.columns.map((c) => c.name)).toEqual(['pedido_id', 'producto_id']);
    expect(joinTable.primaryKey).toEqual({ columns: ['pedido_id', 'producto_id'] });
    expect(joinTable.foreignKeys).toEqual([
      { id: 'r-pedido-producto:source-fk', columns: ['pedido_id'], referencedTable: 'pedido', referencedColumns: ['id'] },
      { id: 'r-pedido-producto:target-fk', columns: ['producto_id'], referencedTable: 'producto', referencedColumns: ['id'] },
    ]);
  });
});
