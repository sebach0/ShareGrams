import { describe, expect, it } from 'vitest';
import {
  attributeToColumnName,
  classToTableName,
  foreignKeyColumnName,
  joinTableName,
  toSnakeCase,
} from '../../src/relational/naming';

describe('toSnakeCase / classToTableName', () => {
  it('convierte PascalCase simple', () => {
    expect(classToTableName('Cliente')).toBe('cliente');
  });

  it('convierte PascalCase compuesto', () => {
    expect(classToTableName('DetallePedido')).toBe('detalle_pedido');
    expect(classToTableName('TipoProducto')).toBe('tipo_producto');
  });

  it('es idempotente si el nombre ya viene en snake_case', () => {
    expect(toSnakeCase('detalle_pedido')).toBe('detalle_pedido');
  });
});

describe('attributeToColumnName', () => {
  it('convierte camelCase', () => {
    expect(attributeToColumnName('fechaRegistro')).toBe('fecha_registro');
  });

  it('deja un nombre simple igual, en minúscula', () => {
    expect(attributeToColumnName('nombre')).toBe('nombre');
  });
});

describe('joinTableName', () => {
  it('concatena origen y destino en ese orden', () => {
    expect(joinTableName('estudiante', 'materia')).toBe('estudiante_materia');
    expect(joinTableName('pedido', 'producto')).toBe('pedido_producto');
  });
});

describe('foreignKeyColumnName', () => {
  it('agrega el sufijo _id a la tabla referenciada', () => {
    expect(foreignKeyColumnName('cliente')).toBe('cliente_id');
  });
});
