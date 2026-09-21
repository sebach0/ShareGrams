import type { DomainManifest, EntityDefinition, Operation, RelationDefinition } from '../domain/manifest';
import { ALLOWED_COMMAND_KEYS, DYNAMIC_ACTIONS, type DynamicAction, type DynamicCommand, type DynamicData, type DynamicId } from './dynamicCommand';
import { matchesDomainType } from './domainTypeCheck';

export interface ValidationDiagnostic {
  code: string;
  field?: string;
  message: string;
}

export type CommandValidationResult =
  | { valid: true; command: DynamicCommand }
  | { valid: false; diagnostics: ValidationDiagnostic[] };

/**
 * SEARCH/COUNT no son `Operation` propias del Manifest -- Fase 10 no expone
 * ni filtros ni /count reales (ver diagnóstico inicial), así que este MVP
 * las resuelve sobre LIST (ver DynamicRepository) y por lo tanto exigen la
 * misma capacidad que LIST.
 */
const ACTION_TO_REQUIRED_OPERATION: Record<DynamicAction, Operation> = {
  LIST: 'LIST',
  GET: 'GET',
  SEARCH: 'LIST',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  COUNT: 'LIST',
};

function fail(...diagnostics: ValidationDiagnostic[]): CommandValidationResult {
  return { valid: false, diagnostics };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Único punto que decide si un DynamicCommand se puede ejecutar (regla 16),
 * usando EXCLUSIVAMENTE el Domain Manifest del backend conectado -- nunca
 * conocimiento hardcodeado de una entidad puntual (regla 34). Corre ANTES
 * del CommandExecutor.
 *
 * Acepta `unknown`, no un DynamicCommand ya tipado: la forma cruda es
 * exactamente lo que hay que desconfiar (un JSON escrito a mano en la
 * pantalla de pruebas, o más adelante generado por Claude) -- esto es lo
 * que bloquea claves ajenas como "url"/"sql"/"shell"/"script" (regla
 * 15/50) antes de confiar en cualquier tipo.
 */
export function validateCommand(raw: unknown, manifest: DomainManifest): CommandValidationResult {
  if (!isPlainObject(raw)) {
    return fail({ code: 'MALFORMED_COMMAND', message: 'El comando debe ser un objeto JSON.' });
  }

  const action = raw.action;
  if (typeof action !== 'string' || !(DYNAMIC_ACTIONS as readonly string[]).includes(action)) {
    return fail({ code: 'INVALID_ACTION', message: `Acción no soportada: "${String(action)}". Válidas: ${DYNAMIC_ACTIONS.join(', ')}.` });
  }
  const typedAction = action as DynamicAction;

  const allowedKeys = new Set(ALLOWED_COMMAND_KEYS[typedAction]);
  const extraKeys = Object.keys(raw).filter((k) => !allowedKeys.has(k));
  if (extraKeys.length > 0) {
    return fail({ code: 'MALFORMED_COMMAND', message: `El comando ${typedAction} no acepta estas propiedades: ${extraKeys.join(', ')}.` });
  }

  if (typeof raw.entity !== 'string' || !raw.entity) {
    return fail({ code: 'MALFORMED_COMMAND', field: 'entity', message: 'Falta "entity".' });
  }
  const entity = manifest.entities.find((e) => e.name === raw.entity);
  if (!entity) {
    return fail({ code: 'UNKNOWN_ENTITY', field: 'entity', message: `"${raw.entity}" no existe en este backend.` });
  }

  const requiredOperation = ACTION_TO_REQUIRED_OPERATION[typedAction];
  if (!entity.operations.includes(requiredOperation)) {
    return fail({
      code: 'OPERATION_NOT_ALLOWED',
      message: `"${entity.name}" no permite ${typedAction} (requiere la operación ${requiredOperation}, que este backend no expone para esta entidad).`,
    });
  }

  switch (typedAction) {
    case 'LIST':
      return { valid: true, command: { action: 'LIST', entity: entity.name } };

    case 'GET':
    case 'DELETE': {
      const idResult = validateId(raw.id, entity);
      if (!idResult.valid) return idResult;
      return { valid: true, command: { action: typedAction, entity: entity.name, id: idResult.id } };
    }

    case 'SEARCH':
    case 'COUNT': {
      if (raw.filters !== undefined && !isPlainObject(raw.filters)) {
        return fail({ code: 'MALFORMED_COMMAND', field: 'filters', message: '"filters" debe ser un objeto.' });
      }
      const filterResult = validateDataFields((raw.filters as Record<string, unknown>) ?? {}, entity, { partial: true });
      if (!filterResult.valid) return filterResult;
      return typedAction === 'SEARCH'
        ? { valid: true, command: { action: 'SEARCH', entity: entity.name, filters: filterResult.data } }
        : { valid: true, command: { action: 'COUNT', entity: entity.name, filters: filterResult.data } };
    }

    case 'CREATE': {
      if (!isPlainObject(raw.data)) {
        return fail({ code: 'MALFORMED_COMMAND', field: 'data', message: '"data" debe ser un objeto.' });
      }
      const dataResult = validateDataFields(raw.data, entity, { partial: false });
      if (!dataResult.valid) return dataResult;
      return { valid: true, command: { action: 'CREATE', entity: entity.name, data: dataResult.data } };
    }

    case 'UPDATE': {
      const idResult = validateId(raw.id, entity);
      if (!idResult.valid) return idResult;
      if (!isPlainObject(raw.data)) {
        return fail({ code: 'MALFORMED_COMMAND', field: 'data', message: '"data" debe ser un objeto.' });
      }
      // Fase 10 reusa el MISMO Request DTO (con las mismas @NotNull/@NotBlank)
      // para POST y PUT -- no hay semántica de PATCH real (ver diagnóstico
      // inicial), así que UPDATE exige los mismos campos required que CREATE.
      const dataResult = validateDataFields(raw.data, entity, { partial: false });
      if (!dataResult.valid) return dataResult;
      return { valid: true, command: { action: 'UPDATE', entity: entity.name, id: idResult.id, data: dataResult.data } };
    }
  }
}

function validateId(rawId: unknown, entity: EntityDefinition): { valid: true; id: DynamicId } | { valid: false; diagnostics: ValidationDiagnostic[] } {
  if (rawId === undefined || rawId === null) {
    return { valid: false, diagnostics: [{ code: 'MISSING_ID', field: 'id', message: `"${entity.name}" necesita "id".` }] };
  }
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    return { valid: false, diagnostics: [{ code: 'INVALID_ID_TYPE', field: 'id', message: 'El id debe ser string o number.' }] };
  }
  // entity.id está garantizado acá: si la entidad tuviera PK compuesta,
  // GET/UPDATE/DELETE ya se habrían rechazado arriba por
  // OPERATION_NOT_ALLOWED (esas operations nunca aparecen para una entidad
  // con PK compuesta -- ver manifestGenerator.ts, Fase 12).
  const idType = entity.id?.fields[0]?.type ?? 'long';
  if (!matchesDomainType(rawId, idType)) {
    return { valid: false, diagnostics: [{ code: 'INVALID_ID_TYPE', field: 'id', message: `El id de "${entity.name}" debe ser de tipo ${idType}.` }] };
  }
  return { valid: true, id: rawId };
}

interface DataValidationOptions {
  /** SEARCH/COUNT (regla 40/41): ningún campo es obligatorio, cualquier subconjunto de campos conocidos sirve de filtro. */
  partial: boolean;
}

function validateDataFields(
  raw: Record<string, unknown>,
  entity: EntityDefinition,
  options: DataValidationOptions,
): { valid: true; data: DynamicData } | { valid: false; diagnostics: ValidationDiagnostic[] } {
  const fieldsByName = new Map(entity.fields.map((f) => [f.name, f]));
  const relationsByName = new Map(entity.relations.map((r) => [r.name, r]));
  const idFieldName = entity.id?.fields[0]?.name;
  const diagnostics: ValidationDiagnostic[] = [];
  const clean: DynamicData = {};

  for (const [key, value] of Object.entries(raw)) {
    if (idFieldName && key === idFieldName) {
      diagnostics.push({ code: 'FIELD_NOT_EDITABLE', field: key, message: `"${key}" es el identificador generado por el backend -- no se puede enviar.` });
      continue;
    }

    const field = fieldsByName.get(key);
    if (field) {
      if (field.generated || !field.editable) {
        diagnostics.push({ code: 'FIELD_NOT_EDITABLE', field: key, message: `"${key}" no es editable.` });
        continue;
      }
      if (value !== null && !matchesDomainType(value, field.type)) {
        diagnostics.push({ code: 'INVALID_FIELD_TYPE', field: key, message: `"${key}" debe ser de tipo ${field.type}.` });
        continue;
      }
      if (field.type === 'enum' && typeof value === 'string' && field.enumValues && !field.enumValues.includes(value)) {
        diagnostics.push({ code: 'INVALID_ENUM_VALUE', field: key, message: `"${value}" no es un valor válido de "${key}" (${field.enumValues.join(', ')}).` });
        continue;
      }
      clean[key] = value as DynamicData[string];
      continue;
    }

    const relation = relationsByName.get(key);
    if (relation) {
      const relationCheck = validateRelationValue(value, relation);
      if (!relationCheck.valid) {
        diagnostics.push({ code: 'INVALID_RELATION_VALUE', field: key, message: relationCheck.message });
        continue;
      }
      clean[key] = value as DynamicData[string];
      continue;
    }

    diagnostics.push({ code: 'UNKNOWN_FIELD', field: key, message: `"${entity.name}" no tiene un campo ni relación llamada "${key}".` });
  }

  if (!options.partial) {
    for (const field of entity.fields) {
      if (!field.required || !field.editable || field.generated) continue;
      const provided = clean[field.name];
      if (provided === undefined || provided === null) {
        diagnostics.push({ code: 'MISSING_REQUIRED_FIELD', field: field.name, message: `"${field.name}" es obligatorio.` });
      }
    }
    for (const relation of entity.relations) {
      if (!relation.required) continue;
      const provided = clean[relation.name];
      if (provided === undefined || provided === null) {
        diagnostics.push({ code: 'MISSING_REQUIRED_FIELD', field: relation.name, message: `"${relation.name}" es obligatorio.` });
      }
    }
  }

  if (diagnostics.length > 0) return { valid: false, diagnostics };
  return { valid: true, data: clean };
}

function validateRelationValue(value: unknown, relation: RelationDefinition): { valid: true } | { valid: false; message: string } {
  if (relation.cardinality === 'MANY_TO_MANY') {
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      return { valid: false, message: `"${relation.name}" debe ser una lista de ids (relación ${relation.cardinality}).` };
    }
    return { valid: true };
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return { valid: false, message: `"${relation.name}" debe ser un id -- string o number (relación ${relation.cardinality}).` };
  }
  return { valid: true };
}
