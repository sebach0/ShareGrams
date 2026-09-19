import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGeneratedBackend, type RunningGeneratedBackend } from './infra/pipeline';
import { oneToOneRelationalModel } from './fixtures/oneToOne';

describe('E2E: Persona/Pasaporte (1:1, UNIQUE real)', () => {
  let backend: RunningGeneratedBackend;
  let personaId: number;

  beforeAll(async () => {
    backend = await startGeneratedBackend(oneToOneRelationalModel(), '/api/personas');
  });

  afterAll(() => {
    backend?.stop();
  });

  it('crea la Persona', async () => {
    const res = await backend.client.post<{ id: number }>('/api/personas', { nombre: 'Ana' });
    expect(res.status).toBe(201);
    personaId = res.body.id;
  });

  it('crea un primer Pasaporte para esa Persona', async () => {
    const res = await backend.client.post<{ id: number; personaId: number }>('/api/pasaportes', {
      numero: 'AB123',
      personaId,
    });
    expect(res.status).toBe(201);
    expect(res.body.personaId).toBe(personaId);
  });

  it('esquema: la FK persona_id de pasaporte tiene una restricción UNIQUE real', () => {
    const rows = backend.db.query(
      `SELECT tc.constraint_type FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_name = 'pasaporte' AND kcu.column_name = 'persona_id' AND tc.constraint_type = 'UNIQUE';`,
    );
    expect(rows).toEqual(['UNIQUE']);
  });

  it('un segundo Pasaporte para la MISMA Persona es rechazado (viola 1:1), sin tumbar la app', async () => {
    const res = await backend.client.post<unknown>('/api/pasaportes', { numero: 'CD999', personaId });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // La app sigue viva y respondiendo normalmente después del error.
    const stillAlive = await backend.client.get<unknown>('/api/personas');
    expect(stillAlive.status).toBe(200);
  });
});
