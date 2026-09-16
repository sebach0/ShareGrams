export type PrimitiveType =
  | 'String'
  | 'Integer'
  | 'Long'
  | 'Double'
  | 'Boolean'
  | 'Date'
  | 'DateTime'
  | 'BigDecimal';

export const PRIMITIVE_TYPES: readonly PrimitiveType[] = [
  'String',
  'Integer',
  'Long',
  'Double',
  'Boolean',
  'Date',
  'DateTime',
  'BigDecimal',
];

export type RelationshipType = 'ASSOCIATION' | 'AGGREGATION' | 'COMPOSITION' | 'GENERALIZATION';

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  'ASSOCIATION',
  'AGGREGATION',
  'COMPOSITION',
  'GENERALIZATION',
];

/** Metadata de presentación, no forma parte de la semántica UML. */
export interface Position {
  x: number;
  y: number;
}

export interface Multiplicity {
  lower: number;
  upper: number | '*';
}

export interface UMLAttribute {
  id: string;
  name: string;
  type: PrimitiveType;
}

export interface UMLClass {
  id: string;
  name: string;
  attributes: UMLAttribute[];
  position: Position;
}

export interface UMLRelationship {
  id: string;
  type: RelationshipType;
  sourceClassId: string;
  targetClassId: string;
  /** Ausente para GENERALIZATION: la herencia no tiene multiplicidad. */
  sourceMultiplicity?: Multiplicity;
  targetMultiplicity?: Multiplicity;
  sourceRole?: string;
  targetRole?: string;
}

export interface UMLModel {
  classes: UMLClass[];
  relationships: UMLRelationship[];
}
