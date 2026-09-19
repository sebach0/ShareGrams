import type { UMLModel } from '../model/types';
import { isBlank } from '../commands/validators';
import { classToTableName, attributeToColumnName } from './naming';
import { mapPrimitiveType } from './typeMapper';
import { isSupportedMultiplicity } from './multiplicityRules';
import { transformationError, type TransformationError } from './errors';

/**
 * Todo lo que hay que chequear ANTES de intentar transformar, para poder
 * devolver una lista completa de problemas de una sola vez (en vez de
 * fallar en el primero y obligar a corregir de a uno). No muta `model`.
 */
export function validateForTransformation(model: UMLModel): TransformationError[] {
  const errors: TransformationError[] = [];
  const classById = new Map(model.classes.map((c) => [c.id, c]));

  for (const umlClass of model.classes) {
    if (isBlank(umlClass.name)) {
      errors.push(transformationError('CLASS_WITHOUT_NAME', `Hay una clase sin nombre (id ${umlClass.id}).`));
    }

    const columnNames = new Set<string>();
    for (const attribute of umlClass.attributes) {
      if (isBlank(attribute.name)) {
        errors.push(
          transformationError(
            'ATTRIBUTE_WITHOUT_NAME',
            `La clase "${umlClass.name}" tiene un atributo sin nombre (id ${attribute.id}).`,
          ),
        );
        continue;
      }
      if (mapPrimitiveType(attribute.type) === null) {
        errors.push(
          transformationError(
            'UNSUPPORTED_ATTRIBUTE_TYPE',
            `Clase "${umlClass.name}", atributo "${attribute.name}" usa un tipo no soportado (${attribute.type}).`,
          ),
        );
      }
      const columnName = attributeToColumnName(attribute.name);
      if (columnNames.has(columnName)) {
        errors.push(
          transformationError(
            'DUPLICATE_COLUMN_NAME',
            `Clase "${umlClass.name}" tiene dos atributos que producen la misma columna "${columnName}".`,
          ),
        );
      }
      columnNames.add(columnName);
    }
  }

  // Colisión de nombre de tabla: dos clases distintas cuyo nombre, una vez
  // normalizado a snake_case, termina siendo idéntico (ej. "DetallePedido"
  // y "detalle_pedido" ya existentes como clases separadas).
  const classesByTableName = new Map<string, string[]>();
  for (const umlClass of model.classes) {
    const tableName = classToTableName(umlClass.name);
    const existing = classesByTableName.get(tableName) ?? [];
    existing.push(umlClass.name);
    classesByTableName.set(tableName, existing);
  }
  for (const [tableName, classNames] of classesByTableName) {
    if (classNames.length > 1) {
      errors.push(
        transformationError(
          'TABLE_NAME_COLLISION',
          `Las clases ${classNames.map((n) => `"${n}"`).join(' y ')} generan la misma tabla "${tableName}".`,
        ),
      );
    }
  }

  // Herencia: cada clase puede ser subtipo de a lo sumo una GENERALIZATION
  // (estrategia JOINED de un solo padre), y no puede haber ciclos.
  const parentOf = new Map<string, string>();
  const supertypeCountBySubtype = new Map<string, number>();
  for (const relationship of model.relationships) {
    if (relationship.type !== 'GENERALIZATION') continue;
    if (!classById.has(relationship.sourceClassId) || !classById.has(relationship.targetClassId)) {
      errors.push(
        transformationError(
          'DANGLING_RELATIONSHIP',
          `La generalización ${relationship.id} referencia una clase inexistente.`,
        ),
      );
      continue;
    }
    supertypeCountBySubtype.set(
      relationship.sourceClassId,
      (supertypeCountBySubtype.get(relationship.sourceClassId) ?? 0) + 1,
    );
    parentOf.set(relationship.sourceClassId, relationship.targetClassId);
  }
  for (const [subtypeId, count] of supertypeCountBySubtype) {
    if (count > 1) {
      const subtype = classById.get(subtypeId);
      errors.push(
        transformationError(
          'UNSUPPORTED_MULTIPLE_INHERITANCE',
          `La clase "${subtype?.name ?? subtypeId}" hereda de más de una clase; no está soportado todavía.`,
        ),
      );
    }
  }
  for (const startId of parentOf.keys()) {
    const seen = new Set<string>([startId]);
    let current = parentOf.get(startId);
    while (current) {
      if (seen.has(current)) {
        const cls = classById.get(startId);
        errors.push(
          transformationError(
            'CIRCULAR_GENERALIZATION',
            `La jerarquía de herencia que incluye a "${cls?.name ?? startId}" tiene un ciclo.`,
          ),
        );
        break;
      }
      seen.add(current);
      current = parentOf.get(current);
    }
  }

  // Primary key: exigida solo en clases raíz (las que no son subtipo de
  // ninguna generalización) -- una subclase hereda su PK del padre.
  for (const umlClass of model.classes) {
    if (parentOf.has(umlClass.id)) continue;
    const pkAttributes = umlClass.attributes.filter((a) => a.isPrimaryKey);
    if (pkAttributes.length === 0) {
      errors.push(
        transformationError(
          'MISSING_PRIMARY_KEY',
          `La clase "${umlClass.name}" no puede transformarse porque no tiene ningún atributo marcado como clave primaria.`,
        ),
      );
    } else if (pkAttributes.length > 1) {
      errors.push(
        transformationError(
          'MULTIPLE_PRIMARY_KEYS',
          `La clase "${umlClass.name}" tiene más de un atributo marcado como clave primaria (${pkAttributes
            .map((a) => a.name)
            .join(', ')}).`,
        ),
      );
    }
  }

  // Asociaciones (no GENERALIZATION): extremos válidos, multiplicidades
  // presentes y soportadas.
  for (const relationship of model.relationships) {
    if (relationship.type === 'GENERALIZATION') continue;

    if (!classById.has(relationship.sourceClassId) || !classById.has(relationship.targetClassId)) {
      errors.push(
        transformationError(
          'DANGLING_RELATIONSHIP',
          `La relación ${relationship.id} referencia una clase inexistente.`,
        ),
      );
      continue;
    }

    if (!relationship.sourceMultiplicity || !relationship.targetMultiplicity) {
      errors.push(
        transformationError(
          'INCOMPLETE_ASSOCIATION',
          `La relación ${relationship.id} no tiene multiplicidad definida en ambos extremos.`,
        ),
      );
      continue;
    }

    for (const [end, multiplicity] of [
      ['source', relationship.sourceMultiplicity],
      ['target', relationship.targetMultiplicity],
    ] as const) {
      if (!isSupportedMultiplicity(multiplicity)) {
        errors.push(
          transformationError(
            'UNSUPPORTED_MULTIPLICITY',
            `La relación ${relationship.id} tiene una multiplicidad no soportada en el extremo ${end} (${multiplicity.lower}..${multiplicity.upper}).`,
          ),
        );
      }
    }
  }

  return errors;
}
