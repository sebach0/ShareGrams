import { describe, expect, it } from 'vitest';
import {
  embeddedIdClassName,
  entityClassName,
  fieldName,
  isValidJavaPackageName,
  routeSegment,
  toCamelCase,
  toPascalCase,
} from '../../../src/generator/springboot/naming';

describe('toPascalCase / entityClassName', () => {
  it('convierte snake_case simple', () => {
    expect(entityClassName('cliente')).toBe('Cliente');
  });

  it('convierte snake_case compuesto', () => {
    expect(entityClassName('detalle_pedido')).toBe('DetallePedido');
    expect(entityClassName('pedido_producto')).toBe('PedidoProducto');
  });
});

describe('toCamelCase / fieldName', () => {
  it('convierte snake_case a camelCase', () => {
    expect(fieldName('fecha_registro')).toBe('fechaRegistro');
    expect(fieldName('nombre')).toBe('nombre');
  });
});

describe('routeSegment', () => {
  it('pluraliza agregando "s"', () => {
    expect(routeSegment('cliente')).toBe('clientes');
    expect(routeSegment('pedido')).toBe('pedidos');
  });
});

describe('embeddedIdClassName', () => {
  it('agrega el sufijo Id a la clase de la tabla', () => {
    expect(embeddedIdClassName('pedido_producto')).toBe('PedidoProductoId');
  });
});

describe('isValidJavaPackageName', () => {
  it('acepta un package válido', () => {
    expect(isValidJavaPackageName('com.sharegrams.generated')).toBe(true);
  });

  it('rechaza un segmento que empieza con número', () => {
    expect(isValidJavaPackageName('123.invalid')).toBe(false);
  });

  it('rechaza un package vacío', () => {
    expect(isValidJavaPackageName('')).toBe(false);
  });
});

describe('idempotencia toPascalCase/toCamelCase con guiones', () => {
  it('trata guiones igual que guiones bajos', () => {
    expect(toPascalCase('generated-backend')).toBe('GeneratedBackend');
  });
});
