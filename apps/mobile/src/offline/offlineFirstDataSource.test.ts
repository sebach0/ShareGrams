import { describe, expect, it } from 'vitest';
import { OfflineFirstDataSource } from './offlineFirstDataSource';
import { LocalDataSource } from './localDataSource';
import { SyncQueue, type SyncQueueItem } from './syncQueue';
import { InMemoryRecordStore } from './recordStore';
import type { LocalDynamicEntity } from './localDynamicEntity';
import type { EntityDefinition } from '../domain/manifest';

const universidad: EntityDefinition = {
  name: 'Universidad',
  label: 'Universidad',
  pluralLabel: 'Universidades',
  endpoint: '/api/universidads',
  id: { fields: [{ name: 'id', type: 'long' }], generated: true },
  displayField: 'nombre',
  fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
  relations: [],
  operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
};

function fakeIdGenerator(): () => string {
  let counter = 0;
  return () => `local:test-${++counter}`;
}

function setup() {
  const local = new LocalDataSource(new InMemoryRecordStore<LocalDynamicEntity>(), fakeIdGenerator());
  const queue = new SyncQueue(new InMemoryRecordStore<SyncQueueItem>(), fakeIdGenerator());
  const ds = new OfflineFirstDataSource(local, queue);
  return { local, queue, ds };
}

describe('OfflineFirstDataSource.create', () => {
  it('guarda local y encola un CREATE para sincronizar después', async () => {
    const { ds, queue } = setup();
    const result = await ds.create(universidad, { nombre: 'UMSA' });

    expect(result.kind).toBe('ok');
    const pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].command).toEqual({ action: 'CREATE', entity: 'Universidad', data: { nombre: 'UMSA' } });
  });
});

describe('OfflineFirstDataSource.update', () => {
  it('guarda local y encola un UPDATE', async () => {
    const { ds, queue } = setup();
    const created = await ds.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;

    await ds.update(universidad, localId, { nombre: 'UMSA Editada' });

    const pending = await queue.listPending();
    // un item por el CREATE, otro por el UPDATE
    expect(pending).toHaveLength(2);
    expect(pending[1].command).toEqual({ action: 'UPDATE', entity: 'Universidad', id: localId, data: { nombre: 'UMSA Editada' } });
  });
});

describe('OfflineFirstDataSource.delete', () => {
  it('un registro que nunca sincronizó se borra local sin encolar nada (nada que sincronizar)', async () => {
    const { ds, queue } = setup();
    const created = await ds.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;

    await ds.delete(universidad, localId);

    const pending = await queue.listPending();
    // el CREATE original queda huérfano en la cola (el registro ya no existe) -- pero no se agregó un DELETE nuevo
    expect(pending.filter((i) => i.command.action === 'DELETE')).toHaveLength(0);
  });

  it('un registro ya sincronizado encola un DELETE real', async () => {
    const { local, ds, queue } = setup();
    const created = await ds.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await local.markSynced(localId, 5, { id: 5, nombre: 'UMSA' });

    await ds.delete(universidad, 5);

    const pending = await queue.listPending();
    const deleteItem = pending.find((i) => i.command.action === 'DELETE');
    expect(deleteItem?.command).toEqual({ action: 'DELETE', entity: 'Universidad', id: 5 });
  });
});

describe('OfflineFirstDataSource -- lecturas siempre van a lo local', () => {
  it('list/get/search/count nunca hacen red -- leen del LocalDataSource', async () => {
    const { ds } = setup();
    await ds.create(universidad, { nombre: 'UMSA' });
    await ds.create(universidad, { nombre: 'UCB' });

    const list = await ds.list(universidad);
    expect(list.kind).toBe('ok');
    if (list.kind === 'ok') expect(list.value).toHaveLength(2);

    const count = await ds.count(universidad);
    expect(count).toEqual({ kind: 'ok', value: 2 });
  });
});
