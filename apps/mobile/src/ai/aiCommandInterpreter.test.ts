import { describe, expect, it } from 'vitest';
import { interpretInstruction } from './aiCommandInterpreter';
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
      relations: [],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
    },
  ],
};

function fakeFetch(response: Partial<Response> & { jsonBody?: unknown }): typeof fetch {
  return (async () => ({ ok: response.ok ?? true, status: response.status ?? 200, json: async () => response.jsonBody }) as Response) as typeof fetch;
}

describe('interpretInstruction', () => {
  it('parsea un resultado COMMAND válido', async () => {
    const body = { status: 'COMMAND', command: { action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos' } }, message: 'Creando Paciente...' };
    const result = await interpretInstruction('crea un paciente llamado Carlos', manifest, fakeFetch({ jsonBody: body }));
    expect(result).toEqual(body);
  });

  it('parsea CLARIFICATION_REQUIRED', async () => {
    const body = { status: 'CLARIFICATION_REQUIRED', message: '¿Qué entidad querés crear?' };
    const result = await interpretInstruction('crea un registro', manifest, fakeFetch({ jsonBody: body }));
    expect(result).toEqual(body);
  });

  it('parsea INVALID_REQUEST', async () => {
    const body = { status: 'INVALID_REQUEST', message: 'La entidad Avion no existe.' };
    const result = await interpretInstruction('crea un avión', manifest, fakeFetch({ jsonBody: body }));
    expect(result).toEqual(body);
  });

  it('parsea NOT_CONFIGURED', async () => {
    const body = { status: 'NOT_CONFIGURED', message: 'El asistente de IA no está configurado en este entorno.' };
    const result = await interpretInstruction('crea un paciente', manifest, fakeFetch({ jsonBody: body }));
    expect(result).toEqual(body);
  });

  it('backend no disponible (fetch rechaza) -> AI_ERROR', async () => {
    const throwingFetch: typeof fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const result = await interpretInstruction('crea un paciente', manifest, throwingFetch);
    expect(result.status).toBe('AI_ERROR');
  });

  it('HTTP no-ok -> AI_ERROR', async () => {
    const result = await interpretInstruction('crea un paciente', manifest, fakeFetch({ ok: false, status: 500 }));
    expect(result.status).toBe('AI_ERROR');
  });

  it('JSON inválido -> AI_ERROR', async () => {
    const badJsonFetch: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response) as typeof fetch;
    const result = await interpretInstruction('crea un paciente', manifest, badJsonFetch);
    expect(result.status).toBe('AI_ERROR');
  });

  it('respuesta con status desconocido -> AI_ERROR (nunca confía ciegamente en el servidor)', async () => {
    const result = await interpretInstruction('crea un paciente', manifest, fakeFetch({ jsonBody: { status: 'ALGO_RARO' } }));
    expect(result.status).toBe('AI_ERROR');
  });

  it('COMMAND sin "command" -> AI_ERROR', async () => {
    const result = await interpretInstruction('crea un paciente', manifest, fakeFetch({ jsonBody: { status: 'COMMAND' } }));
    expect(result.status).toBe('AI_ERROR');
  });
});
