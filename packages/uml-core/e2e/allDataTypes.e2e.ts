import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGeneratedBackend, type RunningGeneratedBackend } from './infra/pipeline';
import { allDataTypesRelationalModel } from './fixtures/allDataTypes';

interface MuestraTipo {
  id: number;
  texto: string;
  entero: number;
  largo: number;
  decimal: number;
  flotante: number;
  activo: boolean;
  fecha: string;
  fechaHora: string;
}

/** Fixture 5 (regla 20): round-trip completo RelationalType -> Java -> JDBC -> PostgreSQL -> JSON para los 8 tipos que soporta hoy el modelo. */
describe('E2E: MuestraTipo (todos los tipos de dato soportados)', () => {
  let backend: RunningGeneratedBackend;

  beforeAll(async () => {
    backend = await startGeneratedBackend(allDataTypesRelationalModel(), '/api/muestra_tipos');
  });

  afterAll(() => {
    backend?.stop();
  });

  it('inserta y recupera cada tipo sin perder ni corromper el valor', async () => {
    const payload = {
      texto: 'hola mundo',
      entero: 42,
      largo: 9007199254740991,
      decimal: 1234.56,
      flotante: 3.14,
      activo: true,
      fecha: '2026-03-15',
      fechaHora: '2026-03-15T10:30:00',
    };
    const created = await backend.client.post<MuestraTipo>('/api/muestra_tipos', payload);
    expect(created.status).toBe(201);

    const fetched = await backend.client.get<MuestraTipo>(`/api/muestra_tipos/${created.body.id}`);
    expect(fetched.body.texto).toBe(payload.texto);
    expect(fetched.body.entero).toBe(payload.entero);
    expect(fetched.body.largo).toBe(payload.largo);
    expect(fetched.body.decimal).toBeCloseTo(payload.decimal, 2);
    expect(fetched.body.flotante).toBeCloseTo(payload.flotante, 2);
    expect(fetched.body.activo).toBe(true);
    expect(fetched.body.fecha).toBe(payload.fecha);
    expect(fetched.body.fechaHora.startsWith('2026-03-15T10:30:00')).toBe(true);
  });
});
