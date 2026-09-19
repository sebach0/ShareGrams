import type { UMLRelationship } from '../model/types';
import { isOptionalEnd, isToMany } from './multiplicityRules';

export type RelationshipEnd = 'source' | 'target';

/**
 * Cómo resolver una relación (no-GENERALIZATION) ya validada (multiplicidad
 * presente y soportada en ambos extremos) a nivel relacional:
 *
 * - Si ambos extremos admiten "muchos" -> N:M (tabla asociativa, ver
 *   buildJoinTable en transformer.ts).
 * - Si un solo extremo admite "muchos" -> ese lado es quien lleva la FK,
 *   apuntando al lado "uno".
 * - Si ninguno admite "muchos" -> 1:1. Regla determinista de ubicación:
 *   la FK siempre va en el extremo TARGET, apuntando a SOURCE (no depende
 *   de ningún orden interno, solo de cómo se creó la relación).
 *
 * En los tres casos la nulabilidad de la FK sale de la multiplicidad del
 * extremo REFERENCIADO (no del que la contiene): esa multiplicidad es
 * justamente la que dice "cuántas instancias del lado referenciado le
 * corresponden a una fila del lado que tiene la FK".
 */
export interface RelationshipForeignKeyPlan {
  onTable: RelationshipEnd;
  referencedEnd: RelationshipEnd;
  nullable: boolean;
  unique: boolean;
}

export function planRelationshipForeignKey(
  relationship: UMLRelationship,
): RelationshipForeignKeyPlan | 'many-to-many' {
  const sourceMultiplicity = relationship.sourceMultiplicity;
  const targetMultiplicity = relationship.targetMultiplicity;
  if (!sourceMultiplicity || !targetMultiplicity) {
    throw new Error(`planRelationshipForeignKey: relación ${relationship.id} sin multiplicidad en ambos extremos.`);
  }

  const sourceIsMany = isToMany(sourceMultiplicity);
  const targetIsMany = isToMany(targetMultiplicity);

  if (sourceIsMany && targetIsMany) return 'many-to-many';

  if (targetIsMany) {
    return { onTable: 'target', referencedEnd: 'source', nullable: isOptionalEnd(sourceMultiplicity), unique: false };
  }
  if (sourceIsMany) {
    return { onTable: 'source', referencedEnd: 'target', nullable: isOptionalEnd(targetMultiplicity), unique: false };
  }
  // 1:1 -- ningún extremo es "muchos": la FK va en target por convención.
  return { onTable: 'target', referencedEnd: 'source', nullable: isOptionalEnd(sourceMultiplicity), unique: true };
}
