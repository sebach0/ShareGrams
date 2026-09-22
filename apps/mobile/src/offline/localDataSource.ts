import type { EntityDefinition } from '../domain/manifest';
import type { DynamicData, DynamicId } from '../engine/dynamicCommand';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { RepositoryResult } from '../engine/dynamicRepository';
import type { DynamicDataSource } from './dynamicDataSource';
import type { KeyValueRecordStore } from './recordStore';
import type { LocalDynamicEntity, SyncStatus } from './localDynamicEntity';
import { generateLocalId, isLocalId } from './localId';

function idFieldName(entity: EntityDefinition): string {
  return entity.id?.fields[0]?.name ?? 'id';
}

function toDynamicEntityView(entity: EntityDefinition, record: LocalDynamicEntity): DynamicEntity {
  const idField = idFieldName(entity);
  const publicId: DynamicId = record.remoteId ?? record.localId;
  return { entityType: entity.name, values: { ...record.values, [idField]: publicId } };
}

/**
 * `LocalDataSource` (Fase 17, regla 5): guarda/consulta/actualiza/elimina
 * registros -- y nada más. No sabe nada de HTTP, no sabe nada de la
 * `SyncQueue` (eso lo orquesta `OfflineFirstDataSource`, un nivel arriba,
 * igual que en el diagrama de arquitectura del spec: LocalDataSource ->
 * Sync Queue -> Sync Engine son cajas separadas). Implementa el mismo
 * `DynamicDataSource` que `DynamicRepository` (HTTP) para que
 * `CommandExecutor` pueda usar cualquiera de las dos sin saber cuál es.
 *
 * `entity.id` genérico (regla 7 de Fase 13, nunca hardcodeado por nombre
 * de entidad): el campo id se resuelve siempre vía `EntityDefinition.id`.
 */
export class LocalDataSource implements DynamicDataSource {
  constructor(private readonly store: KeyValueRecordStore<LocalDynamicEntity>) {}

  async list(entity: EntityDefinition): Promise<RepositoryResult<DynamicEntity[]>> {
    const records = await this.recordsFor(entity.name);
    return { kind: 'ok', value: records.map((r) => toDynamicEntityView(entity, r)) };
  }

  async get(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<DynamicEntity>> {
    const record = await this.findByPublicId(entity.name, id);
    if (!record) return { kind: 'not_found' };
    return { kind: 'ok', value: toDynamicEntityView(entity, record) };
  }

  async create(entity: EntityDefinition, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> {
    const localId = generateLocalId();
    const record: LocalDynamicEntity = {
      id: localId,
      localId,
      remoteId: null,
      entityType: entity.name,
      values: { ...data },
      lastKnownRemoteValues: null,
      syncStatus: 'PENDING_SYNC',
      deleted: false,
      updatedAt: new Date().toISOString(),
    };
    await this.store.put(record);
    return { kind: 'ok', value: toDynamicEntityView(entity, record) };
  }

  async update(entity: EntityDefinition, id: DynamicId, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> {
    const record = await this.findByPublicId(entity.name, id);
    if (!record) return { kind: 'not_found' };
    const updated: LocalDynamicEntity = {
      ...record,
      values: { ...record.values, ...data },
      syncStatus: record.syncStatus === 'LOCAL_ONLY' ? 'LOCAL_ONLY' : 'PENDING_SYNC',
      updatedAt: new Date().toISOString(),
    };
    await this.store.put(updated);
    return { kind: 'ok', value: toDynamicEntityView(entity, updated) };
  }

  async delete(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<void>> {
    const record = await this.findByPublicId(entity.name, id);
    if (!record) return { kind: 'not_found' };
    if (!record.remoteId) {
      // Nunca sincronizó -- no hay nada que borrar del lado del servidor, se borra directo (regla 19).
      await this.store.delete(record.id);
      return { kind: 'ok', value: undefined };
    }
    // Soft delete (regla 19, tombstone): se mantiene hasta que el SyncEngine confirme el DELETE remoto.
    await this.store.put({ ...record, deleted: true, syncStatus: 'PENDING_SYNC', updatedAt: new Date().toISOString() });
    return { kind: 'ok', value: undefined };
  }

  async search(entity: EntityDefinition, filters: DynamicData): Promise<RepositoryResult<DynamicEntity[]>> {
    const records = await this.recordsFor(entity.name);
    const filtered = records.filter((r) => Object.entries(filters).every(([key, expected]) => r.values[key] === expected));
    return { kind: 'ok', value: filtered.map((r) => toDynamicEntityView(entity, r)) };
  }

  async count(entity: EntityDefinition, filters?: DynamicData): Promise<RepositoryResult<number>> {
    const result = filters && Object.keys(filters).length > 0 ? await this.search(entity, filters) : await this.list(entity);
    if (result.kind !== 'ok') return result;
    return { kind: 'ok', value: result.value.length };
  }

  // --- API adicional, usada solo por SyncEngine/UI de estado de sync (no forma parte de DynamicDataSource) ---

  async getByLocalId(localId: string): Promise<LocalDynamicEntity | null> {
    return this.store.get(localId);
  }

  /** Registro crudo (con `remoteId`/`syncStatus`) por su id público -- lo usa `OfflineFirstDataSource` para decidir si hace falta encolar sincronización. */
  async getRecord(entity: EntityDefinition, id: DynamicId): Promise<LocalDynamicEntity | null> {
    return this.findByPublicId(entity.name, id);
  }

  async allPendingByEntity(entityType: string): Promise<LocalDynamicEntity[]> {
    const records = await this.recordsFor(entityType, true);
    return records.filter((r) => r.syncStatus === 'PENDING_SYNC');
  }

  async markSynced(localId: string, remoteId: DynamicId, remoteValues: Record<string, unknown>): Promise<void> {
    const record = await this.store.get(localId);
    if (!record) return;
    await this.store.put({ ...record, remoteId, values: remoteValues, lastKnownRemoteValues: remoteValues, syncStatus: 'SYNCED', updatedAt: new Date().toISOString() });
  }

  async markConflict(localId: string, currentRemoteValues: Record<string, unknown>): Promise<void> {
    const record = await this.store.get(localId);
    if (!record) return;
    await this.store.put({ ...record, syncStatus: 'CONFLICT', lastKnownRemoteValues: currentRemoteValues, updatedAt: new Date().toISOString() });
  }

  async markStatus(localId: string, syncStatus: SyncStatus): Promise<void> {
    const record = await this.store.get(localId);
    if (!record) return;
    await this.store.put({ ...record, syncStatus, updatedAt: new Date().toISOString() });
  }

  /** Confirmación de que el DELETE remoto se aplicó -- recién ahí se borra la fila local de verdad. */
  async hardDelete(localId: string): Promise<void> {
    await this.store.delete(localId);
  }

  private async recordsFor(entityType: string, includeDeleted = false): Promise<LocalDynamicEntity[]> {
    const all = await this.store.getAll();
    return all.filter((r) => r.entityType === entityType && (includeDeleted || !r.deleted));
  }

  private async findByPublicId(entityType: string, id: DynamicId): Promise<LocalDynamicEntity | null> {
    if (isLocalId(id)) {
      const record = await this.store.get(id);
      return record && record.entityType === entityType && !record.deleted ? record : null;
    }
    const records = await this.recordsFor(entityType);
    return records.find((r) => r.remoteId === id) ?? null;
  }
}
