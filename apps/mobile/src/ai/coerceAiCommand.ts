import type { DomainManifest, DomainType, EntityDefinition } from '../domain/manifest';

/**
 * Normaliza los valores de "id"/"data"/"filters" de un comando candidato
 * que vino de Claude contra los tipos reales del Manifest, ANTES de
 * pasarlo a CommandValidator (regla 18: el Validator sigue siendo la
 * autoridad final -- esto no reemplaza esa validación, solo evita
 * rechazos triviales si Claude mandó "5" en vez de 5 para un campo
 * numérico, algo que el JSON Schema genérico de "data" no le impide
 * hacer). Nunca fuerza una conversión si el valor no calza con el tipo
 * (ej. no convierte "Carlos" a número) -- en ese caso lo deja tal cual y
 * CommandValidator lo va a rechazar con un diagnóstico claro.
 */
export function coerceAiCommand(raw: unknown, manifest: DomainManifest): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const command = raw as Record<string, unknown>;

  const entity = typeof command.entity === 'string' ? manifest.entities.find((e) => e.name === command.entity) : undefined;
  if (!entity) return raw;

  const coerced: Record<string, unknown> = { ...command };
  if (command.id !== undefined) coerced.id = coerceId(command.id, entity);
  if (isPlainObject(command.data)) coerced.data = coerceFields(command.data, entity);
  if (isPlainObject(command.filters)) coerced.filters = coerceFields(command.filters, entity);
  return coerced;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceId(value: unknown, entity: EntityDefinition): unknown {
  const idType = entity.id?.fields[0]?.type;
  return idType ? coerceScalar(value, idType) : value;
}

function coerceFields(data: Record<string, unknown>, entity: EntityDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const field = entity.fields.find((f) => f.name === key);
    if (field) {
      result[key] = coerceScalar(value, field.type);
      continue;
    }
    const relation = entity.relations.find((r) => r.name === key);
    if (relation) {
      // El id real de una relación casi siempre es numérico -- coerceScalar
      // no toca el valor si no calza (ej. un uuid como string), así que
      // esto es seguro incluso si la PK destino no es long/integer.
      result[key] = relation.cardinality === 'MANY_TO_MANY' && Array.isArray(value) ? value.map((v) => coerceScalar(v, 'long')) : coerceScalar(value, 'long');
      continue;
    }
    // Campo desconocido para esta entidad: se deja pasar tal cual --
    // CommandValidator lo va a rechazar con UNKNOWN_FIELD, nunca en silencio.
    result[key] = value;
  }
  return result;
}

function coerceScalar(value: unknown, type: DomainType): unknown {
  if (typeof value !== 'string') return value;
  switch (type) {
    case 'integer':
    case 'long': {
      const n = Number(value);
      return Number.isInteger(n) ? n : value;
    }
    case 'decimal': {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    default:
      return value;
  }
}
