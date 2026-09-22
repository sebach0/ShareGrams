import type { DomainManifest } from '../domain/manifest';
import { DynamicRepository } from '../engine/dynamicRepository';
import { getLocalDatabase } from './localDatabase';
import { SqliteRecordStore } from './sqliteRecordStore';
import { LocalDataSource } from './localDataSource';
import { SyncQueue, type SyncQueueItem } from './syncQueue';
import { SyncEngine } from './syncEngine';
import { OfflineFirstDataSource } from './offlineFirstDataSource';
import type { LocalDynamicEntity } from './localDynamicEntity';

export interface OfflineStack {
  /** Reemplazo directo de `new DynamicRepository(baseUrl)` para la UI dinámica -- local-first, misma interfaz `DynamicDataSource`. */
  dataSource: OfflineFirstDataSource;
  /** Drena la cola contra el backend real -- se invoca manualmente ("Sincronizar ahora") o al recuperar conexión. */
  syncEngine: SyncEngine;
  syncQueue: SyncQueue;
}

/**
 * Arma el stack offline completo para UN backend conectado (Fase 17).
 * Se reconstruye cada vez que cambia `baseUrl`/`manifest` -- la base
 * SQLite es la misma (un solo archivo para toda la app, `local_entities`
 * ya filtra por `entityType`), pero `DynamicRepository` (remoto) y
 * `SyncEngine` sí necesitan la URL/Manifest del backend actualmente
 * conectado.
 */
export async function createOfflineStack(baseUrl: string, manifest: DomainManifest): Promise<OfflineStack> {
  const db = await getLocalDatabase();
  const local = new LocalDataSource(new SqliteRecordStore<LocalDynamicEntity>(db, 'local_entities'));
  const syncQueue = new SyncQueue(new SqliteRecordStore<SyncQueueItem>(db, 'sync_queue'));
  const remote = new DynamicRepository(baseUrl);
  const syncEngine = new SyncEngine(syncQueue, local, remote, manifest);
  const dataSource = new OfflineFirstDataSource(local, syncQueue);
  return { dataSource, syncEngine, syncQueue };
}
