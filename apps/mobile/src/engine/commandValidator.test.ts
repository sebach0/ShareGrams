import { describe, expect, it } from 'vitest';
import { validateCommand } from './commandValidator';
import type { DomainManifest, EntityDefinition } from '../domain/manifest';

const paciente: EntityDefinition = {
  name: 'Paciente',
  label: 'Paciente',
  pluralLabel: 'Pacientes',
  endpoint: '/api/pacientes',
  id: { fields: [{ name: 'id', type: 'long' }], generated: true },
  displayField: 'nombre',
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false },
    { name: 'edad', label: 'Edad', type: 'integer', required: false, editable: true, generated: false },
    { name: 'estado', label: 'Estado', type: 'enum', required: false, editable: true, generated: false, enumValues: ['PENDIENTE', 'PAGADO', 'CANCELADO'] },
  ],
  relations: [],
  operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
};

const consulta: EntityDefinition = {
  name: 'Consulta',
  label: 'Consulta',
  pluralLabel: 'Consultas',
  endpoint: '/api/consultas',
  id: { fields: [{ name: 'id', type: 'long' }], generated: true },
  displayField: 'fecha',
  fields: [{ name: 'fecha', label: 'Fecha', type: 'date', required: true, editable: true, generated: false }],
  relations: [
    { name: 'paciente', targetEntity: 'Paciente', cardinality: 'MANY_TO_ONE', required: true },
    { name: 'medico', targetEntity: 'Medico', cardinality: 'MANY_TO_ONE', required: true },
  ],
  operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
};

/** Solo LIST+CREATE, como una entidad con PK compuesta real de Fase 10/11 (ej. DetalleVenta). */
const detalleVenta: EntityDefinition = {
  name: 'DetalleVenta',
  label: 'DetalleVenta',
  pluralLabel: 'DetalleVentas',
  endpoint: '/api/detalleventas',
  displayField: 'cantidad',
  fields: [{ name: 'cantidad', label: 'Cantidad', type: 'integer', required: true, editable: true, generated: false }],
  relations: [],
  operations: ['LIST', 'CREATE'],
};

const uuidEntity: EntityDefinition = {
  name: 'Sesion',
  label: 'Sesion',
  pluralLabel: 'Sesiones',
  endpoint: '/api/sesiones',
  id: { fields: [{ name: 'id', type: 'uuid' }], generated: true },
  displayField: 'id',
  fields: [],
  relations: [],
  operations: ['LIST', 'GET', 'CREATE', 'DELETE'],
};

const manifest: DomainManifest = {
  version: '1.0',
  application: { name: 'Clínica' },
  entities: [paciente, consulta, detalleVenta, uuidEntity],
};

describe('validateCommand — acción', () => {
  it('acepta una acción válida (LIST)', () => {
    const result = validateCommand({ action: 'LIST', entity: 'Paciente' }, manifest);
    expect(result.valid).toBe(true);
  });

  it('rechaza una acción inválida', () => {
    const result = validateCommand({ action: 'DROP_TABLE', entity: 'Paciente' }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('INVALID_ACTION');
  });

  it('rechaza propiedades ajenas al schema cerrado (url/sql/shell)', () => {
    const result = validateCommand({ action: 'LIST', entity: 'Paciente', url: 'http://evil.example', sql: 'DROP TABLE x' }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('MALFORMED_COMMAND');
  });

  it('rechaza un comando que no es un objeto', () => {
    const result = validateCommand('CREATE Paciente', manifest);
    expect(result.valid).toBe(false);
  });
});

describe('validateCommand — entidad', () => {
  it('acepta una entidad que existe en el manifest', () => {
    const result = validateCommand({ action: 'LIST', entity: 'Paciente' }, manifest);
    expect(result.valid).toBe(true);
  });

  it('rechaza una entidad inexistente', () => {
    const result = validateCommand({ action: 'LIST', entity: 'Automovil' }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('UNKNOWN_ENTITY');
  });
});

describe('validateCommand — operación permitida', () => {
  it('rechaza DELETE sobre una entidad con PK compuesta (solo LIST+CREATE)', () => {
    const result = validateCommand({ action: 'DELETE', entity: 'DetalleVenta', id: 1 }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('OPERATION_NOT_ALLOWED');
  });

  it('acepta CREATE sobre una entidad con PK compuesta', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'DetalleVenta', data: { cantidad: 3 } }, manifest);
    expect(result.valid).toBe(true);
  });
});

describe('validateCommand — id', () => {
  it('GET sin id falla con MISSING_ID', () => {
    const result = validateCommand({ action: 'GET', entity: 'Paciente' }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('MISSING_ID');
  });

  it('id de tipo incorrecto (Paciente.id es long, no string con letras)', () => {
    const result = validateCommand({ action: 'GET', entity: 'Paciente', id: 'abc' }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('INVALID_ID_TYPE');
  });

  it('id numérico válido para una entidad con PK long', () => {
    const result = validateCommand({ action: 'GET', entity: 'Paciente', id: 15 }, manifest);
    expect(result.valid).toBe(true);
  });

  it('id string válido para una entidad con PK uuid', () => {
    const result = validateCommand({ action: 'GET', entity: 'Sesion', id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }, manifest);
    expect(result.valid).toBe(true);
  });

  it('id numérico rechazado para una entidad con PK uuid', () => {
    const result = validateCommand({ action: 'GET', entity: 'Sesion', id: 5 }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('INVALID_ID_TYPE');
  });
});

describe('validateCommand — campos', () => {
  it('campo inexistente produce UNKNOWN_FIELD', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Paciente', data: { marcaVehiculo: 'Toyota' } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics.map((d) => d.code)).toContain('UNKNOWN_FIELD');
  });

  it('required faltante produce MISSING_REQUIRED_FIELD', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Paciente', data: {} }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.diagnostics[0].field).toBe('nombre');
    }
  });

  it('tipo incorrecto produce INVALID_FIELD_TYPE', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Ana', edad: 'hola' } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('INVALID_FIELD_TYPE');
  });

  it('intentar setear el id (generated) produce FIELD_NOT_EDITABLE', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Paciente', data: { id: 99, nombre: 'Carlos' } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('FIELD_NOT_EDITABLE');
  });

  it('CREATE válido con solo los campos requeridos', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos' } }, manifest);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.command).toEqual({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos' } });
  });
});

describe('validateCommand — enum', () => {
  it('valor de enum válido', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Ana', estado: 'PAGADO' } }, manifest);
    expect(result.valid).toBe(true);
  });

  it('valor de enum inválido produce INVALID_ENUM_VALUE', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Ana', estado: 'OTRO' } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('INVALID_ENUM_VALUE');
  });
});

describe('validateCommand — relaciones', () => {
  it('CREATE con relaciones válidas (ids explícitos)', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Consulta', data: { fecha: '2026-09-21', paciente: 5, medico: 7 } }, manifest);
    expect(result.valid).toBe(true);
  });

  it('falta una relación requerida', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Consulta', data: { fecha: '2026-09-21', paciente: 5 } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics.some((d) => d.code === 'MISSING_REQUIRED_FIELD' && d.field === 'medico')).toBe(true);
    }
  });

  it('relación con un valor que no es id (string/number)', () => {
    const result = validateCommand({ action: 'CREATE', entity: 'Consulta', data: { fecha: '2026-09-21', paciente: { nombre: 'Ana' }, medico: 7 } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('INVALID_RELATION_VALUE');
  });
});

describe('validateCommand — UPDATE', () => {
  it('UPDATE sin id falla', () => {
    const result = validateCommand({ action: 'UPDATE', entity: 'Paciente', data: { nombre: 'Carlos' } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('MISSING_ID');
  });

  it('UPDATE exige los mismos campos required que CREATE (Fase 10 reusa el mismo Request DTO en POST y PUT)', () => {
    const result = validateCommand({ action: 'UPDATE', entity: 'Paciente', id: 15, data: { edad: 30 } }, manifest);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics.some((d) => d.code === 'MISSING_REQUIRED_FIELD' && d.field === 'nombre')).toBe(true);
  });

  it('UPDATE válido con todos los campos required', () => {
    const result = validateCommand({ action: 'UPDATE', entity: 'Paciente', id: 15, data: { nombre: 'Carlos Perez' } }, manifest);
    expect(result.valid).toBe(true);
  });
});

describe('validateCommand — SEARCH/COUNT (MVP sobre LIST)', () => {
  it('SEARCH requiere la operación LIST', () => {
    const noListEntity: EntityDefinition = { ...detalleVenta, operations: ['CREATE'] };
    const m: DomainManifest = { ...manifest, entities: [noListEntity] };
    const result = validateCommand({ action: 'SEARCH', entity: 'DetalleVenta', filters: {} }, m);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.diagnostics[0].code).toBe('OPERATION_NOT_ALLOWED');
  });

  it('SEARCH válido con un filtro de campo conocido', () => {
    const result = validateCommand({ action: 'SEARCH', entity: 'Paciente', filters: { nombre: 'Carlos' } }, manifest);
    expect(result.valid).toBe(true);
  });

  it('SEARCH sin filters es válido (equivale a LIST completo)', () => {
    const result = validateCommand({ action: 'SEARCH', entity: 'Paciente' }, manifest);
    expect(result.valid).toBe(true);
  });

  it('COUNT válido', () => {
    const result = validateCommand({ action: 'COUNT', entity: 'Paciente' }, manifest);
    expect(result.valid).toBe(true);
  });
});
