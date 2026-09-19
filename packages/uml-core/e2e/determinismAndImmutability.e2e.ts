import { describe, expect, it } from 'vitest';
import { generateSpringBootProject } from '../src/generator/springboot/projectGenerator';
import { coreCrudAndOneToManyRelationalModel } from './fixtures/coreCrudAndOneToMany';
import { manyToManyRelationalModel } from './fixtures/manyToMany';
import { buildAssociationEntityModel } from './fixtures/associationEntityAndCompositeKey';

/**
 * Reglas 30-31, a nivel de los fixtures reales de esta fase (no solo los
 * modelos sintéticos chicos de los tests unitarios de Fase 10). No compila
 * ni arranca nada -- por eso vive junto a los demás .e2e.ts (misma config,
 * mismo comando `test:e2e`) pero es rápido, no necesita su propio ciclo
 * generate→compile→run.
 */
describe('determinismo e inmutabilidad sobre los fixtures de Fase 11', () => {
  it.each([
    ['core-crud-and-one-to-many', coreCrudAndOneToManyRelationalModel()],
    ['many-to-many', manyToManyRelationalModel()],
    ['association-entity-and-composite-key', buildAssociationEntityModel()],
  ])('%s: generar dos veces produce exactamente el mismo proyecto, sin mutar el RelationalModel', (_label, model) => {
    const snapshot = JSON.parse(JSON.stringify(model));
    const first = generateSpringBootProject(model);
    const second = generateSpringBootProject(model);
    expect(first).toEqual(second);
    expect(model).toEqual(snapshot);
  });
});
