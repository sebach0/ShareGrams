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
  /** Marca explícita de clave primaria (Fase 9, transformación a modelo relacional). Ausente/false = no es PK. */
  isPrimaryKey?: boolean;
}

export interface UMLClass {
  id: string;
  name: string;
  attributes: UMLAttribute[];
  position: Position;
}

/**
 * Dirección (no necesariamente unitaria) desde el centro de una clase hacia
 * el punto exacto de su borde donde se engancha un extremo de relación.
 * Metadata de presentación pura, como Position: no tiene efecto en la
 * semántica UML. Ausente = el canvas calcula el punto automáticamente
 * (apuntando al centro de la otra clase) en vez de anclarlo a mano.
 */
export interface AnchorDirection {
  dx: number;
  dy: number;
}

/** Desplazamiento manual (en píxeles del canvas) de una etiqueta respecto a su posición calculada por defecto. */
export interface LabelOffset {
  dx: number;
  dy: number;
}

/** Punto de quiebre intermedio de una relación, en coordenadas absolutas del canvas (como Position de una clase). Permite dibujar la línea con ángulos en vez de una curva directa entre los dos extremos. */
export interface Waypoint {
  x: number;
  y: number;
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
  /** Nombre de la asociación (dato UML real, ej. "Pertenece"). Ausente para GENERALIZATION. */
  name?: string;
  sourceAnchor?: AnchorDirection;
  targetAnchor?: AnchorDirection;
  sourceLabelOffset?: LabelOffset;
  targetLabelOffset?: LabelOffset;
  nameLabelOffset?: LabelOffset;
  /** Ausente o vacío = línea directa entre los dos extremos (curva automática). */
  waypoints?: Waypoint[];
}

export interface UMLModel {
  classes: UMLClass[];
  relationships: UMLRelationship[];
}
