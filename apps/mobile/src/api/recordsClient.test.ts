import { describe, expect, it } from 'vitest';
import { createRecord, listRecords } from './recordsClient';
import type { EntityDefinition } from '../domain/manifest';

function fakeFetch(response: Partial<Response> & { jsonBody?: unknown }): typeof fetch {
  return (async () =>
    ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.jsonBody,
    }) as Response) as typeof fetch;
}

const clienteEntity: EntityDefinition = {
  name: 'Cliente',
  label: 'Cliente',
  pluralLabel: 'Clientes',
  endpoint: '/api/clientes',
  id: { fields: [{ name: 'id', type: 'long' }], generated: true },
  displayField: 'nombre',
  fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
  relations: [],
  operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
};

describe('listRecords', () => {
  it('parsea una lista válida', async () => {
    const records = [{ id: 1, nombre: 'Ana' }];
    const result = await listRecords('http://localhost:8080', clienteEntity, fakeFetch({ jsonBody: records }));
    expect(result).toEqual({ ok: true, records });
  });

  it('backend no disponible', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;
    const result = await listRecords('http://localhost:9999', clienteEntity, throwingFetch);
    expect(result.ok).toBe(false);
  });

  it('error HTTP', async () => {
    const result = await listRecords('http://localhost:8080', clienteEntity, fakeFetch({ ok: false, status: 500 }));
    expect(result.ok).toBe(false);
  });

  it('el backend no devuelve un array', async () => {
    const result = await listRecords('http://localhost:8080', clienteEntity, fakeFetch({ jsonBody: { not: 'an array' } }));
    expect(result.ok).toBe(false);
  });
});

describe('createRecord', () => {
  it('crea un registro y devuelve el que respondió el backend', async () => {
    const created = { id: 1, nombre: 'Ana' };
    const result = await createRecord('http://localhost:8080', clienteEntity, { nombre: 'Ana' }, fakeFetch({ status: 201, jsonBody: created }));
    expect(result).toEqual({ ok: true, record: created });
  });

  it('usa el mensaje de validación con campos cuando el backend rechaza (400)', async () => {
    const result = await createRecord(
      'http://localhost:8080',
      clienteEntity,
      { nombre: '' },
      fakeFetch({ ok: false, status: 400, jsonBody: { status: 400, message: 'Validation failed', fields: { nombre: 'must not be blank' } } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('nombre');
  });

  it('usa el message del error cuando no hay fields (ej. 409 de constraint)', async () => {
    const result = await createRecord(
      'http://localhost:8080',
      clienteEntity,
      { nombre: 'Ana' },
      fakeFetch({ ok: false, status: 409, jsonBody: { status: 409, message: 'duplicate value' } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('duplicate value');
  });

  it('mensaje genérico si el error no trae body JSON entendible', async () => {
    const brokenJsonFetch: typeof fetch = (async () =>
      ({ ok: false, status: 500, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response) as typeof fetch;
    const result = await createRecord('http://localhost:8080', clienteEntity, { nombre: 'Ana' }, brokenJsonFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('500');
  });

  it('backend no disponible', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;
    const result = await createRecord('http://localhost:9999', clienteEntity, { nombre: 'Ana' }, throwingFetch);
    expect(result.ok).toBe(false);
  });
});
