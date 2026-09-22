import type { DynamicCommand } from '../engine/dynamicCommand';
import type { KeyValueRecordStore } from './recordStore';

/** Estados de una operación en la cola (Fase 17, regla 10). */
export type SyncQueueStatus = 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

/**
 * UNA operación pendiente de sincronizar. `command` es un `DynamicCommand`
 * YA VALIDADO (regla 9 de Fase 17: reutiliza Fase 13, no se inventa otro
 * sistema de comandos) -- `localId` conecta esta entrada de la cola con la
 * fila de `LocalDynamicEntity` que originó la operación, para que
 * `SyncEngine` pueda actualizar el registro local correcto al confirmar
 * (o fallar) la sincronización.
 */
export interface SyncQueueItem {
  id: string;
  entityType: string;
  localId: string;
  command: DynamicCommand;
  status: SyncQueueStatus;
  createdAt: string;
  error: string | null;
}

/**
 * `SyncQueue` (Fase 17, regla 10): guarda operaciones pendientes, nada
 * más -- no sabe hablar con el backend (eso es `SyncEngine`). FIFO por
 * `createdAt`: procesar en el mismo orden en que el usuario las generó es
 * lo que hace que, en el caso común, un CREATE de una entidad "padre"
 * (ej. Universidad) se sincronice antes que el CREATE de su "hija" (ej.
 * Estudiante) que la referencia -- sin esto, `SyncEngine` no tendría
 * forma de saber a qué id remoto reescribir la relación.
 */
export class SyncQueue {
  constructor(
    private readonly store: KeyValueRecordStore<SyncQueueItem>,
    /** Inyectado (no importa `expo-crypto` acá) -- ver `idGenerator.ts` para el motivo. */
    private readonly generateId: () => string,
  ) {}

  async enqueue(entityType: string, localId: string, command: DynamicCommand): Promise<SyncQueueItem> {
    const item: SyncQueueItem = {
      id: this.generateId(),
      entityType,
      localId,
      command,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      error: null,
    };
    await this.store.put(item);
    return item;
  }

  async listPending(): Promise<SyncQueueItem[]> {
    const all = await this.store.getAll();
    return all.filter((i) => i.status === 'PENDING').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async all(): Promise<SyncQueueItem[]> {
    return this.store.getAll();
  }

  async updateStatus(id: string, status: SyncQueueStatus, error: string | null = null): Promise<void> {
    const item = await this.store.get(id);
    if (!item) return;
    await this.store.put({ ...item, status, error });
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(id);
  }
}
