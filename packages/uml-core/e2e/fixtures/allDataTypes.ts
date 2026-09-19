import type { UMLModel } from '../../src/model/types';
import { attr, cls, toRelationalModel } from './umlBuilders';

/** Fixture 5 (regla 20): una entidad con los 8 PrimitiveType que soporta hoy el modelo UML -- prueba el round-trip completo RelationalType -> Java -> JDBC -> PostgreSQL -> JSON para cada uno. (UUID/TEXT/REAL de la consigna original no existen en el modelo actual -- ver Fase 9; se prueban los tipos reales.) */
export function buildAllDataTypesModel(): UMLModel {
  return {
    classes: [
      cls('muestra_tipo', 'MuestraTipo', [
        attr('mt-id', 'id', 'Long', true),
        attr('mt-texto', 'texto', 'String'),
        attr('mt-entero', 'entero', 'Integer'),
        attr('mt-largo', 'largo', 'Long'),
        attr('mt-decimal', 'decimal', 'BigDecimal'),
        attr('mt-flotante', 'flotante', 'Double'),
        attr('mt-activo', 'activo', 'Boolean'),
        attr('mt-fecha', 'fecha', 'Date'),
        attr('mt-fechaHora', 'fechaHora', 'DateTime'),
      ]),
    ],
    relationships: [],
  };
}

export const allDataTypesRelationalModel = () => toRelationalModel(buildAllDataTypesModel());
