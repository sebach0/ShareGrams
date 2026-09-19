import type { RelationalModel, RelationalTable } from '../../src/relational/types';

/**
 * Fixture 4 (reglas 18-19): tabla asociativa CON atributos propios
 * (DetalleVenta: cantidad) -- PK compuesta vía @EmbeddedId.
 *
 * A diferencia de los demás fixtures, este se arma directamente como
 * RelationalModel en vez de pasar por transformUmlToRelational: la Fase 9
 * documentó explícitamente que no soporta AssociationClass todavía (no hay
 * forma de expresar "relación N:M con atributos propios" en el UML
 * canónico actual), así que este caso hoy solo es alcanzable construyendo
 * el RelationalModel a mano -- exactamente lo que ya hacían los tests
 * unitarios de Fase 10 para este mismo escenario. No es una reinterpretación
 * de UML (no hay UML de origen), es el único punto de entrada posible hoy.
 */
export function buildAssociationEntityModel(): RelationalModel {
  const ventaTable: RelationalTable = {
    id: 'venta',
    name: 'venta',
    columns: [
      { id: 'v-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'venta', attributeId: 'v-id' } },
      { id: 'v-fecha', name: 'fecha', type: 'DATE', nullable: false, origin: { kind: 'attribute', classId: 'venta', attributeId: 'v-fecha' } },
    ],
    primaryKey: { columns: ['id'] },
    foreignKeys: [],
    uniqueConstraints: [],
    origin: { kind: 'class', classId: 'venta' },
  };
  const productoTable: RelationalTable = {
    id: 'producto',
    name: 'producto',
    columns: [
      { id: 'pr-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'producto', attributeId: 'pr-id' } },
      { id: 'pr-nombre', name: 'nombre', type: 'VARCHAR', nullable: false, origin: { kind: 'attribute', classId: 'producto', attributeId: 'pr-nombre' } },
    ],
    primaryKey: { columns: ['id'] },
    foreignKeys: [],
    uniqueConstraints: [],
    origin: { kind: 'class', classId: 'producto' },
  };
  const detalleVentaTable: RelationalTable = {
    id: 'detalle_venta',
    name: 'detalle_venta',
    columns: [
      { id: 'dv-venta', name: 'venta_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r-detalle', end: 'source' } },
      { id: 'dv-producto', name: 'producto_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r-detalle', end: 'target' } },
      { id: 'dv-cantidad', name: 'cantidad', type: 'INTEGER', nullable: false, origin: { kind: 'attribute', classId: 'detalle_venta', attributeId: 'dv-cantidad' } },
      { id: 'dv-precio', name: 'precio', type: 'NUMERIC', nullable: false, origin: { kind: 'attribute', classId: 'detalle_venta', attributeId: 'dv-precio' } },
    ],
    primaryKey: { columns: ['venta_id', 'producto_id'] },
    foreignKeys: [
      { id: 'r-detalle:source-fk', columns: ['venta_id'], referencedTable: 'venta', referencedColumns: ['id'] },
      { id: 'r-detalle:target-fk', columns: ['producto_id'], referencedTable: 'producto', referencedColumns: ['id'] },
    ],
    uniqueConstraints: [],
    origin: { kind: 'many-to-many', relationshipId: 'r-detalle' },
  };

  return { tables: [ventaTable, productoTable, detalleVentaTable] };
}
