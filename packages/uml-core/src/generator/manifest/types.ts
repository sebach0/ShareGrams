/**
 * Contrato que descubre la app móvil (o cualquier otro cliente genérico)
 * al llamar GET /api/meta de un backend generado. Deliberadamente NO
 * incluye tipos SQL/Java -- son tipos de dominio normalizados (ver
 * domainTypeMapper.ts), para que el cliente nunca necesite saber qué base
 * de datos ni qué lenguaje generó el backend.
 */
export const MANIFEST_VERSION = '1.0';

export type DomainType =
  | 'string'
  | 'integer'
  | 'long'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'enum'
  | 'relation';

export type Operation = 'LIST' | 'GET' | 'CREATE' | 'UPDATE' | 'DELETE';

export type RelationCardinality = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';

/**
 * A diferencia de la referencia conceptual de la consigna (un solo
 * `field`/`type`), acá `fields` es siempre un array: una entidad con PK
 * compuesta (ver Fase 10, join table con atributos propios) no tiene un
 * único campo "id" en su JSON -- su identidad es la combinación de sus
 * relaciones. Con `fields.length === 1` se cubre el caso simple sin
 * necesitar un tipo separado para cada caso.
 */
export interface IdDefinition {
  fields: { name: string; type: DomainType }[];
  generated: boolean;
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: DomainType;
  required: boolean;
  editable: boolean;
  generated: boolean;
  enumValues?: string[];
}

export interface RelationDefinition {
  name: string;
  targetEntity: string;
  cardinality: RelationCardinality;
  required: boolean;
}

export interface EntityDefinition {
  name: string;
  label: string;
  pluralLabel: string;
  endpoint: string;
  /**
   * Ausente para una entidad con PK compuesta: esas entidades no exponen
   * GET/UPDATE/DELETE por id (ver limitación de Fase 10), así que no hay
   * un identificador único con el que la app pueda pedir "una" instancia.
   */
  id?: IdDefinition;
  displayField: string;
  fields: FieldDefinition[];
  relations: RelationDefinition[];
  operations: Operation[];
}

export interface DomainManifest {
  version: typeof MANIFEST_VERSION;
  application: { name: string };
  entities: EntityDefinition[];
}

export interface ManifestGenerationOptions {
  applicationName: string;
}
