import type { UMLModel } from '../../model/types';
import type {
  CreateRelationshipCommand,
  UpdateRelationshipCommand,
  DeleteRelationshipCommand,
  UpdateMultiplicityCommand,
  CommandResult,
} from '../../commands/types';
import { fail, ok } from '../../commands/types';
import { findClass, findRelationship, isValidMultiplicity } from '../../commands/validators';

export function createRelationship(model: UMLModel, command: CreateRelationshipCommand): CommandResult {
  if (findRelationship(model, command.relationshipId)) {
    return fail('DUPLICATE_ID', `Ya existe una relación con id ${command.relationshipId}.`);
  }
  if (!findClass(model, command.sourceClassId)) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.sourceClassId}.`);
  }
  if (!findClass(model, command.targetClassId)) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.targetClassId}.`);
  }

  if (command.relationshipType === 'GENERALIZATION') {
    if (command.sourceMultiplicity || command.targetMultiplicity) {
      return fail('INVALID_MULTIPLICITY', 'Una generalización (herencia) no admite multiplicidades.');
    }
  } else {
    if (!command.sourceMultiplicity || !command.targetMultiplicity) {
      return fail('MISSING_MULTIPLICITY', 'La relación requiere multiplicidad en ambos extremos.');
    }
    if (!isValidMultiplicity(command.sourceMultiplicity) || !isValidMultiplicity(command.targetMultiplicity)) {
      return fail('INVALID_MULTIPLICITY', 'La multiplicidad indicada no es válida.');
    }
  }

  return ok({
    ...model,
    relationships: [
      ...model.relationships,
      {
        id: command.relationshipId,
        type: command.relationshipType,
        sourceClassId: command.sourceClassId,
        targetClassId: command.targetClassId,
        sourceMultiplicity: command.sourceMultiplicity,
        targetMultiplicity: command.targetMultiplicity,
      },
    ],
  });
}

export function updateRelationship(model: UMLModel, command: UpdateRelationshipCommand): CommandResult {
  const target = findRelationship(model, command.relationshipId);
  if (!target) {
    return fail('RELATIONSHIP_NOT_FOUND', `No existe una relación con id ${command.relationshipId}.`);
  }

  return ok({
    ...model,
    relationships: model.relationships.map((r) =>
      r.id === command.relationshipId
        ? { ...r, sourceRole: command.sourceRole, targetRole: command.targetRole }
        : r,
    ),
  });
}

export function deleteRelationship(model: UMLModel, command: DeleteRelationshipCommand): CommandResult {
  if (!findRelationship(model, command.relationshipId)) {
    return fail('RELATIONSHIP_NOT_FOUND', `No existe una relación con id ${command.relationshipId}.`);
  }

  return ok({
    ...model,
    relationships: model.relationships.filter((r) => r.id !== command.relationshipId),
  });
}

export function updateMultiplicity(model: UMLModel, command: UpdateMultiplicityCommand): CommandResult {
  const target = findRelationship(model, command.relationshipId);
  if (!target) {
    return fail('RELATIONSHIP_NOT_FOUND', `No existe una relación con id ${command.relationshipId}.`);
  }
  if (target.type === 'GENERALIZATION') {
    return fail('INVALID_MULTIPLICITY', 'Una generalización (herencia) no admite multiplicidades.');
  }
  if (!isValidMultiplicity(command.multiplicity)) {
    return fail('INVALID_MULTIPLICITY', 'La multiplicidad indicada no es válida.');
  }

  const field = command.end === 'source' ? 'sourceMultiplicity' : 'targetMultiplicity';

  return ok({
    ...model,
    relationships: model.relationships.map((r) =>
      r.id === command.relationshipId ? { ...r, [field]: command.multiplicity } : r,
    ),
  });
}
