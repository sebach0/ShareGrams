import type { DynamicId } from '../engine/dynamicCommand';

/**
 * Estados de sincronización de UN registro local (Fase 17, regla 13).
 * `CONFLICT` significa "detectamos que el servidor cambió este registro
 * después de nuestra última copia conocida" (regla 20/21) -- solo
 * detección, nunca resolución automática: el usuario decide.
 */
export type SyncStatus = 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'FAILED' | 'CONFLICT';

/**
 * Representación local de CUALQUIER entidad (Fase 17, regla 8) -- misma
 * filosofía dinámica que `DynamicEntity` (Fase 13): un solo tipo genérico
 * para todo el dominio, nunca `PacienteLocal`/`ClienteLocal`. `localId`
 * siempre existe (se genera al crear, incluso para lo que ya sincronizó,
 * para tener una clave primaria estable en la tabla local); `remoteId` es
 * `null` hasta la primera sincronización exitosa.
 *
 * `lastKnownRemoteValues` guarda una copia de los valores tal como los
 * devolvió el servidor la última vez que los leímos/sincronizamos --
 * necesaria para la detección de conflictos en UPDATE (regla 20): como
 * Fase 10 no genera `@Version`/`updatedAt`, la única forma de notar que
 * "alguien más lo cambió mientras estábamos offline" es comparar esto
 * contra lo que el servidor tiene ahora mismo, justo antes de aplicar
 * nuestro propio UPDATE.
 */
export interface LocalDynamicEntity {
  id: string; // = localId, clave primaria del KeyValueRecordStore
  localId: string;
  remoteId: DynamicId | null;
  entityType: string;
  values: Record<string, unknown>;
  lastKnownRemoteValues: Record<string, unknown> | null;
  syncStatus: SyncStatus;
  deleted: boolean; // soft delete (regla 19): no se borra la fila hasta confirmar el DELETE remoto
  updatedAt: string; // ISO
}
