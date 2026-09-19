import type { UMLModel } from '../../src/model/types';
import { attr, cls, rel, toRelationalModel, MANY } from './umlBuilders';

/** Fixture 3 (regla 17): Estudiante * -- * Materia, tabla asociativa pura (sin atributos propios) -- ejercita el @ManyToMany expuesto por ids que se agregó como fix de Fase 10 durante esta misma fase. */
export function buildManyToManyModel(): UMLModel {
  return {
    classes: [
      cls('estudiante', 'Estudiante', [attr('e-id', 'id', 'Long', true), attr('e-nombre', 'nombre', 'String')]),
      cls('materia', 'Materia', [attr('m-id', 'id', 'Long', true), attr('m-nombre', 'nombre', 'String')]),
    ],
    relationships: [rel('r-estudiante-materia', 'ASSOCIATION', 'estudiante', 'materia', MANY, MANY)],
  };
}

export const manyToManyRelationalModel = () => toRelationalModel(buildManyToManyModel());
