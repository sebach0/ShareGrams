import type { RelationalModel } from '../../relational/types';
import type { SpringBootGenerationOptions } from './types';
import { generationError, type GenerationError } from './errors';
import { isValidJavaPackageName } from './naming';
import { mapRelationalTypeToJava } from './javaTypeMapper';

/**
 * entity.template.ts genera siempre @GeneratedValue(strategy =
 * GenerationType.IDENTITY) para una PK simple -- Postgres exige que una
 * columna IDENTITY sea numérica (smallint/integer/bigint). Bug real
 * encontrado en producción: un usuario marcó el atributo PK de una clase
 * como String, la tabla nunca se creó (falló el DDL) y cada request a esa
 * entidad tiraba 500. Se valida ACÁ, antes de generar nada, en vez de dejar
 * que el usuario se entere recién cuando intenta correr el backend.
 */
const IDENTITY_COMPATIBLE_JAVA_TYPES = new Set(['Integer', 'Long']);

/**
 * La Fase 9 ya valida su propio resultado -- esto NO repite ese motor.
 * Son solo los invariantes que hacen falta para poder generar Java
 * correctamente, por si un RelationalModel llega de otro lado (no
 * necesariamente de transformUmlToRelational) sin haber pasado por ahí.
 */
export function validateForGeneration(model: RelationalModel, options: SpringBootGenerationOptions): GenerationError[] {
  const errors: GenerationError[] = [];

  if (!isValidJavaPackageName(options.packageName)) {
    errors.push(generationError('INVALID_PACKAGE_NAME', `El package "${options.packageName}" no es un nombre de package Java válido.`));
  }

  const tableNames = new Set(model.tables.map((t) => t.name));

  for (const t of model.tables) {
    if (!t.name || t.name.trim().length === 0) {
      errors.push(generationError('INVALID_TABLE_NAME', `Hay una tabla sin nombre (id ${t.id}).`));
      continue;
    }

    if (!t.primaryKey || t.primaryKey.columns.length === 0) {
      errors.push(generationError('UNSUPPORTED_COMPOSITE_KEY', `La tabla "${t.name}" no tiene clave primaria definida.`));
    } else {
      const columnNames = new Set(t.columns.map((c) => c.name));
      for (const pkColumn of t.primaryKey.columns) {
        if (!columnNames.has(pkColumn)) {
          errors.push(
            generationError('UNSUPPORTED_COMPOSITE_KEY', `La PK de "${t.name}" referencia la columna inexistente "${pkColumn}".`),
          );
        }
      }
    }

    for (const column of t.columns) {
      if (mapRelationalTypeToJava(column.type) === null) {
        errors.push(
          generationError(
            'UNSUPPORTED_JAVA_TYPE',
            `Columna "${t.name}.${column.name}" usa el tipo relacional "${column.type}", que no tiene mapeo a Java.`,
          ),
        );
      }
    }

    for (const fk of t.foreignKeys) {
      if (!tableNames.has(fk.referencedTable)) {
        errors.push(
          generationError('INVALID_FOREIGN_KEY', `La FK "${t.name}.${fk.columns.join(',')}" referencia la tabla inexistente "${fk.referencedTable}".`),
        );
      }
    }

    // Una tabla hija de herencia JOINED no declara @GeneratedValue propio
    // (hereda el id real de la raíz vía Java `extends`) -- esta regla solo
    // aplica a la PK que el generador SÍ autogenera con IDENTITY.
    const isGeneralizationChild = t.columns.some((c) => c.origin.kind === 'generalization-fk');
    if (!isGeneralizationChild && t.primaryKey && t.primaryKey.columns.length === 1) {
      const pkColumn = t.columns.find((c) => c.name === t.primaryKey!.columns[0]);
      const javaType = pkColumn ? mapRelationalTypeToJava(pkColumn.type) : null;
      if (pkColumn && javaType && !IDENTITY_COMPATIBLE_JAVA_TYPES.has(javaType.name)) {
        errors.push(
          generationError(
            'UNSUPPORTED_PRIMARY_KEY_TYPE',
            `La clave primaria de "${t.name}" ("${pkColumn.name}") es de tipo ${javaType.name} -- el generador solo puede autogenerar claves primarias numéricas (Integer/Long). Cambiá el tipo del atributo a Long, o no lo marques como clave primaria.`,
          ),
        );
      }
    }
  }

  return errors;
}
