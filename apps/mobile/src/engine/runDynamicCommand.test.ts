import { describe, expect, it } from 'vitest';
import { runDynamicCommand } from './runDynamicCommand';
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

/**
 * Prueba el pipeline COMPLETO (regla 51): Validator antes que Executor,
 * siempre en ese orden, sin saltos -- este es el único punto que Claude (en
 * una fase futura) va a poder llamar.
 */
describe('runDynamicCommand', () => {
  it('un comando inválido nunca llega al Executor/backend (VALIDATION_ERROR con diagnostics)', async () => {
    let fetchCalled = false;
    const spyingFetch: typeof fetch = (async () => {
      fetchCalled = true;
      throw new Error('no debería llamarse');
    }) as typeof fetch;
    const repo = new DynamicRepository('http://localhost:8080', spyingFetch);

    const result = await runDynamicCommand({ action: 'CREATE', entity: 'Cliente', data: {} }, manifest, repo);

    expect(result.status).toBe('VALIDATION_ERROR');
    expect(result.diagnostics?.[0].code).toBe('MISSING_REQUIRED_FIELD');
    expect(fetchCalled).toBe(false);
  });

  it('un comando válido llega hasta el backend y devuelve SUCCESS', async () => {
    const repo = new DynamicRepository('http://localhost:8080', fakeFetch(201, { id: 1, nombre: 'Ana' }));
    const result = await runDynamicCommand({ action: 'CREATE', entity: 'Cliente', data: { nombre: 'Ana' } }, manifest, repo);
    expect(result.status).toBe('SUCCESS');
  });

  it('rechaza un comando con una clave ajena (url) antes de tocar el backend', async () => {
    let fetchCalled = false;
    const spyingFetch: typeof fetch = (async () => {
      fetchCalled = true;
      throw new Error('no debería llamarse');
    }) as typeof fetch;
    const repo = new DynamicRepository('http://localhost:8080', spyingFetch);

    const result = await runDynamicCommand({ action: 'LIST', entity: 'Cliente', url: 'http://evil.example' }, manifest, repo);

    expect(result.status).toBe('VALIDATION_ERROR');
    expect(fetchCalled).toBe(false);
  });
});
