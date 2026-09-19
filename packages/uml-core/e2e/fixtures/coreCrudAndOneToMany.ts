import type { UMLModel } from '../../src/model/types';
import { attr, cls, rel, toRelationalModel, ZERO_OR_ONE, MANY } from './umlBuilders';

/**
 * Fixture 1 (reglas 6-7, 15 y 21): Cliente (entidad simple, para el CRUD
 * completo) + Pedido, relacionados 1:N. El extremo Cliente es 0..1 (no 1) a
 * propósito: así `pedido.cliente_id` queda nullable de verdad, y este mismo
 * fixture también sirve para probar la regla 21 (nullable/required) sin
 * necesitar un quinto ciclo aparte -- los atributos escalares (fecha,
 * total, nombre) siempre son NOT NULL, eso ya prueba el lado "required".
 * Cubre en un solo ciclo generar/compilar/arrancar: CRUD completo, 1:N,
 * nullable/required, error handling (404/400) y ausencia de recursión JSON
 * (Pedido -> Cliente sin volver).
 */
export function buildCoreCrudAndOneToManyModel(): UMLModel {
  return {
    classes: [
      cls('cliente', 'Cliente', [attr('c-id', 'id', 'Long', true), attr('c-nombre', 'nombre', 'String'), attr('c-email', 'email', 'String')]),
      cls('pedido', 'Pedido', [attr('p-id', 'id', 'Long', true), attr('p-fecha', 'fecha', 'Date'), attr('p-total', 'total', 'BigDecimal')]),
    ],
    relationships: [rel('r-cliente-pedido', 'ASSOCIATION', 'cliente', 'pedido', ZERO_OR_ONE, MANY)],
  };
}

export const coreCrudAndOneToManyRelationalModel = () => toRelationalModel(buildCoreCrudAndOneToManyModel());
