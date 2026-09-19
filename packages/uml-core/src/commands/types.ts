import type { AnchorDirection, LabelOffset, Multiplicity, Position, PrimitiveType, RelationshipType, UMLModel, Waypoint } from '../model/types';

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
  isPrimaryKey?: boolean;
}

export interface UpdateAttributeCommand {
  type: 'UPDATE_ATTRIBUTE';
  classId: string;
  attributeId: string;
  name: string;
  attributeType: PrimitiveType;
  isPrimaryKey?: boolean;
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
  /** Nombre de la asociación (dato UML real, ej. "Pertenece"). */
  name?: string;
  /** Punto exacto de enganche en cada extremo. Ausente = se calcula automáticamente. */
  sourceAnchor?: AnchorDirection;
  targetAnchor?: AnchorDirection;
}

/**
 * sourceRole/targetRole/name son datos UML reales: este comando siempre
 * sobreescribe los tres con lo que traiga (igual que ya hacía antes con los
 * roles) -- quien llame y quiera tocar solo uno tiene que reenviar el valor
 * actual de los otros dos, no dejarlos en blanco por accidente.
 */
export interface UpdateRelationshipCommand {
  type: 'UPDATE_RELATIONSHIP';
  relationshipId: string;
  sourceRole?: string;
  targetRole?: string;
  name?: string;
}

/**
 * Metadata de presentación pura (dónde se engancha cada extremo, dónde
 * quedó arrastrada cada etiqueta). A diferencia de UPDATE_RELATIONSHIP,
 * ESTE comando sí hace merge parcial de verdad: un campo ausente en el
 * comando deja el valor actual sin tocar, porque cada arrastre normalmente
 * solo cambia una cosa (un extremo, o una etiqueta) y forzar a reenviar
 * las otras cuatro en cada drag sería un despropósito.
 */
export interface UpdateRelationshipLayoutCommand {
  type: 'UPDATE_RELATIONSHIP_LAYOUT';
  relationshipId: string;
  sourceAnchor?: AnchorDirection;
  targetAnchor?: AnchorDirection;
  sourceLabelOffset?: LabelOffset;
  targetLabelOffset?: LabelOffset;
  nameLabelOffset?: LabelOffset;
  /** A diferencia de los demás campos de este comando, waypoints REEMPLAZA la lista entera cuando viene presente (agregar/mover/quitar un punto siempre se calcula la lista completa nueva del lado del canvas). */
  waypoints?: Waypoint[];
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
  | UpdateRelationshipLayoutCommand
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
