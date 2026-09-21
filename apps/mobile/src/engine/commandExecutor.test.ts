import { describe, expect, it } from 'vitest';
import { executeCommand } from './commandExecutor';
import { DynamicRepository } from './dynamicRepository';
import type { DomainManifest, EntityDefinition } from '../domain/manifest';

const cliente: EntityDefinition = {
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

const manifest: DomainManifest = { version: '1.0', application: { name: 'Ventas' }, entities: [cliente] };

function fakeFetch(status: number, jsonBody?: unknown): typeof fetch {
  return (async () => ({ status, json: async () => jsonBody }) as Response) as typeof fetch;
}

describe('executeCommand', () => {
  it('LIST -> SUCCESS con la lista de DynamicEntity', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(200, [{ id: 1, nombre: 'Ana' }]));
    const result = await executeCommand({ action: 'LIST', entity: 'Cliente' }, manifest, repo);
    expect(result.status).toBe('SUCCESS');
    expect(result.data).toEqual([{ entityType: 'Cliente', values: { id: 1, nombre: 'Ana' } }]);
  });

  it('CREATE -> SUCCESS con el DynamicEntity creado', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(201, { id: 1, nombre: 'Ana' }));
    const result = await executeCommand({ action: 'CREATE', entity: 'Cliente', data: { nombre: 'Ana' } }, manifest, repo);
    expect(result.status).toBe('SUCCESS');
    expect(result.data).toEqual({ entityType: 'Cliente', values: { id: 1, nombre: 'Ana' } });
  });

  it('GET a un id inexistente -> NOT_FOUND', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(404));
    const result = await executeCommand({ action: 'GET', entity: 'Cliente', id: 999 }, manifest, repo);
    expect(result.status).toBe('NOT_FOUND');
  });

  it('DELETE exitoso -> SUCCESS', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(204));
    const result = await executeCommand({ action: 'DELETE', entity: 'Cliente', id: 1 }, manifest, repo);
    expect(result.status).toBe('SUCCESS');
  });

  it('backend caído -> NETWORK_ERROR', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const repo = new DynamicRepository('http://localhost:9999', throwingFetch);
    const result = await executeCommand({ action: 'LIST', entity: 'Cliente' }, manifest, repo);
    expect(result.status).toBe('NETWORK_ERROR');
  });

  it('error 500 -> SERVER_ERROR', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(500, { message: 'boom' }));
    const result = await executeCommand({ action: 'LIST', entity: 'Cliente' }, manifest, repo);
    expect(result.status).toBe('SERVER_ERROR');
  });

  it('409 (constraint) -> CONFLICT', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(409, { message: 'duplicate' }));
    const result = await executeCommand({ action: 'CREATE', entity: 'Cliente', data: { nombre: 'Ana' } }, manifest, repo);
    expect(result.status).toBe('CONFLICT');
  });

  it('COUNT -> SUCCESS con un número', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(200, [{ id: 1 }, { id: 2 }]));
    const result = await executeCommand({ action: 'COUNT', entity: 'Cliente' }, manifest, repo);
    expect(result.status).toBe('SUCCESS');
    expect(result.data).toBe(2);
  });
});
