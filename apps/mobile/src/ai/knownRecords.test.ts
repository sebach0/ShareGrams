import { describe, expect, it } from 'vitest';
import { buildKnownRecords } from './knownRecords';
import { DynamicRepository } from '../engine/dynamicRepository';
import type { DomainManifest } from '../domain/manifest';

const manifest: DomainManifest = {
  version: '1.0',
  application: { name: 'Clínica' },
  entities: [
    {
      name: 'Paciente',
      label: 'Paciente',
      pluralLabel: 'Pacientes',
      endpoint: '/api/pacientes',
      id: { fields: [{ name: 'id', type: 'long' }], generated: true },
      displayField: 'nombre',
      fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
      relations: [{ name: 'medicoId', targetEntity: 'Medico', cardinality: 'MANY_TO_ONE', required: true }],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
    },
    {
      name: 'Medico',
      label: 'Medico',
      pluralLabel: 'Medicos',
      endpoint: '/api/medicos',
      id: { fields: [{ name: 'id', type: 'long' }], generated: true },
      displayField: 'nombre',
      fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
      relations: [],
      operations: ['LIST', 'GET', 'CREATE'],
    },
  ],
};

function fakeFetch(handler: (url: string) => unknown[]): typeof fetch {
  return (async (url: string) => ({ status: 200, json: async () => handler(url) }) as Response) as typeof fetch;
}

describe('buildKnownRecords', () => {
  it('solo consulta entidades que son destino de alguna relación (Medico, no Paciente)', async () => {
    let calledUrls: string[] = [];
    const fetchImpl = fakeFetch((url) => {
      calledUrls.push(url);
      return [{ id: 7, nombre: 'Dra. Pérez' }];
    });
    const repository = new DynamicRepository('http://localhost:8080', fetchImpl);

    const result = await buildKnownRecords(manifest, repository);

    expect(calledUrls).toEqual(['http://localhost:8080/api/medicos']);
    expect(result).toEqual({ Medico: [{ id: 7, label: 'Dra. Pérez' }] });
  });

  it('usa el displayField como label, y el id real de la entidad', async () => {
    const fetchImpl = fakeFetch(() => [
      { id: 1, nombre: 'Dr. Gómez' },
      { id: 2, nombre: 'Dra. Ruiz' },
    ]);
    const repository = new DynamicRepository('http://localhost:8080', fetchImpl);

    const result = await buildKnownRecords(manifest, repository);

    expect(result.Medico).toEqual([
      { id: 1, label: 'Dr. Gómez' },
      { id: 2, label: 'Dra. Ruiz' },
    ]);
  });

  it('corta en MAX_RECORDS_PER_ENTITY (20) registros', async () => {
    const manyMedicos = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, nombre: `Medico ${i + 1}` }));
    const fetchImpl = fakeFetch(() => manyMedicos);
    const repository = new DynamicRepository('http://localhost:8080', fetchImpl);

    const result = await buildKnownRecords(manifest, repository);

    expect(result.Medico).toHaveLength(20);
  });

  it('si el LIST falla (network_error, server_error, etc.), omite esa entidad sin romper el resto', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const repository = new DynamicRepository('http://localhost:8080', throwingFetch);

    const result = await buildKnownRecords(manifest, repository);

    expect(result).toEqual({});
  });

  it('sin ninguna relación en el Manifest, no consulta nada', async () => {
    const soloManifest: DomainManifest = {
      ...manifest,
      entities: [{ ...manifest.entities[0], relations: [] }],
    };
    let called = false;
    const fetchImpl = fakeFetch(() => {
      called = true;
      return [];
    });
    const repository = new DynamicRepository('http://localhost:8080', fetchImpl);

    const result = await buildKnownRecords(soloManifest, repository);

    expect(called).toBe(false);
    expect(result).toEqual({});
  });
});
