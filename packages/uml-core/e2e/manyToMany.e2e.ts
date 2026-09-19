import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGeneratedBackend, type RunningGeneratedBackend } from './infra/pipeline';
import { manyToManyRelationalModel } from './fixtures/manyToMany';

describe('E2E: Estudiante/Materia (N:M)', () => {
  let backend: RunningGeneratedBackend;

  beforeAll(async () => {
    backend = await startGeneratedBackend(manyToManyRelationalModel(), '/api/estudiantes');
  });

  afterAll(() => {
    backend?.stop();
  });

  it('crea Pedro, Software I y Base de Datos, los asocia, y la relación se puede recuperar', async () => {
    const pedro = await backend.client.post<{ id: number }>('/api/estudiantes', { nombre: 'Pedro' });
    expect(pedro.status).toBe(201);

    const software1 = await backend.client.post<{ id: number }>('/api/materias', { nombre: 'Software I' });
    const basesDeDatos = await backend.client.post<{ id: number }>('/api/materias', { nombre: 'Base de Datos' });
    expect(software1.status).toBe(201);
    expect(basesDeDatos.status).toBe(201);

    const updated = await backend.client.put<{ materiasIds: number[] }>(`/api/estudiantes/${pedro.body.id}`, {
      nombre: 'Pedro',
      materiasIds: [software1.body.id, basesDeDatos.body.id],
    });
    expect(updated.status).toBe(200);
    expect(new Set(updated.body.materiasIds)).toEqual(new Set([software1.body.id, basesDeDatos.body.id]));

    const fetched = await backend.client.get<{ materiasIds: number[] }>(`/api/estudiantes/${pedro.body.id}`);
    expect(new Set(fetched.body.materiasIds)).toEqual(new Set([software1.body.id, basesDeDatos.body.id]));
  });

  it('esquema: la tabla asociativa tiene PK compuesta por las dos FK', () => {
    const rows = backend.db.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_name = 'estudiante_materia' AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.column_name;`,
    );
    expect(rows).toEqual(['estudiante_id', 'materia_id']);
  });
});
