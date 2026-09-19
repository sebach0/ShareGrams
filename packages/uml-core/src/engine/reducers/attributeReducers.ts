import type { UMLModel } from '../../model/types';
import type {
  AddAttributeCommand,
  UpdateAttributeCommand,
  DeleteAttributeCommand,
  CommandResult,
} from '../../commands/types';
import { fail, ok } from '../../commands/types';
import { attributeNameExists, findClass, isBlank } from '../../commands/validators';

export function addAttribute(model: UMLModel, command: AddAttributeCommand): CommandResult {
  const target = findClass(model, command.classId);
  if (!target) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.classId}.`);
  }
  if (isBlank(command.name)) {
    return fail('INVALID_NAME', 'El nombre del atributo no puede estar vacío.');
  }
  if (target.attributes.some((a) => a.id === command.attributeId)) {
    return fail('DUPLICATE_ID', `Ya existe un atributo con id ${command.attributeId}.`);
  }
  if (attributeNameExists(target, command.name)) {
    return fail('DUPLICATE_NAME', `La clase "${target.name}" ya tiene un atributo "${command.name}".`);
  }

  return ok({
    ...model,
    classes: model.classes.map((c) =>
      c.id === command.classId
        ? {
            ...c,
            attributes: [
              ...c.attributes,
              {
                id: command.attributeId,
                name: command.name.trim(),
                type: command.attributeType,
                isPrimaryKey: command.isPrimaryKey,
              },
            ],
          }
        : c,
    ),
  });
}

export function updateAttribute(model: UMLModel, command: UpdateAttributeCommand): CommandResult {
  const target = findClass(model, command.classId);
  if (!target) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.classId}.`);
  }
  const attribute = target.attributes.find((a) => a.id === command.attributeId);
  if (!attribute) {
    return fail('ATTRIBUTE_NOT_FOUND', `No existe un atributo con id ${command.attributeId}.`);
  }
  if (isBlank(command.name)) {
    return fail('INVALID_NAME', 'El nombre del atributo no puede estar vacío.');
  }
  if (attributeNameExists(target, command.name, command.attributeId)) {
    return fail('DUPLICATE_NAME', `La clase "${target.name}" ya tiene un atributo "${command.name}".`);
  }

  return ok({
    ...model,
    classes: model.classes.map((c) =>
      c.id === command.classId
        ? {
            ...c,
            attributes: c.attributes.map((a) =>
              a.id === command.attributeId
                ? { ...a, name: command.name.trim(), type: command.attributeType, isPrimaryKey: command.isPrimaryKey }
                : a,
            ),
          }
        : c,
    ),
  });
}

export function deleteAttribute(model: UMLModel, command: DeleteAttributeCommand): CommandResult {
  const target = findClass(model, command.classId);
  if (!target) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.classId}.`);
  }
  if (!target.attributes.some((a) => a.id === command.attributeId)) {
    return fail('ATTRIBUTE_NOT_FOUND', `No existe un atributo con id ${command.attributeId}.`);
  }

  return ok({
    ...model,
    classes: model.classes.map((c) =>
      c.id === command.classId
        ? { ...c, attributes: c.attributes.filter((a) => a.id !== command.attributeId) }
        : c,
    ),
  });
}
