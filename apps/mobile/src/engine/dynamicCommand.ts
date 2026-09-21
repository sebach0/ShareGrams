export type DynamicId = string | number;

/** Un valor de dato: escalar, null, o una lista de ids (relación MANY_TO_MANY). */
export type DynamicValue = string | number | boolean | null | DynamicId[];
export type DynamicData = Record<string, DynamicValue>;

/** Conjunto cerrado de acciones (regla 7): ninguna otra acción es válida. */
export const DYNAMIC_ACTIONS = ['LIST', 'GET', 'SEARCH', 'CREATE', 'UPDATE', 'DELETE', 'COUNT'] as const;
export type DynamicAction = (typeof DYNAMIC_ACTIONS)[number];

/**
 * Contrato estructurado de una operación (regla 7-14). Una unión
 * discriminada por `action` es, a nivel de tipos, ya un schema cerrado --
 * pero un DynamicCommand casi siempre nace de JSON crudo (la pantalla de
 * pruebas, o más adelante Claude), así que la forma real en runtime la
 * garantiza CommandValidator, no este tipo por sí solo (ver
 * ALLOWED_COMMAND_KEYS más abajo y commandValidator.ts).
 */
export type DynamicCommand =
  | { action: 'LIST'; entity: string }
  | { action: 'GET'; entity: string; id: DynamicId }
  | { action: 'SEARCH'; entity: string; filters: DynamicData }
  | { action: 'CREATE'; entity: string; data: DynamicData }
  | { action: 'UPDATE'; entity: string; id: DynamicId; data: DynamicData }
  | { action: 'DELETE'; entity: string; id: DynamicId }
  | { action: 'COUNT'; entity: string; filters?: DynamicData };

/**
 * Claves permitidas por acción (regla 15/50): esto es lo que bloquea que un
 * comando traiga "url"/"sql"/"shell"/"script" o cualquier otra propiedad
 * arbitraria -- CommandValidator rechaza cualquier clave fuera de esta
 * lista ANTES de mirar el resto del comando.
 */
export const ALLOWED_COMMAND_KEYS: Record<DynamicAction, readonly string[]> = {
  LIST: ['action', 'entity'],
  GET: ['action', 'entity', 'id'],
  SEARCH: ['action', 'entity', 'filters'],
  CREATE: ['action', 'entity', 'data'],
  UPDATE: ['action', 'entity', 'id', 'data'],
  DELETE: ['action', 'entity', 'id'],
  COUNT: ['action', 'entity', 'filters'],
};
