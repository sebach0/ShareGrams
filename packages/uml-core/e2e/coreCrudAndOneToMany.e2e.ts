import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGeneratedBackend, type RunningGeneratedBackend } from './infra/pipeline';
import { buildCoreCrudAndOneToManyModel, coreCrudAndOneToManyRelationalModel } from './fixtures/coreCrudAndOneToMany';

/**
 * Fixture 1: Cliente (CRUD completo) + Pedido (1:N, FK nullable). Un solo
 * backend generado, compilado y arrancado para todo este describe (regla
 * 29) -- las distintas verificaciones comparten la misma instancia, el
 * aislamiento real (DB/puerto propios) ya se dio al arrancar.
 */
describe('E2E: Cliente/Pedido (CRUD, 1:N, nullable, errores, JSON)', () => {
  let backend: RunningGeneratedBackend;
  let clienteId: number;

  beforeAll(async () => {
    backend = await startGeneratedBackend(
      coreCrudAndOneToManyRelationalModel(),
      '/api/clientes',
      undefined,
      buildCoreCrudAndOneToManyModel(),
    );
  });

  afterAll(() => {
    backend?.stop();
  });

  it('CREATE: POST /api/clientes crea el cliente y genera un id', async () => {
    const res = await backend.client.post<{ id: number; nombre: string; email: string }>('/api/clientes', {
      nombre: 'Carlos',
      email: 'carlos@test.com',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('number');
    expect(res.body.nombre).toBe('Carlos');
    expect(res.body.email).toBe('carlos@test.com');
    clienteId = res.body.id;
  });

  it('GET ALL: el cliente creado aparece en la lista', async () => {
    const res = await backend.client.get<Array<{ id: number }>>('/api/clientes');
    expect(res.status).toBe(200);
    expect(res.body.some((c) => c.id === clienteId)).toBe(true);
  });

  it('GET BY ID: devuelve el contenido correcto', async () => {
    const res = await backend.client.get<{ id: number; nombre: string }>(`/api/clientes/${clienteId}`);
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Carlos');
  });

  it('UPDATE: PUT persiste el cambio de verdad (se vuelve a consultar)', async () => {
    const put = await backend.client.put<{ nombre: string }>(`/api/clientes/${clienteId}`, {
      nombre: 'Carlos Perez',
      email: 'carlos@test.com',
    });
    expect(put.status).toBe(200);
    const get = await backend.client.get<{ nombre: string }>(`/api/clientes/${clienteId}`);
    expect(get.body.nombre).toBe('Carlos Perez');
  });

  it('persistencia real: el registro existe en PostgreSQL, no solo en la respuesta HTTP', () => {
    const rows = backend.db.query(`SELECT nombre FROM cliente WHERE id = ${clienteId};`);
    expect(rows).toEqual(['Carlos Perez']);
  });

  it('esquema: pedido.cliente_id existe y es nullable', () => {
    const rows = backend.db.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'pedido' AND column_name = 'cliente_id';`,
    );
    expect(rows).toEqual(['YES']);
  });

  it('1:N: un Pedido creado con clienteId apunta al Cliente correcto', async () => {
    const created = await backend.client.post<{ id: number; clienteId: number }>('/api/pedidos', {
      fecha: '2026-01-15',
      total: 199.9,
      clienteId,
    });
    expect(created.status).toBe(201);
    expect(created.body.clienteId).toBe(clienteId);

    const fetched = await backend.client.get<{ clienteId: number }>(`/api/pedidos/${created.body.id}`);
    expect(fetched.body.clienteId).toBe(clienteId);
  });

  it('nullable: un Pedido sin clienteId (relación 0..1) se crea igual', async () => {
    const res = await backend.client.post<{ id: number; clienteId: number | null }>('/api/pedidos', {
      fecha: '2026-01-16',
      total: 10,
      clienteId: null,
    });
    expect(res.status).toBe(201);
    expect(res.body.clienteId).toBeNull();
  });

  it('required: un Pedido sin fecha (NOT NULL) es rechazado con 400, no 500', async () => {
    const res = await backend.client.post<unknown>('/api/pedidos', { total: 10, clienteId });
    expect(res.status).toBe(400);
  });

  it('DELETE: borra y una consulta posterior da 404', async () => {
    // Cliente propio para este caso, sin Pedidos que lo referencien -- el
    // `clienteId` de los tests anteriores ya tiene un Pedido asociado (ver
    // el test de 1:N), y borrarlo violaría la FK (409, comportamiento
    // correcto de integridad referencial, no lo que este test quiere probar).
    const created = await backend.client.post<{ id: number }>('/api/clientes', { nombre: 'Descartable', email: 'x@test.com' });
    const targetId = created.body.id;

    const del = await backend.client.delete<unknown>(`/api/clientes/${targetId}`);
    expect(del.status).toBe(204);
    const after = await backend.client.get<unknown>(`/api/clientes/${targetId}`);
    expect(after.status).toBe(404);
  });

  it('integridad: borrar un Cliente con Pedidos asociados da 409, no 500', async () => {
    const del = await backend.client.delete<unknown>(`/api/clientes/${clienteId}`);
    expect(del.status).toBe(409);
  });

  it('error handling: GET a un id inexistente da 404 (nunca 500)', async () => {
    const res = await backend.client.get<unknown>('/api/clientes/999999');
    expect(res.status).toBe(404);
  });

  it('JSON: el Pedido devuelto no anida el Cliente (sin ciclo, DTO plano)', async () => {
    const res = await backend.client.get<Record<string, unknown>>('/api/pedidos');
    const body = res.body as unknown as Array<Record<string, unknown>>;
    expect(body.length).toBeGreaterThan(0);
    for (const pedido of body) {
      expect(pedido).not.toHaveProperty('cliente');
      expect(typeof pedido.clienteId === 'number' || pedido.clienteId === null).toBe(true);
    }
  });

  it('Swagger: el endpoint de OpenAPI expone las rutas generadas', async () => {
    const res = await backend.client.get<{ paths: Record<string, unknown> }>('/v3/api-docs');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/api/clientes', '/api/clientes/{id}']));
  });

  it('Fase 12: GET /api/meta devuelve el Domain Manifest real -- JSON válido, versionado, con Cliente y Pedido y la relación 1:N', async () => {
    const res = await backend.client.get<{
      version: string;
      application: { name: string };
      entities: Array<{ name: string; relations: Array<{ name: string; targetEntity: string; cardinality: string; required: boolean }> }>;
    }>('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1.0');
    const names = res.body.entities.map((e) => e.name).sort();
    expect(names).toEqual(['Cliente', 'Pedido']);
    const pedido = res.body.entities.find((e) => e.name === 'Pedido')!;
    // required:false porque el fixture usa Cliente 0..1 (ver coreCrudAndOneToMany.ts) -- cliente_id es nullable de verdad.
    expect(pedido.relations).toEqual([{ name: 'clienteId', targetEntity: 'Cliente', cardinality: 'MANY_TO_ONE', required: false }]);
  });

  it('CORS: la respuesta trae Access-Control-Allow-Origin -- regresión de un bug real (encontrado probando la app móvil en el navegador: sin esto, un cliente en otro origen nunca puede leer la respuesta aunque el backend responda 200)', async () => {
    const res = await fetch(`${backend.baseUrl}/api/meta`, { headers: { Origin: 'http://localhost:8081' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });
});
