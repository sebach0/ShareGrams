export interface JavaScalarField {
  fieldName: string;
  columnName: string;
  javaType: string;
  importFqcn?: string;
  nullable: boolean;
}

export interface JavaRelationshipField {
  kind: 'MANY_TO_ONE' | 'ONE_TO_ONE';
  fieldName: string;
  targetClassName: string;
  joinColumnName: string;
  nullable: boolean;
  /** Presente cuando esta FK también forma parte de una PK compuesta: nombre del atributo correspondiente en la clase *Id embebida, usado en @MapsId(...). */
  mapsIdAttribute?: string;
}

export interface JavaManyToManyField {
  fieldName: string;
  targetClassName: string;
  joinTableName: string;
  joinColumnName: string;
  inverseJoinColumnName: string;
}

export type JavaPrimaryKeyModel =
  | { kind: 'simple'; field: JavaScalarField; generated: boolean }
  | { kind: 'inherited'; parentClassName: string; joinColumnName: string }
  | {
      kind: 'embedded';
      idClassName: string;
      parts: { attributeName: string; javaType: string; importFqcn?: string; mapsIdAttribute: string }[];
    };

export interface JavaEntityModel {
  className: string;
  tableName: string;
  routeSegment: string;
  scalarFields: JavaScalarField[];
  relationships: JavaRelationshipField[];
  manyToMany: JavaManyToManyField[];
  primaryKey: JavaPrimaryKeyModel;
  idJavaType: string;
  idImportFqcn?: string;
  extendsClassName?: string;
  isInheritanceRoot: boolean;
}

export interface JavaGenerationModel {
  packageName: string;
  projectName: string;
  databaseName: string;
  entities: JavaEntityModel[];
}
