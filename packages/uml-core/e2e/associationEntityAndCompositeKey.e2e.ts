import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGeneratedBackend, type RunningGeneratedBackend } from './infra/pipeline';
import { buildAssociationEntityModel } from './fixtures/associationEntityAndCompositeKey';

/**
 * Fixture 4: DetalleVenta (venta_id + producto_id como PK compuesta vía
 * @EmbeddedId, más cantidad/precio propios) -- prueba que una tabla
 * asociativa CON atributos no pierde información (regla 18) y que la PK
 * compuesta funciona de punta a punta (regla 19). Solo expone
 * listar+crear (ver limitación documentada en el informe de Fase 10:
 * todavía no hay convención de URL para PK compuesta en el path).
 */
describe('E2E: DetalleVenta (entidad asociativa con atributos, PK compuesta)', () => {
  let backend: RunningGeneratedBackend;

  beforeAll(async () => {
    backend = await startGeneratedBackend(buildAssociationEntityModel(), '/api/ventas');
  });

  afterAll(() => {
    backend?.stop();
  });

  it('crea Venta, Producto y DetalleVenta sin perder cantidad/precio', async () => {
    const venta = await backend.client.post<{ id: number }>('/api/ventas', { fecha: '2026-02-01' });
    const producto = await backend.client.post<{ id: number }>('/api/productos', { nombre: 'Teclado' });
    expect(venta.status).toBe(201);
    expect(producto.status).toBe(201);

    const detalle = await backend.client.post<{ ventaId: number; productoId: number; cantidad: number; precio: number }>(
      '/api/detalle_ventas',
      { ventaId: venta.body.id, productoId: producto.body.id, cantidad: 3, precio: 25.5 },
    );
    expect(detalle.status).toBe(201);
    expect(detalle.body.ventaId).toBe(venta.body.id);
    expect(detalle.body.productoId).toBe(producto.body.id);
    expect(detalle.body.cantidad).toBe(3);

    const all = await backend.client.get<Array<{ ventaId: number; productoId: number }>>('/api/detalle_ventas');
    expect(all.body.some((d) => d.ventaId === venta.body.id && d.productoId === producto.body.id)).toBe(true);
  });

  it('esquema: detalle_venta tiene PK compuesta (venta_id, producto_id)', () => {
    const rows = backend.db.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.table_name = 'detalle_venta' AND tc.constraint_type = 'PRIMARY KEY'
       ORDER BY kcu.column_name;`,
    );
    expect(rows).toEqual(['producto_id', 'venta_id']);
  });

  it('no permite un duplicado exacto de la misma PK compuesta (equals/hashCode del @EmbeddedId funcionan)', async () => {
    const venta = await backend.client.post<{ id: number }>('/api/ventas', { fecha: '2026-02-02' });
    const producto = await backend.client.post<{ id: number }>('/api/productos', { nombre: 'Mouse' });
    const first = await backend.client.post<unknown>('/api/detalle_ventas', {
      ventaId: venta.body.id,
      productoId: producto.body.id,
      cantidad: 1,
      precio: 10,
    });
    expect(first.status).toBe(201);

    const duplicate = await backend.client.post<unknown>('/api/detalle_ventas', {
      ventaId: venta.body.id,
      productoId: producto.body.id,
      cantidad: 5,
      precio: 99,
    });
    expect(duplicate.status).toBeGreaterThanOrEqual(400);
    expect(duplicate.status).toBeLessThan(500);
  });
});
