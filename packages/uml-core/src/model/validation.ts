import type { UMLModel } from './types';

export interface ModelValidationError {
  code: string;
  message: string;
}

/**
 * Validación estructural de un UMLModel completo (integridad referencial,
 * ids únicos). Se usa como defensa antes de persistir un modelo que llega
 * desde afuera (guardado manual, importador XMI, reconocimiento de imagen),
 * además de las validaciones por comando que ya hace el CommandHandler.
 */
export function validateModel(model: UMLModel): ModelValidationError[] {
  const errors: ModelValidationError[] = [];
  const classIds = new Set<string>();

  for (const umlClass of model.classes) {
    if (classIds.has(umlClass.id)) {
      errors.push({ code: 'DUPLICATE_CLASS_ID', message: `Id de clase duplicado: ${umlClass.id}` });
    }
    classIds.add(umlClass.id);

    const attributeIds = new Set<string>();
    for (const attribute of umlClass.attributes) {
      if (attributeIds.has(attribute.id)) {
        errors.push({
          code: 'DUPLICATE_ATTRIBUTE_ID',
          message: `Id de atributo duplicado "${attribute.id}" en la clase "${umlClass.name}".`,
        });
      }
      attributeIds.add(attribute.id);
    }
  }

  const relationshipIds = new Set<string>();
  for (const relationship of model.relationships) {
    if (relationshipIds.has(relationship.id)) {
      errors.push({ code: 'DUPLICATE_RELATIONSHIP_ID', message: `Id de relación duplicado: ${relationship.id}` });
    }
    relationshipIds.add(relationship.id);

    if (!classIds.has(relationship.sourceClassId)) {
      errors.push({
        code: 'DANGLING_RELATIONSHIP',
        message: `La relación ${relationship.id} referencia una clase de origen inexistente.`,
      });
    }
    if (!classIds.has(relationship.targetClassId)) {
      errors.push({
        code: 'DANGLING_RELATIONSHIP',
        message: `La relación ${relationship.id} referencia una clase de destino inexistente.`,
      });
    }
  }

  return errors;
}

export function isValidModel(model: UMLModel): boolean {
  return validateModel(model).length === 0;
}
