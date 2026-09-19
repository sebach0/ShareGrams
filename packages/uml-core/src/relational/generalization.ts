import type { UMLModel } from '../model/types';

export interface ParentLink {
  relationshipId: string;
  supertypeId: string;
}

/**
 * Mapa subtipo -> {relationshipId, supertypeId}, a partir de las relaciones
 * GENERALIZATION del modelo (sourceClassId = subtipo, targetClassId =
 * supertipo -- misma convención que ya usa xmi/export.ts). Se asume que el
 * modelo ya pasó validateForTransformation (a lo sumo un padre por clase,
 * sin ciclos); el transformador nunca llama a esto sobre un modelo que no
 * haya validado antes.
 */
export function buildParentMap(model: UMLModel): Map<string, ParentLink> {
  const parentOf = new Map<string, ParentLink>();
  for (const relationship of model.relationships) {
    if (relationship.type !== 'GENERALIZATION') continue;
    parentOf.set(relationship.sourceClassId, {
      relationshipId: relationship.id,
      supertypeId: relationship.targetClassId,
    });
  }
  return parentOf;
}
