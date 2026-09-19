/**
 * Tipos lógicos de columna relacional. Deliberadamente NO son tipos SQL de
 * un dialecto concreto (ej. "VARCHAR(255)" o "NUMERIC(10,2)") -- eso es
 * decisión de la Fase 10 (generador Spring Boot/PostgreSQL). Acá solo se
 * conserva la semántica suficiente para que ese generador después elija la
 * representación final.
 */
export type RelationalType =
  | 'VARCHAR'
  | 'INTEGER'
  | 'BIGINT'
  | 'DOUBLE_PRECISION'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP'
  | 'NUMERIC';

/** De dónde salió una columna: de un atributo UML real, o generada por la transformación (FK de una relación, o el enlace de una tabla asociativa/herencia). Útil para que la Fase 10 sepa qué metadata UML original conservar. */
export type RelationalColumnOrigin =
  | { kind: 'attribute'; classId: string; attributeId: string }
  | { kind: 'relationship-fk'; relationshipId: string; end: 'source' | 'target' }
  | { kind: 'generalization-fk'; relationshipId: string };

export interface RelationalColumn {
  id: string;
  name: string;
  type: RelationalType;
  nullable: boolean;
  origin: RelationalColumnOrigin;
}

export interface PrimaryKey {
  columns: string[];
}

export interface ForeignKey {
  id: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

export interface UniqueConstraint {
  columns: string[];
}

/** De dónde salió una tabla: de una UMLClass real, de una relación N:M (tabla asociativa), o de una GENERALIZATION (no aplica -- las tablas de herencia siguen siendo 'class', ver TableOrigin). */
export type RelationalTableOrigin =
  | { kind: 'class'; classId: string }
  | { kind: 'many-to-many'; relationshipId: string };

export interface RelationalTable {
  id: string;
  name: string;
  columns: RelationalColumn[];
  primaryKey?: PrimaryKey;
  foreignKeys: ForeignKey[];
  uniqueConstraints: UniqueConstraint[];
  origin: RelationalTableOrigin;
}

export interface RelationalModel {
  tables: RelationalTable[];
}
