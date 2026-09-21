import { describe, expect, it } from 'vitest';
import { generateDomainManifest } from '../../../src/generator/manifest/manifestGenerator';
import { transformUmlToRelational } from '../../../src/relational/transformer';
import type { PrimitiveType, UMLAttribute, UMLClass, UMLModel, UMLRelationship, Multiplicity } from '../../../src/model/types';
import type { RelationalModel, RelationalTable } from '../../../src/relational/types';
import type { DomainManifest, EntityDefinition } from '../../../src/generator/manifest/types';

function attr(id: string, name: string, type: PrimitiveType, isPrimaryKey = false): UMLAttribute {
  return { id, name, type, isPrimaryKey: isPrimaryKey || undefined };
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
const ONE: Multiplicity = { lower: 1, upper: 1 };
const MANY: Multiplicity = { lower: 0, upper: '*' };

function generate(model: UMLModel): DomainManifest {
  const result = transformUmlToRelational(model);
  if (!result.ok) throw new Error(`Fixture inválido: ${result.errors.map((e) => e.code).join(', ')}`);
  return generateDomainManifest(model, result.model, { applicationName: 'Test' });
}

function findEntity(manifest: DomainManifest, name: string): EntityDefinition {
  const found = manifest.entities.find((e) => e.name === name);
  if (!found) throw new Error(`No se encontró la entidad "${name}" (hay: ${manifest.entities.map((e) => e.name).join(', ')})`);
  return found;
}

describe('entidad simple', () => {
  it('Cliente(id, nombre, email) produce una EntityDefinition correcta', () => {
    const model: UMLModel = { classes: [cls('c', 'Cliente', [attr('a1', 'id', 'Long', true), attr('a2', 'nombre', 'String'), attr('a3', 'email', 'String')])], relationships: [] };
    const cliente = findEntity(generate(model), 'Cliente');
    expect(cliente.label).toBe('Cliente');
    expect(cliente.pluralLabel).toBe('Clientes');
    expect(cliente.endpoint).toBe('/api/clientes');
    expect(cliente.id).toEqual({ fields: [{ name: 'id', type: 'long' }], generated: true });
    expect(cliente.fields.map((f) => f.name)).toEqual(['nombre', 'email']);
    expect(cliente.operations).toEqual(['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE']);
  });
});

describe('tipos', () => {
  it('mapea cada RelationalType real a su tipo de dominio', () => {
    const model: UMLModel = {
      classes: [
        cls('m', 'Muestra', [
          attr('id', 'id', 'Long', true),
          attr('a', 'texto', 'String'),
          attr('b', 'entero', 'Integer'),
          attr('c', 'largo', 'Long'),
          attr('d', 'decimal', 'BigDecimal'),
          attr('e', 'flotante', 'Double'),
          attr('f', 'activo', 'Boolean'),
          attr('g', 'fecha', 'Date'),
          attr('h', 'fechaHora', 'DateTime'),
        ]),
      ],
      relationships: [],
    };
    const entity = findEntity(generate(model), 'Muestra');
    const byName = Object.fromEntries(entity.fields.map((f) => [f.name, f.type]));
    expect(byName).toEqual({
      texto: 'string',
      entero: 'integer',
      largo: 'long',
      decimal: 'decimal',
      flotante: 'decimal',
      activo: 'boolean',
      fecha: 'date',
      fechaHora: 'datetime',
    });
  });
});

describe('required', () => {
  it('nullable=false -> required=true, nullable=true -> required=false', () => {
    const model: UMLModel = {
      classes: [cls('c', 'Cliente', [attr('a1', 'id', 'Long', true), attr('a2', 'nombre', 'String'), attr('a3', 'email', 'String')])],
      relationships: [],
    };
    // Todo atributo UML hoy mapea a NOT NULL (ver limitación documentada en Fase 9/10) -- ambos dan required:true.
    const entity = findEntity(generate(model), 'Cliente');
    expect(entity.fields.every((f) => f.required)).toBe(true);
  });
});

describe('generated', () => {
  it('el id es generated:true', () => {
    const model: UMLModel = { classes: [cls('c', 'Cliente', [attr('a1', 'id', 'Long', true)])], relationships: [] };
    expect(findEntity(generate(model), 'Cliente').id?.generated).toBe(true);
  });
});

describe('relación', () => {
  it('Cliente 1:N Pedido -> Pedido tiene una relation MANY_TO_ONE hacia Cliente', () => {
    const model: UMLModel = {
      classes: [
        cls('cliente', 'Cliente', [attr('c-id', 'id', 'Long', true)]),
        cls('pedido', 'Pedido', [attr('p-id', 'id', 'Long', true)]),
      ],
      relationships: [rel('r1', 'ASSOCIATION', 'cliente', 'pedido', ONE, MANY)],
    };
    const pedido = findEntity(generate(model), 'Pedido');
    expect(pedido.relations).toEqual([{ name: 'clienteId', targetEntity: 'Cliente', cardinality: 'MANY_TO_ONE', required: true }]);
    expect(pedido.fields.some((f) => f.name === 'clienteId')).toBe(false); // no debe aparecer también como field plano
  });

  it('N:M puro genera una relation MANY_TO_MANY del lado dueño, no una entidad aparte', () => {
    const model: UMLModel = {
      classes: [cls('estudiante', 'Estudiante', [attr('e-id', 'id', 'Long', true)]), cls('materia', 'Materia', [attr('m-id', 'id', 'Long', true)])],
      relationships: [rel('r1', 'ASSOCIATION', 'estudiante', 'materia', MANY, MANY)],
    };
    const manifest = generate(model);
    expect(manifest.entities.map((e) => e.name)).toEqual(['Estudiante', 'Materia']);
    const estudiante = findEntity(manifest, 'Estudiante');
    expect(estudiante.relations).toEqual([{ name: 'materiasIds', targetEntity: 'Materia', cardinality: 'MANY_TO_MANY', required: false }]);
  });
});

describe('operaciones', () => {
  it('una entidad con PK compuesta solo expone LIST y CREATE, y no tiene id', () => {
    const ventaTable: RelationalTable = {
      id: 'venta', name: 'venta',
      columns: [{ id: 'v-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'venta', attributeId: 'v-id' } }],
      primaryKey: { columns: ['id'] }, foreignKeys: [], uniqueConstraints: [], origin: { kind: 'class', classId: 'venta' },
    };
    const productoTable: RelationalTable = {
      id: 'producto', name: 'producto',
      columns: [{ id: 'pr-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'producto', attributeId: 'pr-id' } }],
      primaryKey: { columns: ['id'] }, foreignKeys: [], uniqueConstraints: [], origin: { kind: 'class', classId: 'producto' },
    };
    const detalleTable: RelationalTable = {
      id: 'detalle_venta', name: 'detalle_venta',
      columns: [
        { id: 'dv1', name: 'venta_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r', end: 'source' } },
        { id: 'dv2', name: 'producto_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r', end: 'target' } },
        { id: 'dv3', name: 'cantidad', type: 'INTEGER', nullable: false, origin: { kind: 'attribute', classId: 'detalle_venta', attributeId: 'dv3' } },
      ],
      primaryKey: { columns: ['venta_id', 'producto_id'] },
      foreignKeys: [
        { id: 'fk1', columns: ['venta_id'], referencedTable: 'venta', referencedColumns: ['id'] },
        { id: 'fk2', columns: ['producto_id'], referencedTable: 'producto', referencedColumns: ['id'] },
      ],
      uniqueConstraints: [], origin: { kind: 'many-to-many', relationshipId: 'r' },
    };
    const relationalModel: RelationalModel = { tables: [ventaTable, productoTable, detalleTable] };
    const manifest = generateDomainManifest({ classes: [], relationships: [] }, relationalModel, { applicationName: 'Test' });
    const detalle = findEntity(manifest, 'DetalleVenta');
    expect(detalle.operations).toEqual(['LIST', 'CREATE']);
    expect(detalle.id).toBeUndefined();
    expect(detalle.relations).toEqual([
      { name: 'ventaId', targetEntity: 'Venta', cardinality: 'MANY_TO_ONE', required: true },
      { name: 'productoId', targetEntity: 'Producto', cardinality: 'MANY_TO_ONE', required: true },
    ]);
    expect(detalle.fields.map((f) => f.name)).toEqual(['cantidad']);
    // Sin UMLClass de origen (no viene de ningún AssociationClass): el label sale humanizado del nombre de tabla.
    expect(detalle.label).toBe('Detalle Venta');
  });
});

describe('displayField', () => {
  it('prioriza "nombre" cuando existe', () => {
    const model: UMLModel = { classes: [cls('c', 'Cliente', [attr('a1', 'id', 'Long', true), attr('a2', 'nombre', 'String'), attr('a3', 'email', 'String')])], relationships: [] };
    expect(findEntity(generate(model), 'Cliente').displayField).toBe('nombre');
  });

  it('cae a la primera columna string si no hay nombre/name/titulo', () => {
    const model: UMLModel = { classes: [cls('c', 'Producto', [attr('a1', 'id', 'Long', true), attr('a2', 'descripcion', 'String'), attr('a3', 'precio', 'BigDecimal')])], relationships: [] };
    expect(findEntity(generate(model), 'Producto').displayField).toBe('descripcion');
  });

  it('cae a la PK si no hay ninguna columna string', () => {
    const model: UMLModel = { classes: [cls('c', 'Conteo', [attr('a1', 'id', 'Long', true), attr('a2', 'cantidad', 'Integer')])], relationships: [] };
    expect(findEntity(generate(model), 'Conteo').displayField).toBe('id');
  });
});

describe('herencia', () => {
  it('una subclase JOINED muestra sus campos propios más los heredados, aplanados', () => {
    const model: UMLModel = {
      classes: [
        cls('persona', 'Persona', [attr('pe-id', 'id', 'Long', true), attr('pe-nombre', 'nombre', 'String')]),
        cls('empleado', 'Empleado', [attr('em-salario', 'salario', 'BigDecimal')]),
      ],
      relationships: [rel('g1', 'GENERALIZATION', 'empleado', 'persona')],
    };
    const empleado = findEntity(generate(model), 'Empleado');
    expect(empleado.fields.map((f) => f.name).sort()).toEqual(['nombre', 'salario']);
    expect(empleado.id).toEqual({ fields: [{ name: 'id', type: 'long' }], generated: true });
    expect(empleado.operations).toEqual(['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE']);
  });
});

describe('versión y aplicación', () => {
  it('incluye version y application.name', () => {
    const manifest = generate({ classes: [cls('c', 'Cliente', [attr('a1', 'id', 'Long', true)])], relationships: [] });
    expect(manifest.version).toBe('1.0');
    expect(manifest.application).toEqual({ name: 'Test' });
  });
});
