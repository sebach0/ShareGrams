import type { UMLModel } from '../../model/types';
import type {
  CreateClassCommand,
  UpdateClassCommand,
  MoveClassCommand,
  DeleteClassCommand,
  CommandResult,
} from '../../commands/types';
import { fail, ok } from '../../commands/types';
import { classNameExists, findClass, isBlank } from '../../commands/validators';

export function createClass(model: UMLModel, command: CreateClassCommand): CommandResult {
  if (isBlank(command.name)) {
    return fail('INVALID_NAME', 'El nombre de la clase no puede estar vacío.');
  }
  if (findClass(model, command.classId)) {
    return fail('DUPLICATE_ID', `Ya existe una clase con id ${command.classId}.`);
  }
  if (classNameExists(model, command.name)) {
    return fail('DUPLICATE_NAME', `Ya existe una clase llamada "${command.name}".`);
  }

  return ok({
    ...model,
    classes: [
      ...model.classes,
      { id: command.classId, name: command.name.trim(), attributes: [], position: command.position },
    ],
  });
}

export function updateClass(model: UMLModel, command: UpdateClassCommand): CommandResult {
  const target = findClass(model, command.classId);
  if (!target) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.classId}.`);
  }
  if (isBlank(command.name)) {
    return fail('INVALID_NAME', 'El nombre de la clase no puede estar vacío.');
  }
  if (classNameExists(model, command.name, command.classId)) {
    return fail('DUPLICATE_NAME', `Ya existe una clase llamada "${command.name}".`);
  }

  return ok({
    ...model,
    classes: model.classes.map((c) => (c.id === command.classId ? { ...c, name: command.name.trim() } : c)),
  });
}

export function moveClass(model: UMLModel, command: MoveClassCommand): CommandResult {
  const target = findClass(model, command.classId);
  if (!target) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.classId}.`);
  }

  return ok({
    ...model,
    classes: model.classes.map((c) => (c.id === command.classId ? { ...c, position: command.position } : c)),
  });
}

export function deleteClass(model: UMLModel, command: DeleteClassCommand): CommandResult {
  const target = findClass(model, command.classId);
  if (!target) {
    return fail('CLASS_NOT_FOUND', `No existe una clase con id ${command.classId}.`);
  }

  return ok({
    classes: model.classes.filter((c) => c.id !== command.classId),
    relationships: model.relationships.filter(
      (r) => r.sourceClassId !== command.classId && r.targetClassId !== command.classId,
    ),
  });
}
