import type { Multiplicity, PrimitiveType, UMLAttribute, UMLClass, UMLModel, UMLRelationship } from '../../src/model/types';
import { transformUmlToRelational } from '../../src/relational/transformer';
import type { RelationalModel } from '../../src/relational/types';

export function attr(id: string, name: string, type: PrimitiveType, isPrimaryKey = false): UMLAttribute {
  return { id, name, type, isPrimaryKey: isPrimaryKey || undefined };
}
export function cls(id: string, name: string, attributes: UMLAttribute[] = []): UMLClass {
  return { id, name, attributes, position: { x: 0, y: 0 } };
}
export function rel(
  id: string,
  type: UMLRelationship['type'],
  sourceClassId: string,
  targetClassId: string,
  sourceMultiplicity?: Multiplicity,
  targetMultiplicity?: Multiplicity,
): UMLRelationship {
  return { id, type, sourceClassId, targetClassId, sourceMultiplicity, targetMultiplicity };
}

export const ONE: Multiplicity = { lower: 1, upper: 1 };
export const ZERO_OR_ONE: Multiplicity = { lower: 0, upper: 1 };
export const MANY: Multiplicity = { lower: 0, upper: '*' };

/** Corre el UMLModel del fixture por la Fase 9 real (nunca se construye un RelationalModel a mano salvo que Fase 9 genuinamente no pueda producir ese caso, ver associationEntityAndCompositeKey.ts). */
export function toRelationalModel(model: UMLModel): RelationalModel {
  const result = transformUmlToRelational(model);
  if (!result.ok) {
    throw new Error(`Fixture inválido, Fase 9 lo rechazó: ${result.errors.map((e) => `${e.code}: ${e.message}`).join(' | ')}`);
  }
  return result.model;
}
