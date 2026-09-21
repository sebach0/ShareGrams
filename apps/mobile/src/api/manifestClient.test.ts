import { describe, expect, it } from 'vitest';
import { loadManifest } from './manifestClient';

function fakeFetch(response: Partial<Response> & { jsonBody?: unknown }): typeof fetch {
  return (async () =>
    ({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.jsonBody,
    }) as Response) as typeof fetch;
}

const validManifest = {
  version: '1.0',
  application: { name: 'Sistema Ventas' },
  entities: [{ name: 'Cliente', label: 'Cliente', pluralLabel: 'Clientes', endpoint: '/api/clientes', fields: [], relations: [], operations: ['LIST'] }],
};

describe('loadManifest', () => {
  it('parsea un manifest válido', async () => {
    const result = await loadManifest('http://localhost:8080', fakeFetch({ jsonBody: validManifest }));
    expect(result).toEqual({ ok: true, manifest: validManifest });
  });

  it('backend no disponible (fetch rechaza -- ECONNREFUSED/timeout)', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;
    const result = await loadManifest('http://localhost:9999', throwingFetch);
    expect(result.ok).toBe(false);
  });

  it('/api/meta responde 404', async () => {
    const result = await loadManifest('http://localhost:8080', fakeFetch({ ok: false, status: 404 }));
    expect(result.ok).toBe(false);
  });

  it('otro error HTTP (500)', async () => {
    const result = await loadManifest('http://localhost:8080', fakeFetch({ ok: false, status: 500 }));
    expect(result.ok).toBe(false);
  });

  it('JSON inválido', async () => {
    const badJsonFetch: typeof fetch = (async () =>
      ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response) as typeof fetch;
    const result = await loadManifest('http://localhost:8080', badJsonFetch);
    expect(result.ok).toBe(false);
  });

  it('versión no soportada', async () => {
    const result = await loadManifest('http://localhost:8080', fakeFetch({ jsonBody: { ...validManifest, version: '2.0' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('2.0');
  });

  it('manifest vacío (sin entidades)', async () => {
    const result = await loadManifest('http://localhost:8080', fakeFetch({ jsonBody: { ...validManifest, entities: [] } }));
    expect(result.ok).toBe(false);
  });

  it('metadata incompleta (falta application.name)', async () => {
    const result = await loadManifest('http://localhost:8080', fakeFetch({ jsonBody: { version: '1.0', entities: [] } }));
    expect(result.ok).toBe(false);
  });

  it('metadata que no es un objeto', async () => {
    const result = await loadManifest('http://localhost:8080', fakeFetch({ jsonBody: 'no soy un objeto' }));
    expect(result.ok).toBe(false);
  });
});
