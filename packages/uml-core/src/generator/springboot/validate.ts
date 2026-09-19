import type { RelationalModel } from '../../relational/types';
import type { SpringBootGenerationOptions } from './types';
import { generationError, type GenerationError } from './errors';
import { isValidJavaPackageName } from './naming';
import { mapRelationalTypeToJava } from './javaTypeMapper';

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
  }

  return errors;
}
