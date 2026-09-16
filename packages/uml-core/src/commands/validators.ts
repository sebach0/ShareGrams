import type { Multiplicity, UMLClass, UMLModel, UMLRelationship } from '../model/types';

export function findClass(model: UMLModel, classId: string): UMLClass | undefined {
  return model.classes.find((c) => c.id === classId);
}

export function findRelationship(model: UMLModel, relationshipId: string): UMLRelationship | undefined {
  return model.relationships.find((r) => r.id === relationshipId);
}

export function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function classNameExists(model: UMLModel, name: string, ignoreClassId?: string): boolean {
  const normalized = name.trim().toLowerCase();
  return model.classes.some((c) => c.id !== ignoreClassId && c.name.trim().toLowerCase() === normalized);
}

export function attributeNameExists(umlClass: UMLClass, name: string, ignoreAttributeId?: string): boolean {
  const normalized = name.trim().toLowerCase();
  return umlClass.attributes.some(
    (a) => a.id !== ignoreAttributeId && a.name.trim().toLowerCase() === normalized,
  );
}

export function isValidMultiplicity(multiplicity: Multiplicity): boolean {
  if (multiplicity.lower < 0) return false;
  if (multiplicity.upper === '*') return true;
  return multiplicity.upper >= multiplicity.lower;
}
