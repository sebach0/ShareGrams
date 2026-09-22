import type { EntityDefinition } from '../domain/manifest';
import type { DynamicData, DynamicId } from '../engine/dynamicCommand';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { RepositoryResult } from '../engine/dynamicRepository';
import type { DynamicDataSource } from './dynamicDataSource';
import type { LocalDataSource } from './localDataSource';
import type { SyncQueue } from './syncQueue';

/**
 * `OfflineFirstDataSource` (Fase 17, sección 4 del spec): el reemplazo
 * directo de `DynamicRepository` que la UI dinámica termina usando --
 * implementa el mismo `DynamicDataSource`, así que ni `CommandExecutor`
 * ni ninguna pantalla necesitan saber que ahora hay una base local y una
 * cola de por medio.
 *
 * Regla de oro de esta fase: TODO pasa primero por lo local. Lecturas
 * (list/get/search/count) siempre leen de `LocalDataSource` -- nunca de
 * la red directo, para que la UI funcione igual con o sin conexión.
 * Escrituras (create/update/delete) se guardan local primero y recién
 * después se encola la operación real para el `SyncEngine` -- el
 * resultado que ve el usuario es inmediato y optimista, nunca espera a
 * la red.
 */
export class OfflineFirstDataSource implements DynamicDataSource {
  constructor(
    private readonly local: LocalDataSource,
    private readonly queue: SyncQueue,
  ) {}

  list(entity: EntityDefinition): Promise<RepositoryResult<DynamicEntity[]>> {
    return this.local.list(entity);
  }

  get(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<DynamicEntity>> {
    return this.local.get(entity, id);
  }

  search(entity: EntityDefinition, filters: DynamicData): Promise<RepositoryResult<DynamicEntity[]>> {
    return this.local.search(entity, filters);
  }

  count(entity: EntityDefinition, filters?: DynamicData): Promise<RepositoryResult<number>> {
    return this.local.count(entity, filters);
  }

  async create(entity: EntityDefinition, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> {
    const result = await this.local.create(entity, data);
    if (result.kind !== 'ok') return result;
    const idField = entity.id?.fields[0]?.name ?? 'id';
    const localId = result.value.values[idField] as string;
    await this.queue.enqueue(entity.name, localId, { action: 'CREATE', entity: entity.name, data });
    return result;
  }

  async update(entity: EntityDefinition, id: DynamicId, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> {
    const existing = await this.local.getRecord(entity, id);
    if (!existing) return { kind: 'not_found' };
    const result = await this.local.update(entity, id, data);
    if (result.kind !== 'ok') return result;
    await this.queue.enqueue(entity.name, existing.localId, { action: 'UPDATE', entity: entity.name, id, data });
    return result;
  }

  async delete(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<void>> {
    const existing = await this.local.getRecord(entity, id);
    if (!existing) return { kind: 'not_found' };
    const hadRemote = existing.remoteId !== null;
    const result = await this.local.delete(entity, id);
    if (result.kind !== 'ok') return result;
    // Si nunca había sincronizado, LocalDataSource ya lo borró directo -- no hay nada que encolar (regla 19).
    if (hadRemote) {
      await this.queue.enqueue(entity.name, existing.localId, { action: 'DELETE', entity: entity.name, id });
    }
    return result;
  }
}
