import type { Multiplicity, Position, PrimitiveType, RelationshipType, UMLModel } from '../model/types';

export interface CreateClassCommand {
  type: 'CREATE_CLASS';
  classId: string;
  name: string;
  position: Position;
}

export interface UpdateClassCommand {
  type: 'UPDATE_CLASS';
  classId: string;
  name: string;
}

export interface MoveClassCommand {
  type: 'MOVE_CLASS';
  classId: string;
  position: Position;
}

export interface DeleteClassCommand {
  type: 'DELETE_CLASS';
  classId: string;
}

export interface AddAttributeCommand {
  type: 'ADD_ATTRIBUTE';
  classId: string;
  attributeId: string;
  name: string;
  attributeType: PrimitiveType;
}

export interface UpdateAttributeCommand {
  type: 'UPDATE_ATTRIBUTE';
  classId: string;
  attributeId: string;
  name: string;
  attributeType: PrimitiveType;
}

export interface DeleteAttributeCommand {
  type: 'DELETE_ATTRIBUTE';
  classId: string;
  attributeId: string;
}

export interface CreateRelationshipCommand {
  type: 'CREATE_RELATIONSHIP';
  relationshipId: string;
  relationshipType: RelationshipType;
  sourceClassId: string;
  targetClassId: string;
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
}

export interface UpdateRelationshipCommand {
  type: 'UPDATE_RELATIONSHIP';
  relationshipId: string;
  sourceRole?: string;
  targetRole?: string;
}

export interface DeleteRelationshipCommand {
  type: 'DELETE_RELATIONSHIP';
  relationshipId: string;
}

export interface UpdateMultiplicityCommand {
  type: 'UPDATE_MULTIPLICITY';
  relationshipId: string;
  end: 'source' | 'target';
  multiplicity: Multiplicity;
}

export type Command =
  | CreateClassCommand
  | UpdateClassCommand
  | MoveClassCommand
  | DeleteClassCommand
  | AddAttributeCommand
  | UpdateAttributeCommand
  | DeleteAttributeCommand
  | CreateRelationshipCommand
  | UpdateRelationshipCommand
  | DeleteRelationshipCommand
  | UpdateMultiplicityCommand;

export type CommandType = Command['type'];

export interface CommandError {
  code: string;
  message: string;
}

export type CommandResult =
  | { ok: true; model: UMLModel }
  | { ok: false; error: CommandError };

export function ok(model: UMLModel): CommandResult {
  return { ok: true, model };
}

export function fail(code: string, message: string): CommandResult {
  return { ok: false, error: { code, message } };
}
