import { describe, expect, it } from 'vitest';
import { DynamicRepository } from './dynamicRepository';
import type { EntityDefinition } from '../domain/manifest';

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

function fakeFetch(handler: (url: string, init?: RequestInit) => Partial<Response> & { jsonBody?: unknown }): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const r = handler(url, init);
    return {
      status: r.status ?? 200,
      json: async () => r.jsonBody,
    } as Response;
  }) as typeof fetch;
}

describe('DynamicRepository.list', () => {
  it('devuelve DynamicEntity[] a partir de un array JSON', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(() => ({ status: 200, jsonBody: [{ id: 1, nombre: 'Ana' }] })));
    const result = await repo.list(cliente);
    expect(result).toEqual({ kind: 'ok', value: [{ entityType: 'Cliente', values: { id: 1, nombre: 'Ana' } }] });
  });

  it('error de red', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const repo = new DynamicRepository('http://localhost:9999', throwingFetch);
    const result = await repo.list(cliente);
    expect(result.kind).toBe('network_error');
  });

  it('error 500', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(() => ({ status: 500, jsonBody: { message: 'boom' } })));
    const result = await repo.list(cliente);
    expect(result.kind).toBe('server_error');
  });
});

describe('DynamicRepository.get', () => {
  it('GET por id exitoso', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch((url) => {
      expect(url).toBe('http://localhost:8080/api/clientes/1');
      return { status: 200, jsonBody: { id: 1, nombre: 'Ana' } };
    }));
    const result = await repo.get(cliente, 1);
    expect(result).toEqual({ kind: 'ok', value: { entityType: 'Cliente', values: { id: 1, nombre: 'Ana' } } });
  });

  it('404 se traduce a not_found', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(() => ({ status: 404 })));
    const result = await repo.get(cliente, 999);
    expect(result).toEqual({ kind: 'not_found' });
  });
});

describe('DynamicRepository.create', () => {
  it('POST con el body correcto', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch((url, init) => {
      expect(url).toBe('http://localhost:8080/api/clientes');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ nombre: 'Ana' });
      return { status: 201, jsonBody: { id: 1, nombre: 'Ana' } };
    }));
    const result = await repo.create(cliente, { nombre: 'Ana' });
    expect(result.kind).toBe('ok');
  });

  it('409 (constraint duplicado) se traduce a conflict', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(() => ({ status: 409, jsonBody: { message: 'duplicate value' } })));
    const result = await repo.create(cliente, { nombre: 'Ana' });
    expect(result).toEqual({ kind: 'conflict', message: 'duplicate value' });
  });

  it('400 de validación arma el mensaje con los fields', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(() => ({ status: 400, jsonBody: { message: 'Validation failed', fields: { nombre: 'must not be blank' } } })));
    const result = await repo.create(cliente, { nombre: '' });
    expect(result.kind).toBe('client_error');
    if (result.kind === 'client_error') expect(result.message).toContain('nombre');
  });
});

describe('DynamicRepository.update', () => {
  it('usa PUT (no PATCH), respetando el contrato real de Fase 10', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch((url, init) => {
      expect(url).toBe('http://localhost:8080/api/clientes/1');
      expect(init?.method).toBe('PUT');
      return { status: 200, jsonBody: { id: 1, nombre: 'Carlos' } };
    }));
    const result = await repo.update(cliente, 1, { nombre: 'Carlos' });
    expect(result.kind).toBe('ok');
  });
});

describe('DynamicRepository.delete', () => {
  it('204 se traduce a ok', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch((url, init) => {
      expect(init?.method).toBe('DELETE');
      return { status: 204 };
    }));
    const result = await repo.delete(cliente, 1);
    expect(result).toEqual({ kind: 'ok', value: undefined });
  });

  it('404 al borrar algo que no existe', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(() => ({ status: 404 })));
    const result = await repo.delete(cliente, 999);
    expect(result).toEqual({ kind: 'not_found' });
  });
});

describe('DynamicRepository.search (MVP sobre LIST)', () => {
  it('filtra en memoria por igualdad exacta', async () => {
    const repo = new DynamicRepository(
      'http://localhost:8080',
      fakeFetch(() => ({
        status: 200,
        jsonBody: [
          { id: 1, nombre: 'Ana' },
          { id: 2, nombre: 'Carlos' },
        ],
      })),
    );
    const result = await repo.search(cliente, { nombre: 'Carlos' });
    expect(result).toEqual({ kind: 'ok', value: [{ entityType: 'Cliente', values: { id: 2, nombre: 'Carlos' } }] });
  });
});

describe('DynamicRepository.count (MVP sobre LIST)', () => {
  it('cuenta todos los registros sin filtro', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(() => ({ status: 200, jsonBody: [{ id: 1 }, { id: 2 }, { id: 3 }] })));
    const result = await repo.count(cliente);
    expect(result).toEqual({ kind: 'ok', value: 3 });
  });

  it('cuenta con filtro aplicado', async () => {
    const repo = new DynamicRepository(
      'http://localhost:8080',
      fakeFetch(() => ({ status: 200, jsonBody: [{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Carlos' }] })),
    );
    const result = await repo.count(cliente, { nombre: 'Ana' });
    expect(result).toEqual({ kind: 'ok', value: 1 });
  });
});
