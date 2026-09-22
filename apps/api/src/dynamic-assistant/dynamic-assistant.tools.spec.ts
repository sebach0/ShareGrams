import type { DomainManifest } from '@sharegrams/uml-core';
import { actionForToolName, buildDynamicTools } from './dynamic-assistant.tools';

const manifest: DomainManifest = {
  version: '1.0',
  application: { name: 'Ventas' },
  entities: [
    {
      name: 'Cliente',
      label: 'Cliente',
      pluralLabel: 'Clientes',
      endpoint: '/api/clientes',
      id: { fields: [{ name: 'id', type: 'long' }], generated: true },
      displayField: 'nombre',
      fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
      relations: [],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
    },
    {
      name: 'DetalleVenta',
      label: 'DetalleVenta',
      pluralLabel: 'DetalleVentas',
      endpoint: '/api/detalleventas',
      displayField: 'cantidad',
      fields: [{ name: 'cantidad', label: 'Cantidad', type: 'integer', required: true, editable: true, generated: false }],
      relations: [],
      // Entidad con PK compuesta (regla Fase 10): solo LIST+CREATE.
      operations: ['LIST', 'CREATE'],
    },
  ],
};

function findTool(tools: ReturnType<typeof buildDynamicTools>, name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`No se encontró el tool "${name}"`);
  return tool;
}

describe('buildDynamicTools', () => {
  it('el enum de "entity" de cada acción solo incluye entidades que soportan esa operación', () => {
    const tools = buildDynamicTools(manifest);

    const listEnum = (findTool(tools, 'list_records').input_schema as { properties: { entity: { enum: string[] } } }).properties.entity.enum;
    expect(listEnum.sort()).toEqual(['Cliente', 'DetalleVenta']);

    const createEnum = (findTool(tools, 'create_record').input_schema as { properties: { entity: { enum: string[] } } }).properties.entity.enum;
    expect(createEnum.sort()).toEqual(['Cliente', 'DetalleVenta']);
  });

  it('no genera la herramienta de una acción si NINGUNA entidad la soporta (DetalleVenta con PK compuesta no tiene UPDATE/DELETE)', () => {
    const tools = buildDynamicTools(manifest);
    const names = tools.map((t) => t.name);
    expect(names).toContain('update_record');
    expect(names).toContain('delete_record');

    const updateEnum = (findTool(tools, 'update_record').input_schema as { properties: { entity: { enum: string[] } } }).properties.entity.enum;
    expect(updateEnum).toEqual(['Cliente']); // NO DetalleVenta
    const deleteEnum = (findTool(tools, 'delete_record').input_schema as { properties: { entity: { enum: string[] } } }).properties.entity.enum;
    expect(deleteEnum).toEqual(['Cliente']); // NO DetalleVenta
  });

  it('omite por completo la herramienta de una acción si NINGUNA entidad del manifest la soporta', () => {
    const noGetManifest: DomainManifest = {
      ...manifest,
      entities: manifest.entities.map((e) => ({ ...e, operations: e.operations.filter((op) => op !== 'GET') })),
    };
    const tools = buildDynamicTools(noGetManifest);
    expect(tools.map((t) => t.name)).not.toContain('get_record');
  });

  it('siempre incluye las herramientas de control (ask_clarification, report_invalid_request, report_unsupported)', () => {
    const tools = buildDynamicTools(manifest);
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['ask_clarification', 'report_invalid_request', 'report_unsupported']));
  });
});

describe('actionForToolName', () => {
  it('mapea los 5 tools de acción a su DynamicCommand.action', () => {
    expect(actionForToolName('list_records')).toBe('LIST');
    expect(actionForToolName('get_record')).toBe('GET');
    expect(actionForToolName('create_record')).toBe('CREATE');
    expect(actionForToolName('update_record')).toBe('UPDATE');
    expect(actionForToolName('delete_record')).toBe('DELETE');
  });

  it('devuelve null para un nombre desconocido (incluidos los tools de control)', () => {
    expect(actionForToolName('ask_clarification')).toBeNull();
    expect(actionForToolName('algo_inventado')).toBeNull();
  });
});
