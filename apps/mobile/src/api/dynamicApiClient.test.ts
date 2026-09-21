import { describe, expect, it } from 'vitest';
import { request } from './dynamicApiClient';

function fakeFetch(status: number, jsonBody?: unknown): typeof fetch {
  return (async () => ({ status, json: async () => jsonBody }) as Response) as typeof fetch;
}

describe('request', () => {
  it('200 con JSON -> ok', async () => {
    const result = await request('http://localhost:8080', '/api/clientes', 'GET', undefined, fakeFetch(200, [{ id: 1 }]));
    expect(result).toEqual({ kind: 'ok', status: 200, body: [{ id: 1 }] });
  });

  it('204 -> no_content', async () => {
    const result = await request('http://localhost:8080', '/api/clientes/1', 'DELETE', undefined, fakeFetch(204));
    expect(result).toEqual({ kind: 'no_content' });
  });

  it('404 -> not_found', async () => {
    const result = await request('http://localhost:8080', '/api/clientes/999', 'GET', undefined, fakeFetch(404));
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('409 -> conflict con mensaje del backend', async () => {
    const result = await request('http://localhost:8080', '/api/clientes', 'POST', { nombre: 'Ana' }, fakeFetch(409, { message: 'duplicate value' }));
    expect(result).toEqual({ kind: 'conflict', message: 'duplicate value' });
  });

  it('400 de validación arma el mensaje a partir de "fields"', async () => {
    const result = await request(
      'http://localhost:8080',
      '/api/clientes',
      'POST',
      { nombre: '' },
      fakeFetch(400, { status: 400, message: 'Validation failed', fields: { nombre: 'must not be blank' } }),
    );
    expect(result.kind).toBe('client_error');
    if (result.kind === 'client_error') expect(result.message).toContain('nombre');
  });

  it('500 -> server_error', async () => {
    const result = await request('http://localhost:8080', '/api/clientes', 'GET', undefined, fakeFetch(500, { message: 'boom' }));
    expect(result.kind).toBe('server_error');
  });

  it('backend caído (fetch rechaza) -> network_error', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const result = await request('http://localhost:9999', '/api/clientes', 'GET', undefined, throwingFetch);
    expect(result.kind).toBe('network_error');
  });

  it('respuesta 200 con JSON inválido -> client_error', async () => {
    const brokenJsonFetch: typeof fetch = (async () => ({ status: 200, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response) as typeof fetch;
    const result = await request('http://localhost:8080', '/api/clientes', 'GET', undefined, brokenJsonFetch);
    expect(result.kind).toBe('client_error');
  });
});
