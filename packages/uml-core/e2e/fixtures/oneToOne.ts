import type { UMLModel } from '../../src/model/types';
import { attr, cls, rel, toRelationalModel, ONE } from './umlBuilders';

/** Fixture 2 (regla 16): Persona 1 -- 1 Pasaporte. La FK en pasaporte trae UNIQUE -- crear un segundo pasaporte para la misma persona debe fallar sin tumbar la app. */
export function buildOneToOneModel(): UMLModel {
  return {
    classes: [
      cls('persona', 'Persona', [attr('pe-id', 'id', 'Long', true), attr('pe-nombre', 'nombre', 'String')]),
      cls('pasaporte', 'Pasaporte', [attr('pa-id', 'id', 'Long', true), attr('pa-numero', 'numero', 'String')]),
    ],
    relationships: [rel('r-persona-pasaporte', 'ASSOCIATION', 'persona', 'pasaporte', ONE, ONE)],
  };
}

export const oneToOneRelationalModel = () => toRelationalModel(buildOneToOneModel());
