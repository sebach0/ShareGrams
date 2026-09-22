import type { EntityDefinition } from '../domain/manifest';
import type { DynamicData, DynamicId } from '../engine/dynamicCommand';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { RepositoryResult } from '../engine/dynamicRepository';

/**
 * Contrato común (Fase 17, regla 5) entre "hablarle al backend por HTTP"
 * (`DynamicRepository`, Fase 13 -- la "RemoteDataSource" del diagrama del
 * spec) y "guardar/leer de la base local" (`LocalDataSource`, nueva).
 * Extraído tal cual de los 7 métodos que `DynamicRepository` ya tenía --
 * `CommandExecutor` nunca cambia, nunca se entera de cuál de las dos
 * implementaciones tiene enfrente.
 */
export interface DynamicDataSource {
  list(entity: EntityDefinition): Promise<RepositoryResult<DynamicEntity[]>>;
  get(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<DynamicEntity>>;
  create(entity: EntityDefinition, data: DynamicData): Promise<RepositoryResult<DynamicEntity>>;
  update(entity: EntityDefinition, id: DynamicId, data: DynamicData): Promise<RepositoryResult<DynamicEntity>>;
  delete(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<void>>;
  search(entity: EntityDefinition, filters: DynamicData): Promise<RepositoryResult<DynamicEntity[]>>;
  count(entity: EntityDefinition, filters?: DynamicData): Promise<RepositoryResult<number>>;
}
