import { describe, expect, it } from 'vitest';
import { SyncQueue, type SyncQueueItem } from './syncQueue';
import { InMemoryRecordStore } from './recordStore';

function fakeIdGenerator(): () => string {
  let counter = 0;
  return () => `id-${++counter}`;
}

function newQueue() {
  return new SyncQueue(new InMemoryRecordStore<SyncQueueItem>(), fakeIdGenerator());
}

describe('SyncQueue.enqueue', () => {
  it('agrega el comando con estado PENDING', async () => {
    const queue = newQueue();
    const item = await queue.enqueue('Paciente', 'local:abc', { action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos' } });
    expect(item.status).toBe('PENDING');
    expect(item.entityType).toBe('Paciente');
    expect(item.localId).toBe('local:abc');
    expect(item.command).toEqual({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos' } });
  });
});

describe('SyncQueue.listPending', () => {
  it('devuelve solo los PENDING, en orden de creación (FIFO)', async () => {
    const queue = newQueue();
    const first = await queue.enqueue('Universidad', 'local:u1', { action: 'CREATE', entity: 'Universidad', data: {} });
    const second = await queue.enqueue('Estudiante', 'local:e1', { action: 'CREATE', entity: 'Estudiante', data: {} });
    await queue.updateStatus(first.id, 'SYNCED');

    const pending = await queue.listPending();
    expect(pending.map((i) => i.id)).toEqual([second.id]);
  });
});

describe('SyncQueue.updateStatus', () => {
  it('cambia el estado y guarda el mensaje de error si se pasa uno', async () => {
    const queue = newQueue();
    const item = await queue.enqueue('Paciente', 'local:abc', { action: 'CREATE', entity: 'Paciente', data: {} });
    await queue.updateStatus(item.id, 'FAILED', 'boom');

    const all = await queue.all();
    expect(all[0]).toMatchObject({ status: 'FAILED', error: 'boom' });
  });

  it('no hace nada si el id no existe', async () => {
    const queue = newQueue();
    await expect(queue.updateStatus('no-existe', 'SYNCED')).resolves.toBeUndefined();
  });
});

describe('SyncQueue.remove', () => {
  it('elimina el item de la cola', async () => {
    const queue = newQueue();
    const item = await queue.enqueue('Paciente', 'local:abc', { action: 'CREATE', entity: 'Paciente', data: {} });
    await queue.remove(item.id);
    expect(await queue.all()).toEqual([]);
  });
});
