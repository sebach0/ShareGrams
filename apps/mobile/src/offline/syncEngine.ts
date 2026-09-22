import type { DomainManifest, EntityDefinition } from '../domain/manifest';
import type { DynamicData, DynamicId } from '../engine/dynamicCommand';
import { repositoryErrorMessage } from '../engine/dynamicRepository';
import type { DynamicDataSource } from './dynamicDataSource';
import type { LocalDataSource } from './localDataSource';
import { isLocalId } from './localId';
import type { SyncQueue, SyncQueueItem } from './syncQueue';

export interface SyncSummary {
  synced: number;
  conflicts: number;
  failed: number;
  /** Se reintentan en la próxima pasada -- ej. un CREATE cuya entidad "padre" (otra relación) todavía no sincronizó. */
  skipped: number;
  /** true si se cortó la pasada por falta de red antes de terminar toda la cola. */
  stoppedByNetwork: boolean;
}

type ProcessOutcome = { kind: 'synced' } | { kind: 'conflict' } | { kind: 'skip' } | { kind: 'network_error' } | { kind: 'error'; message: string };

const idFieldName = (entity: EntityDefinition): string => entity.id?.fields[0]?.name ?? 'id';

/**
 * `SyncEngine` (Fase 17, regla 16): drena la `SyncQueue` en orden FIFO
 * contra el backend real. NUNCA decide qué hacer con un conflicto (regla
 * 21: solo detección) y NUNCA reintenta ciegamente contra una red caída
 * (regla: si algo da `network_error`, corta la pasada entera y deja el
 * resto de la cola en `PENDING` para el próximo intento -- machacar la
 * red con reintentos infinitos no es "manejo de errores", es lo
 * contrario).
 */
export class SyncEngine {
  constructor(
    private readonly queue: SyncQueue,
    private readonly local: LocalDataSource,
    private readonly remote: DynamicDataSource,
    private readonly manifest: DomainManifest,
  ) {}

  async processQueue(): Promise<SyncSummary> {
    const summary: SyncSummary = { synced: 0, conflicts: 0, failed: 0, skipped: 0, stoppedByNetwork: false };
    const pending = await this.queue.listPending();

    for (const item of pending) {
      const entity = this.manifest.entities.find((e) => e.name === item.entityType);
      if (!entity) {
        await this.queue.updateStatus(item.id, 'FAILED', `La entidad "${item.entityType}" ya no existe en el Manifest actual.`);
        summary.failed++;
        continue;
      }

      await this.queue.updateStatus(item.id, 'PROCESSING');
      const outcome = await this.processItem(item, entity);

      switch (outcome.kind) {
        case 'synced':
          await this.queue.updateStatus(item.id, 'SYNCED');
          summary.synced++;
          break;
        case 'conflict':
          await this.queue.updateStatus(item.id, 'CONFLICT');
          summary.conflicts++;
          break;
        case 'skip':
          await this.queue.updateStatus(item.id, 'PENDING');
          summary.skipped++;
          break;
        case 'network_error':
          await this.queue.updateStatus(item.id, 'PENDING');
          summary.stoppedByNetwork = true;
          return summary;
        case 'error':
          await this.queue.updateStatus(item.id, 'FAILED', outcome.message);
          summary.failed++;
          break;
      }
    }

    return summary;
  }

  private async processItem(item: SyncQueueItem, entity: EntityDefinition): Promise<ProcessOutcome> {
    switch (item.command.action) {
      case 'CREATE':
        return this.processCreate(item, entity);
      case 'UPDATE':
        return this.processUpdate(item, entity);
      case 'DELETE':
        return this.processDelete(item, entity);
      default:
        return { kind: 'error', message: `El Sync Engine no soporta la acción "${item.command.action}".` };
    }
  }

  private async processCreate(item: SyncQueueItem, entity: EntityDefinition): Promise<ProcessOutcome> {
    if (item.command.action !== 'CREATE') return { kind: 'error', message: 'Comando inconsistente.' };
    const resolved = await this.resolveRelationIds(entity, item.command.data);
    if ('skip' in resolved) return { kind: 'skip' };

    const result = await this.remote.create(entity, resolved.data);
    if (result.kind === 'network_error') return { kind: 'network_error' };
    if (result.kind !== 'ok') return { kind: 'error', message: repositoryErrorMessage(result) };

    const remoteId = result.value.values[idFieldName(entity)] as DynamicId;
    await this.local.markSynced(item.localId, remoteId, result.value.values);
    return { kind: 'synced' };
  }

  private async processUpdate(item: SyncQueueItem, entity: EntityDefinition): Promise<ProcessOutcome> {
    if (item.command.action !== 'UPDATE') return { kind: 'error', message: 'Comando inconsistente.' };
    const localRecord = await this.local.getByLocalId(item.localId);
    if (!localRecord) return { kind: 'error', message: 'El registro local ya no existe.' };
    if (!localRecord.remoteId) return { kind: 'skip' }; // su propio CREATE todavía no sincronizó

    const resolved = await this.resolveRelationIds(entity, item.command.data);
    if ('skip' in resolved) return { kind: 'skip' };

    // Detección de conflicto (regla 20): Fase 10 no genera @Version/updatedAt,
    // así que la única señal posible es comparar el estado remoto actual
    // contra la última copia que conocíamos -- si cambió, alguien más lo tocó.
    const current = await this.remote.get(entity, localRecord.remoteId);
    if (current.kind === 'network_error') return { kind: 'network_error' };
    if (current.kind !== 'ok') return { kind: 'error', message: repositoryErrorMessage(current) };

    if (localRecord.lastKnownRemoteValues && !sameValues(current.value.values, localRecord.lastKnownRemoteValues)) {
      await this.local.markConflict(item.localId, current.value.values);
      return { kind: 'conflict' };
    }

    const result = await this.remote.update(entity, localRecord.remoteId, resolved.data);
    if (result.kind === 'network_error') return { kind: 'network_error' };
    if (result.kind !== 'ok') return { kind: 'error', message: repositoryErrorMessage(result) };

    await this.local.markSynced(item.localId, localRecord.remoteId, result.value.values);
    return { kind: 'synced' };
  }

  private async processDelete(item: SyncQueueItem, entity: EntityDefinition): Promise<ProcessOutcome> {
    const localRecord = await this.local.getByLocalId(item.localId);
    if (!localRecord) return { kind: 'synced' }; // ya no está, no hay nada que hacer
    if (!localRecord.remoteId) {
      await this.local.hardDelete(item.localId);
      return { kind: 'synced' };
    }

    const result = await this.remote.delete(entity, localRecord.remoteId);
    if (result.kind === 'network_error') return { kind: 'network_error' };
    if (result.kind !== 'ok' && result.kind !== 'not_found') return { kind: 'error', message: repositoryErrorMessage(result) };

    await this.local.hardDelete(item.localId);
    return { kind: 'synced' };
  }

  /**
   * Reescribe cualquier id de relación que todavía apunte a un registro
   * local sin sincronizar (regla 6 del diagnóstico: el riesgo real de esta
   * fase) al id remoto real, una vez que ese registro "padre" ya
   * sincronizó. Si todavía no sincronizó, esta operación se pospone
   * (`skip`) -- el orden FIFO de la cola hace que normalmente ya haya
   * sincronizado para cuando le toca el turno a este item.
   */
  private async resolveRelationIds(entity: EntityDefinition, data: DynamicData): Promise<{ data: DynamicData } | { skip: true }> {
    const resolved: DynamicData = { ...data };
    for (const relation of entity.relations) {
      const value = data[relation.name];
      if (value === undefined) continue;

      if (relation.cardinality === 'MANY_TO_MANY' && Array.isArray(value)) {
        const resolvedIds: DynamicId[] = [];
        for (const v of value) {
          if (isLocalId(v)) {
            const ref = await this.local.getByLocalId(v);
            if (!ref?.remoteId) return { skip: true };
            resolvedIds.push(ref.remoteId);
          } else {
            resolvedIds.push(v as DynamicId);
          }
        }
        resolved[relation.name] = resolvedIds;
      } else if (isLocalId(value)) {
        const ref = await this.local.getByLocalId(value);
        if (!ref?.remoteId) return { skip: true };
        resolved[relation.name] = ref.remoteId;
      }
    }
    return { data: resolved };
  }
}

function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
  }
  return true;
}
