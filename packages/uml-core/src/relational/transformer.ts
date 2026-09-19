import type { UMLAttribute, UMLClass, UMLModel } from '../model/types';
import { attributeToColumnName, classToTableName, foreignKeyColumnName, joinTableName } from './naming';
import { mapPrimitiveType } from './typeMapper';
import { validateForTransformation } from './validate';
import { buildParentMap } from './generalization';
import { planRelationshipForeignKey } from './relationships';
import type { ForeignKey, PrimaryKey, RelationalColumn, RelationalModel, RelationalTable, RelationalType } from './types';
import type { TransformationError } from './errors';

export type TransformResult = { ok: true; model: RelationalModel } | { ok: false; errors: TransformationError[] };

interface ResolvedPrimaryKey {
  columnName: string;
  columnType: RelationalType;
}

/**
 * Transforma un UMLModel canónico (ya validado por validateForTransformation)
 * a un RelationalModel. Función pura: nunca muta `model`, y el mismo input
 * siempre produce exactamente el mismo output (todos los ids relacionales
 * salen de ids que ya existían en el UML -- ver comentarios en cada `id:`
 * de abajo -- nunca de generateId()/crypto.randomUUID()).
 */
export function transformUmlToRelational(model: UMLModel): TransformResult {
  const errors = validateForTransformation(model);
  if (errors.length > 0) return { ok: false, errors };

  const classById = new Map(model.classes.map((c) => [c.id, c]));
  const parentOf = buildParentMap(model);
  const tableNameByClassId = new Map(model.classes.map((c) => [c.id, classToTableName(c.name)]));

  function resolveOwnPrimaryKey(umlClass: UMLClass): ResolvedPrimaryKey {
    // validateForTransformation ya garantizó exactamente un atributo PK en toda clase raíz (sin padre).
    const pkAttribute = umlClass.attributes.find((a): a is UMLAttribute => Boolean(a.isPrimaryKey))!;
    return { columnName: attributeToColumnName(pkAttribute.name), columnType: mapPrimitiveType(pkAttribute.type)! };
  }

  const resolvedPkCache = new Map<string, ResolvedPrimaryKey>();
  function resolvePrimaryKey(classId: string): ResolvedPrimaryKey {
    const cached = resolvedPkCache.get(classId);
    if (cached) return cached;

    const parent = parentOf.get(classId);
    const resolved: ResolvedPrimaryKey = parent
      ? {
          columnName: foreignKeyColumnName(tableNameByClassId.get(parent.supertypeId)!),
          columnType: resolvePrimaryKey(parent.supertypeId).columnType,
        }
      : resolveOwnPrimaryKey(classById.get(classId)!);

    resolvedPkCache.set(classId, resolved);
    return resolved;
  }

  function buildClassTable(umlClass: UMLClass): RelationalTable {
    const columns: RelationalColumn[] = umlClass.attributes.map((attribute) => ({
      id: attribute.id,
      name: attributeToColumnName(attribute.name),
      // Validado antes: mapPrimitiveType nunca da null acá.
      type: mapPrimitiveType(attribute.type)!,
      // El modelo UML todavía no tiene forma de marcar un atributo como
      // opcional (no hay ningún flag equivalente a isPrimaryKey para eso),
      // así que toda columna que sale de un atributo real es NOT NULL por
      // ahora -- limitación conocida, no una adivinanza.
      nullable: false,
      origin: { kind: 'attribute', classId: umlClass.id, attributeId: attribute.id },
    }));

    const foreignKeys: ForeignKey[] = [];
    let primaryKey: PrimaryKey;

    const parent = parentOf.get(umlClass.id);
    if (parent) {
      const parentTableName = tableNameByClassId.get(parent.supertypeId)!;
      const parentPk = resolvePrimaryKey(parent.supertypeId);
      const fkColumnName = foreignKeyColumnName(parentTableName);
      columns.push({
        id: `${parent.relationshipId}:pk`,
        name: fkColumnName,
        type: parentPk.columnType,
        nullable: false,
        origin: { kind: 'generalization-fk', relationshipId: parent.relationshipId },
      });
      foreignKeys.push({
        id: `${parent.relationshipId}:fk`,
        columns: [fkColumnName],
        referencedTable: parentTableName,
        referencedColumns: [parentPk.columnName],
      });
      primaryKey = { columns: [fkColumnName] };
    } else {
      primaryKey = { columns: [resolveOwnPrimaryKey(umlClass).columnName] };
    }

    return {
      id: umlClass.id,
      name: tableNameByClassId.get(umlClass.id)!,
      columns,
      primaryKey,
      foreignKeys,
      uniqueConstraints: [],
      origin: { kind: 'class', classId: umlClass.id },
    };
  }

  const tableByClassId = new Map(model.classes.map((c) => [c.id, buildClassTable(c)]));
  const joinTables: RelationalTable[] = [];

  for (const relationship of model.relationships) {
    if (relationship.type === 'GENERALIZATION') continue;

    const sourceTableName = tableNameByClassId.get(relationship.sourceClassId)!;
    const targetTableName = tableNameByClassId.get(relationship.targetClassId)!;
    const sourcePk = resolvePrimaryKey(relationship.sourceClassId);
    const targetPk = resolvePrimaryKey(relationship.targetClassId);
    const plan = planRelationshipForeignKey(relationship);

    if (plan === 'many-to-many') {
      // Nota: si dos relaciones distintas del mismo par de clases (o una
      // relación reflexiva, clase contra sí misma) llegan hasta acá, sus
      // columnas FK van a colisionar en nombre -- no soportado todavía,
      // haría falta usar sourceRole/targetRole para desambiguar.
      const sourceFkColumnName = foreignKeyColumnName(sourceTableName);
      const targetFkColumnName = foreignKeyColumnName(targetTableName);
      joinTables.push({
        id: relationship.id,
        name: joinTableName(sourceTableName, targetTableName),
        columns: [
          {
            id: `${relationship.id}:source`,
            name: sourceFkColumnName,
            type: sourcePk.columnType,
            nullable: false,
            origin: { kind: 'relationship-fk', relationshipId: relationship.id, end: 'source' },
          },
          {
            id: `${relationship.id}:target`,
            name: targetFkColumnName,
            type: targetPk.columnType,
            nullable: false,
            origin: { kind: 'relationship-fk', relationshipId: relationship.id, end: 'target' },
          },
        ],
        primaryKey: { columns: [sourceFkColumnName, targetFkColumnName] },
        foreignKeys: [
          {
            id: `${relationship.id}:source-fk`,
            columns: [sourceFkColumnName],
            referencedTable: sourceTableName,
            referencedColumns: [sourcePk.columnName],
          },
          {
            id: `${relationship.id}:target-fk`,
            columns: [targetFkColumnName],
            referencedTable: targetTableName,
            referencedColumns: [targetPk.columnName],
          },
        ],
        uniqueConstraints: [],
        origin: { kind: 'many-to-many', relationshipId: relationship.id },
      });
      continue;
    }

    const holderClassId = plan.onTable === 'source' ? relationship.sourceClassId : relationship.targetClassId;
    const referencedTableName = plan.referencedEnd === 'source' ? sourceTableName : targetTableName;
    const referencedPk = plan.referencedEnd === 'source' ? sourcePk : targetPk;
    const holderTable = tableByClassId.get(holderClassId)!;
    const fkColumnName = foreignKeyColumnName(referencedTableName);

    holderTable.columns.push({
      id: `${relationship.id}:fk`,
      name: fkColumnName,
      type: referencedPk.columnType,
      nullable: plan.nullable,
      origin: { kind: 'relationship-fk', relationshipId: relationship.id, end: plan.onTable },
    });
    holderTable.foreignKeys.push({
      id: `${relationship.id}:fk`,
      columns: [fkColumnName],
      referencedTable: referencedTableName,
      referencedColumns: [referencedPk.columnName],
    });
    if (plan.unique) {
      holderTable.uniqueConstraints.push({ columns: [fkColumnName] });
    }
  }

  return {
    ok: true,
    model: { tables: [...model.classes.map((c) => tableByClassId.get(c.id)!), ...joinTables] },
  };
}
