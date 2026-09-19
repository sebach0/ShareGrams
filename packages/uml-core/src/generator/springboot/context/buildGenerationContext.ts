import type { RelationalModel, RelationalTable } from '../../../relational/types';
import type { SpringBootGenerationOptions } from '../types';
import { generationError, type GenerationError } from '../errors';
import { validateForGeneration } from '../validate';
import { mapRelationalTypeToJava } from '../javaTypeMapper';
import { entityClassName, fieldName, routeSegment, embeddedIdClassName } from '../naming';
import type { JavaEntityModel, JavaGenerationModel, JavaManyToManyField, JavaPrimaryKeyModel, JavaRelationshipField, JavaScalarField } from './types';

export type BuildContextResult = { ok: true; context: JavaGenerationModel } | { ok: false; errors: GenerationError[] };

/**
 * Único lugar que traduce RelationalModel a JavaGenerationModel. Lee
 * exclusivamente RelationalModel (nunca vuelve a mirar el UML -- regla 0 de
 * la Fase 10): todo lo que hace falta para decidir 1:1 vs 1:N vs N:M, dónde
 * va cada FK, y qué es herencia, ya está resuelto en la metadata `origin`
 * que dejó la Fase 9 en cada tabla/columna. A partir de acá los templates
 * son pura interpolación de texto, sin lógica.
 */
export function buildGenerationContext(model: RelationalModel, options: SpringBootGenerationOptions): BuildContextResult {
  const validationErrors = validateForGeneration(model, options);
  if (validationErrors.length > 0) return { ok: false, errors: validationErrors };

  const tableByName = new Map(model.tables.map((t) => [t.name, t]));

  // Tabla asociativa "pura" (Escenario A de la consigna): origin many-to-many
  // y exactamente las 2 columnas FK que forman toda su PK -- no genera
  // Entity propia, se resuelve como @ManyToMany + @JoinTable en el lado
  // "source" (el que Fase 9 ya fijó como dueño al nombrar la tabla
  // "<source>_<target>"). Si en algún momento Fase 9 empieza a producir
  // tablas asociativas con columnas propias (Escenario B, AssociationClass),
  // dejan de cumplir este `columns.length === 2` y automáticamente pasan a
  // generarse como Entity real más abajo -- sin perder sus atributos.
  function isPureJoinTable(table: RelationalTable): boolean {
    return table.origin.kind === 'many-to-many' && table.columns.length === 2;
  }

  // classIndex.get(tableName): permite resolver, dado el nombre de una
  // tabla, si es raíz o subtipo (para herencia) y quién es su padre.
  const parentTableByChild = new Map<string, { parentTable: string; joinColumnName: string }>();
  for (const table of model.tables) {
    if (isPureJoinTable(table)) continue;
    for (const column of table.columns) {
      if (column.origin.kind === 'generalization-fk') {
        const fk = table.foreignKeys.find((f) => f.columns.includes(column.name));
        if (fk) parentTableByChild.set(table.name, { parentTable: fk.referencedTable, joinColumnName: column.name });
      }
    }
  }
  const inheritanceRootTables = new Set([...parentTableByChild.values()].map((p) => p.parentTable));

  // Resuelve, para cualquier tabla (raíz o subtipo), el tipo Java y nombre
  // de columna de su identidad "real" -- una subclase JOINED no tiene @Id
  // propio, hereda el de la raíz.
  const idInfoCache = new Map<string, { javaType: string; importFqcn?: string; columnName: string }>();
  function resolveIdInfo(tableName: string): { javaType: string; importFqcn?: string; columnName: string } {
    const cached = idInfoCache.get(tableName);
    if (cached) return cached;

    const parent = parentTableByChild.get(tableName);
    const table = tableByName.get(tableName)!;
    const resolved = parent
      ? resolveIdInfo(parent.parentTable)
      : (() => {
          const pkColumnName = table.primaryKey!.columns[0];
          const pkColumn = table.columns.find((c) => c.name === pkColumnName)!;
          const javaType = mapRelationalTypeToJava(pkColumn.type)!;
          return { javaType: javaType.name, importFqcn: javaType.importFqcn, columnName: pkColumnName };
        })();

    idInfoCache.set(tableName, resolved);
    return resolved;
  }

  function buildEntity(table: RelationalTable): JavaEntityModel {
    const pkColumnNames = new Set(table.primaryKey?.columns ?? []);
    const parent = parentTableByChild.get(table.name);

    const scalarFields: JavaScalarField[] = [];
    const relationships: JavaRelationshipField[] = [];
    const embeddedParts: { attributeName: string; javaType: string; importFqcn?: string; mapsIdAttribute: string }[] = [];
    let simplePkField: JavaScalarField | undefined;

    for (const column of table.columns) {
      if (parent && column.name === parent.joinColumnName) continue; // manejado por primaryKey 'inherited', no es un campo propio

      const javaType = mapRelationalTypeToJava(column.type)!;
      const isPk = pkColumnNames.has(column.name);
      const fk = table.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === column.name);

      if (fk) {
        const isUnique = table.uniqueConstraints.some((u) => u.columns.length === 1 && u.columns[0] === column.name);
        const targetClassName = entityClassName(fk.referencedTable);
        const relFieldName = fieldName(fk.referencedTable);
        if (isPk && pkColumnNames.size > 1) {
          // Parte de una PK compuesta: además de la relación, aporta un campo a la clase *Id embebida.
          // @MapsId debe nombrar el atributo TAL COMO existe en esa clase *Id (ej. "ventaId"), no el
          // nombre del campo de relación (ej. "venta") -- son cosas distintas.
          const embeddedAttributeName = fieldName(column.name);
          embeddedParts.push({
            attributeName: embeddedAttributeName,
            javaType: javaType.name,
            importFqcn: javaType.importFqcn,
            mapsIdAttribute: embeddedAttributeName,
          });
          relationships.push({
            kind: 'MANY_TO_ONE',
            fieldName: relFieldName,
            targetClassName,
            joinColumnName: column.name,
            nullable: column.nullable,
            mapsIdAttribute: embeddedAttributeName,
          });
        } else {
          relationships.push({
            kind: isUnique ? 'ONE_TO_ONE' : 'MANY_TO_ONE',
            fieldName: relFieldName,
            targetClassName,
            joinColumnName: column.name,
            nullable: column.nullable,
          });
        }
        continue;
      }

      const scalarField: JavaScalarField = {
        fieldName: fieldName(column.name),
        columnName: column.name,
        javaType: javaType.name,
        importFqcn: javaType.importFqcn,
        nullable: column.nullable,
      };

      if (isPk && pkColumnNames.size === 1) {
        simplePkField = scalarField;
      } else if (!isPk) {
        scalarFields.push(scalarField);
      }
      // (una PK simple que además fuera columna "attribute" pero con pkColumnNames.size>1
      //  sin ser FK no ocurre con las reglas actuales de Fase 9 -- no hace falta contemplarla)
    }

    let primaryKey: JavaPrimaryKeyModel;
    if (parent) {
      primaryKey = { kind: 'inherited', parentClassName: entityClassName(parent.parentTable), joinColumnName: parent.joinColumnName };
    } else if (pkColumnNames.size > 1) {
      primaryKey = { kind: 'embedded', idClassName: embeddedIdClassName(table.name), parts: embeddedParts };
    } else {
      primaryKey = { kind: 'simple', field: simplePkField!, generated: true };
    }

    const manyToMany: JavaManyToManyField[] = [];
    for (const relationship of model.tables) {
      if (!isPureJoinTable(relationship)) continue;
      const sourceColumn = relationship.columns.find((c) => c.origin.kind === 'relationship-fk' && c.origin.end === 'source');
      const targetColumn = relationship.columns.find((c) => c.origin.kind === 'relationship-fk' && c.origin.end === 'target');
      if (!sourceColumn || !targetColumn) continue;
      const sourceFk = relationship.foreignKeys.find((f) => f.columns[0] === sourceColumn.name)!;
      const targetFk = relationship.foreignKeys.find((f) => f.columns[0] === targetColumn.name)!;
      if (sourceFk.referencedTable !== table.name) continue; // el @ManyToMany se declara solo del lado "source" (dueño)
      manyToMany.push({
        fieldName: routeSegment(targetFk.referencedTable), // nombre de colección: plural de la tabla destino
        targetClassName: entityClassName(targetFk.referencedTable),
        joinTableName: relationship.name,
        joinColumnName: sourceColumn.name,
        inverseJoinColumnName: targetColumn.name,
      });
    }

    const idInfo = resolveIdInfo(table.name);

    return {
      className: entityClassName(table.name),
      tableName: table.name,
      routeSegment: routeSegment(table.name),
      scalarFields,
      relationships,
      manyToMany,
      primaryKey,
      idJavaType: primaryKey.kind === 'embedded' ? primaryKey.idClassName : idInfo.javaType,
      idImportFqcn: primaryKey.kind === 'embedded' ? undefined : idInfo.importFqcn,
      extendsClassName: parent ? entityClassName(parent.parentTable) : undefined,
      isInheritanceRoot: inheritanceRootTables.has(table.name),
    };
  }

  const entities = model.tables.filter((t) => !isPureJoinTable(t)).map(buildEntity);

  return {
    ok: true,
    context: {
      packageName: options.packageName,
      projectName: options.projectName,
      databaseName: options.databaseName,
      entities,
    },
  };
}
