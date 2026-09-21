import type { UMLClass, UMLModel } from '../../model/types';
import type { RelationalModel, RelationalTable } from '../../relational/types';
import { isPureJoinTable } from '../../relational/associativeTables';
import { entityClassName, fieldName, routeSegment } from '../springboot/naming';
import { mapRelationalTypeToDomain } from './domainTypeMapper';
import { pickDisplayField } from './displayField';
import { humanizeLabel, pluralize } from './labels';
import {
  MANIFEST_VERSION,
  type DomainManifest,
  type DomainType,
  type EntityDefinition,
  type FieldDefinition,
  type IdDefinition,
  type ManifestGenerationOptions,
  type Operation,
  type RelationDefinition,
} from './types';

/**
 * CanonicalUmlModel + RelationalModel -> DomainManifest. Nunca se escribe
 * a mano (regla 7): la app móvil descubre en runtime exactamente lo que
 * este generador produjo en build-time.
 *
 * Fuente principal: RelationalModel (regla 8) -- toda decisión de
 * cardinalidad/PK/FK/nullable sale de ahí, igual que en generator/springboot
 * (comparten `relational/associativeTables.ts` y `relational/generalization.ts`
 * para no reinterpretar esa metadata de dos formas distintas). UMLModel
 * solo se usa para una cosa que RelationalModel no conserva: los nombres
 * originales legibles (labels) -- sin eso, un atributo `fechaNacimiento`
 * terminaría mostrándose como "Fecha Nacimiento" en vez de lo que el
 * usuario realmente escribió en el diagrama, si llegara a diferir.
 *
 * Nota de diseño (desvío deliberado de la referencia conceptual de la
 * consigna, permitido por la regla 6): `relations[].name` es el nombre de
 * campo REAL que aparece en el JSON (ej. "clienteId"), no un nombre
 * conceptual como "cliente". La Fase 13 va a construir comandos que arman
 * el body de la request contra esta misma API -- si el Manifest dijera
 * "cliente" en vez de "clienteId", esa fase tendría que adivinar el
 * nombre real del campo, que es exactamente lo que esta fase existe para
 * evitar.
 */
export function generateDomainManifest(
  model: UMLModel,
  relationalModel: RelationalModel,
  options: ManifestGenerationOptions,
): DomainManifest {
  const classById = new Map<string, UMLClass>(model.classes.map((c) => [c.id, c]));
  const tableByName = new Map(relationalModel.tables.map((t) => [t.name, t]));

  // Herencia detectada directamente del RelationalModel (regla 8: RelationalModel
  // como fuente principal) -- igual que generator/springboot/context/buildGenerationContext.ts,
  // NO desde UMLModel: así el Manifest sale bien incluso para un RelationalModel armado a
  // mano sin UML de origen (ver Fase 11, fixture de entidad asociativa con PK compuesta).
  const parentTableByChildTable = new Map<string, string>();
  for (const table of relationalModel.tables) {
    for (const column of table.columns) {
      if (column.origin.kind !== 'generalization-fk') continue;
      const fk = table.foreignKeys.find((f) => f.columns.includes(column.name));
      if (fk) parentTableByChildTable.set(table.name, fk.referencedTable);
    }
  }

  function resolveRootIdField(tableName: string): { name: string; type: DomainType } {
    const parentTableName = parentTableByChildTable.get(tableName);
    if (parentTableName) return resolveRootIdField(parentTableName);
    const table = tableByName.get(tableName)!;
    const pkColumnName = table.primaryKey!.columns[0];
    const pkColumn = table.columns.find((c) => c.name === pkColumnName)!;
    return { name: fieldName(pkColumnName), type: mapRelationalTypeToDomain(pkColumn.type)! };
  }

  function collectOwnAndInheritedFieldColumns(table: RelationalTable): RelationalTable['columns'] {
    const ownPkColumnNames = new Set(table.primaryKey?.columns ?? []);
    // La(s) columna(s) de PK de ESTA tabla no son un field plano -- ya se expresan en `id` (regla 16/17). Para PK compuesta no hay `id` (ver isComposite en buildEntity), pero esas mismas columnas tampoco son fields: se expresan como relations (ver el loop de más abajo).
    const own = table.columns.filter((c) => c.origin.kind === 'attribute' && !ownPkColumnNames.has(c.name));
    const parentTableName = parentTableByChildTable.get(table.name);
    if (!parentTableName) return own;
    return [...own, ...collectOwnAndInheritedFieldColumns(tableByName.get(parentTableName)!)];
  }

  function buildEntity(table: RelationalTable): EntityDefinition {
    const classId = table.origin.kind === 'class' ? table.origin.classId : undefined;
    const umlClass = classId ? classById.get(classId) : undefined;

    const label = umlClass?.name ?? humanizeLabel(table.name);
    const pkColumnNames = new Set(table.primaryKey?.columns ?? []);
    const isComposite = pkColumnNames.size > 1;

    const fields: FieldDefinition[] = [];
    const relations: RelationDefinition[] = [];

    for (const column of collectOwnAndInheritedFieldColumns(table)) {
      const domainType = mapRelationalTypeToDomain(column.type)!;
      fields.push({
        name: fieldName(column.name),
        label: humanizeLabel(column.name),
        type: domainType,
        required: !column.nullable,
        editable: true,
        generated: false,
      });
    }

    for (const column of table.columns) {
      if (column.origin.kind !== 'relationship-fk') continue;
      const fk = table.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === column.name);
      if (!fk) continue;
      const isUnique = table.uniqueConstraints.some((u) => u.columns.length === 1 && u.columns[0] === column.name);
      relations.push({
        name: fieldName(column.name),
        targetEntity: entityClassName(fk.referencedTable),
        cardinality: isUnique ? 'ONE_TO_ONE' : 'MANY_TO_ONE',
        required: !column.nullable,
      });
    }

    for (const otherTable of relationalModel.tables) {
      if (!isPureJoinTable(otherTable)) continue;
      const sourceColumn = otherTable.columns.find((c) => c.origin.kind === 'relationship-fk' && c.origin.end === 'source');
      const targetColumn = otherTable.columns.find((c) => c.origin.kind === 'relationship-fk' && c.origin.end === 'target');
      if (!sourceColumn || !targetColumn) continue;
      const sourceFk = otherTable.foreignKeys.find((f) => f.columns[0] === sourceColumn.name)!;
      const targetFk = otherTable.foreignKeys.find((f) => f.columns[0] === targetColumn.name)!;
      if (sourceFk.referencedTable !== table.name) continue; // el manifest solo declara la relación del lado que realmente la expone (ver Fase 10: @ManyToMany unidireccional)
      relations.push({
        // Mismo nombre que ya usa Fase 10 en el DTO (routeSegment = plural de la tabla destino), no `fieldName` (singular) -- tienen que coincidir con el JSON real.
        name: `${routeSegment(targetFk.referencedTable)}Ids`,
        targetEntity: entityClassName(targetFk.referencedTable),
        cardinality: 'MANY_TO_MANY',
        required: false,
      });
    }

    let id: IdDefinition | undefined;
    if (!isComposite) {
      const rootId = resolveRootIdField(table.name);
      id = { fields: [rootId], generated: true };
    }

    const fieldNames = fields.map((f) => f.name);
    const stringFieldNames = fields.filter((f) => f.type === 'string').map((f) => f.name);
    const displayField = pickDisplayField(fieldNames, stringFieldNames, id?.fields[0]?.name);

    const operations: Operation[] = isComposite ? ['LIST', 'CREATE'] : ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'];

    return {
      name: entityClassName(table.name),
      label,
      pluralLabel: pluralize(label),
      endpoint: `/api/${routeSegment(table.name)}`,
      id,
      displayField,
      fields,
      relations,
      operations,
      // Nota: `parent`/`extends` no forma parte del contrato v1 -- una subclase JOINED ya aparece con TODOS sus campos heredados aplanados (ver collectOwnAndInheritedFieldColumns), que es lo que el JSON real devuelve.
    };
  }

  const entities = relationalModel.tables.filter((t) => !isPureJoinTable(t)).map(buildEntity);

  return {
    version: MANIFEST_VERSION,
    application: { name: options.applicationName },
    entities,
  };
}
