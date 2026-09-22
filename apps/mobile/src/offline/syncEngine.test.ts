import { describe, expect, it, vi } from 'vitest';
import { SyncEngine } from './syncEngine';
import { SyncQueue, type SyncQueueItem } from './syncQueue';
import { LocalDataSource } from './localDataSource';
import { InMemoryRecordStore } from './recordStore';
import type { LocalDynamicEntity } from './localDynamicEntity';
import type { DynamicDataSource } from './dynamicDataSource';
import type { DomainManifest, EntityDefinition } from '../domain/manifest';
import type { RepositoryResult } from '../engine/dynamicRepository';
import type { DynamicData, DynamicId } from '../engine/dynamicCommand';
import type { DynamicEntity } from '../engine/dynamicEntity';

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

const estudiante: EntityDefinition = {
  name: 'Estudiante',
  label: 'Estudiante',
  pluralLabel: 'Estudiantes',
  endpoint: '/api/estudiantes',
  id: { fields: [{ name: 'ci', type: 'integer' }], generated: true },
  displayField: 'nombre',
  fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
  relations: [{ name: 'universidadId', targetEntity: 'Universidad', cardinality: 'MANY_TO_ONE', required: true }],
  operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
};

const manifest: DomainManifest = { version: '1.0', application: { name: 'Diagrama-principal' }, entities: [universidad, estudiante] };

/** Remoto falso, totalmente controlable por test -- nunca toca HTTP de verdad. */
class FakeRemote implements DynamicDataSource {
  create = vi.fn(async (_entity: EntityDefinition, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> => ({ kind: 'ok', value: { entityType: _entity.name, values: { ...data, id: 999 } } }));
  update = vi.fn(async (_entity: EntityDefinition, id: DynamicId, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> => ({ kind: 'ok', value: { entityType: _entity.name, values: { ...data, id } } }));
  get = vi.fn(async (_entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<DynamicEntity>> => ({ kind: 'ok', value: { entityType: _entity.name, values: { id, nombre: 'Carlos' } } }));
  delete = vi.fn(async (): Promise<RepositoryResult<void>> => ({ kind: 'ok', value: undefined }));
  list = vi.fn(async (_entity: EntityDefinition): Promise<RepositoryResult<DynamicEntity[]>> => ({ kind: 'ok', value: [] }));
  search = vi.fn(async (): Promise<RepositoryResult<DynamicEntity[]>> => ({ kind: 'ok', value: [] }));
  count = vi.fn(async (): Promise<RepositoryResult<number>> => ({ kind: 'ok', value: 0 }));
}

function fakeIdGenerator(): () => string {
  let counter = 0;
  return () => `local:test-${++counter}`;
}

function setup() {
  const local = new LocalDataSource(new InMemoryRecordStore<LocalDynamicEntity>(), fakeIdGenerator());
  const queue = new SyncQueue(new InMemoryRecordStore<SyncQueueItem>(), fakeIdGenerator());
  const remote = new FakeRemote();
  const engine = new SyncEngine(queue, local, remote, manifest);
  return { local, queue, remote, engine };
}

describe('SyncEngine.processQueue -- CREATE', () => {
  it('sincroniza un CREATE simple: marca el local como SYNCED con el remoteId real', async () => {
    const { local, queue, remote, engine } = setup();
    const created = await local.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await queue.enqueue('Universidad', localId, { action: 'CREATE', entity: 'Universidad', data: { nombre: 'UMSA' } });

    const summary = await engine.processQueue();

    expect(summary).toEqual({ synced: 1, conflicts: 0, failed: 0, skipped: 0, stoppedByNetwork: false });
    expect(remote.create).toHaveBeenCalledWith(universidad, { nombre: 'UMSA' });
    const record = await local.getByLocalId(localId);
    expect(record?.syncStatus).toBe('SYNCED');
    expect(record?.remoteId).toBe(999);
  });

  it('un CREATE que referencia un id local todavía sin sincronizar queda en skip (PENDING) hasta que su padre sincronice', async () => {
    const { local, queue, remote, engine } = setup();
    const uni = await local.create(universidad, { nombre: 'UMSA' });
    if (uni.kind !== 'ok') throw new Error('esperaba ok');
    const uniLocalId = uni.value.values.id as string;

    const est = await local.create(estudiante, { nombre: 'Carlos', universidadId: uniLocalId });
    if (est.kind !== 'ok') throw new Error('esperaba ok');
    const estLocalId = est.value.values.id as string;

    // A propósito: encolamos el hijo ANTES que el padre, para probar que el skip funciona sin depender del orden.
    await queue.enqueue('Estudiante', estLocalId, { action: 'CREATE', entity: 'Estudiante', data: { nombre: 'Carlos', universidadId: uniLocalId } });
    await queue.enqueue('Universidad', uniLocalId, { action: 'CREATE', entity: 'Universidad', data: { nombre: 'UMSA' } });

    const firstPass = await engine.processQueue();
    // el Estudiante se saltea (su padre todavía no sincronizó en el momento en que le tocó el turno), la Universidad sí sincroniza
    expect(firstPass.synced).toBe(1);
    expect(firstPass.skipped).toBe(1);
    expect(remote.create).toHaveBeenCalledTimes(1);

    const secondPass = await engine.processQueue();
    expect(secondPass.synced).toBe(1);
    expect(remote.create).toHaveBeenCalledWith(estudiante, { nombre: 'Carlos', universidadId: 999 }); // reescrito al id remoto real
  });

  it('si el remoto devuelve network_error, corta toda la pasada y deja el item PENDING', async () => {
    const { local, queue, remote, engine } = setup();
    const created = await local.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await queue.enqueue('Universidad', localId, { action: 'CREATE', entity: 'Universidad', data: { nombre: 'UMSA' } });
    remote.create.mockResolvedValueOnce({ kind: 'network_error', message: 'sin conexión' });

    const summary = await engine.processQueue();

    expect(summary).toEqual({ synced: 0, conflicts: 0, failed: 0, skipped: 0, stoppedByNetwork: true });
    const pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    const record = await local.getByLocalId(localId);
    expect(record?.syncStatus).toBe('PENDING_SYNC');
  });

  it('si el remoto rechaza con un error real (no de red), marca el item como FAILED y sigue con el resto de la cola', async () => {
    const { local, queue, remote, engine } = setup();
    const uni1 = await local.create(universidad, { nombre: 'UMSA' });
    const uni2 = await local.create(universidad, { nombre: 'UCB' });
    if (uni1.kind !== 'ok' || uni2.kind !== 'ok') throw new Error('esperaba ok');
    await queue.enqueue('Universidad', uni1.value.values.id as string, { action: 'CREATE', entity: 'Universidad', data: { nombre: 'UMSA' } });
    await queue.enqueue('Universidad', uni2.value.values.id as string, { action: 'CREATE', entity: 'Universidad', data: { nombre: 'UCB' } });
    remote.create.mockResolvedValueOnce({ kind: 'client_error', message: 'dato inválido' });

    const summary = await engine.processQueue();

    expect(summary).toEqual({ synced: 1, conflicts: 0, failed: 1, skipped: 0, stoppedByNetwork: false });
  });
});

describe('SyncEngine.processQueue -- UPDATE y conflictos', () => {
  it('sincroniza un UPDATE sin conflicto', async () => {
    const { local, queue, remote, engine } = setup();
    const created = await local.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await local.markSynced(localId, 5, { id: 5, nombre: 'UMSA' });
    // el servidor sigue exactamente como lo conocíamos -- sin conflicto
    remote.get.mockResolvedValueOnce({ kind: 'ok', value: { entityType: 'Universidad', values: { id: 5, nombre: 'UMSA' } } });

    await local.update(universidad, 5, { nombre: 'UMSA Editada' });
    await queue.enqueue('Universidad', localId, { action: 'UPDATE', entity: 'Universidad', id: 5, data: { nombre: 'UMSA Editada' } });

    const summary = await engine.processQueue();

    expect(summary.synced).toBe(1);
    const record = await local.getByLocalId(localId);
    expect(record?.syncStatus).toBe('SYNCED');
  });

  it('detecta un conflicto si el servidor cambió el registro desde la última copia conocida, y NO aplica el update', async () => {
    const { local, queue, remote, engine } = setup();
    const created = await local.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await local.markSynced(localId, 5, { id: 5, nombre: 'UMSA' }); // última copia conocida: nombre "UMSA"

    await local.update(universidad, 5, { nombre: 'UMSA Editada por mí' });
    await queue.enqueue('Universidad', localId, { action: 'UPDATE', entity: 'Universidad', id: 5, data: { nombre: 'UMSA Editada por mí' } });

    // el servidor ahora tiene un valor DISTINTO al que conocíamos -- alguien más lo cambió
    remote.get.mockResolvedValueOnce({ kind: 'ok', value: { entityType: 'Universidad', values: { id: 5, nombre: 'UMSA Editada por otro usuario' } } });

    const summary = await engine.processQueue();

    expect(summary).toEqual({ synced: 0, conflicts: 1, failed: 0, skipped: 0, stoppedByNetwork: false });
    expect(remote.update).not.toHaveBeenCalled();
    const record = await local.getByLocalId(localId);
    expect(record?.syncStatus).toBe('CONFLICT');
  });

  it('un UPDATE cuyo propio CREATE todavía no sincronizó se saltea (no tiene remoteId todavía)', async () => {
    const { local, queue, remote, engine } = setup();
    const created = await local.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    // nunca se llamó a markSynced -- sigue sin remoteId
    await queue.enqueue('Universidad', localId, { action: 'UPDATE', entity: 'Universidad', id: localId, data: { nombre: 'x' } });

    const summary = await engine.processQueue();

    expect(summary.skipped).toBe(1);
    expect(remote.update).not.toHaveBeenCalled();
  });
});

describe('SyncEngine.processQueue -- DELETE', () => {
  it('sincroniza un DELETE de un registro ya remoto y lo borra local definitivamente', async () => {
    const { local, queue, remote, engine } = setup();
    const created = await local.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await local.markSynced(localId, 5, { id: 5, nombre: 'UMSA' });
    await local.delete(universidad, 5);
    await queue.enqueue('Universidad', localId, { action: 'DELETE', entity: 'Universidad', id: 5 });

    const summary = await engine.processQueue();

    expect(summary.synced).toBe(1);
    expect(remote.delete).toHaveBeenCalledWith(universidad, 5);
    expect(await local.getByLocalId(localId)).toBeNull();
  });
});

describe('SyncEngine.hydrate', () => {
  it('trae los registros que ya existían en el servidor y los agrega local como SYNCED', async () => {
    const { local, remote, engine } = setup();
    remote.list.mockImplementation(async (entity: EntityDefinition) => {
      if (entity.name !== 'Universidad') return { kind: 'ok', value: [] };
      return { kind: 'ok', value: [{ entityType: 'Universidad', values: { id: 7, nombre: 'UMSA' } }] };
    });

    await engine.hydrate();

    const list = await local.list(universidad);
    expect(list.kind).toBe('ok');
    if (list.kind !== 'ok') return;
    expect(list.value).toEqual([{ entityType: 'Universidad', values: { id: 7, nombre: 'UMSA' } }]);
  });

  it('no duplica un registro que ya existe local (por remoteId)', async () => {
    const { local, remote, engine } = setup();
    const created = await local.create(universidad, { nombre: 'UMSA' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    await local.markSynced(created.value.values.id as string, 7, { id: 7, nombre: 'UMSA' });

    remote.list.mockImplementation(async (entity: EntityDefinition) => {
      if (entity.name !== 'Universidad') return { kind: 'ok', value: [] };
      return { kind: 'ok', value: [{ entityType: 'Universidad', values: { id: 7, nombre: 'UMSA' } }] };
    });

    await engine.hydrate();

    const list = await local.list(universidad);
    if (list.kind !== 'ok') throw new Error('esperaba ok');
    expect(list.value).toHaveLength(1);
  });

  it('no rompe nada si el remoto falla (sin conexión) -- sigue con lo que ya había local', async () => {
    const { local, remote, engine } = setup();
    remote.list.mockResolvedValue({ kind: 'network_error', message: 'sin conexión' });

    await expect(engine.hydrate()).resolves.toBeUndefined();
    expect(await local.list(universidad)).toEqual({ kind: 'ok', value: [] });
  });
});

describe('SyncEngine -- multi-dominio (misma lógica, sin nada hardcodeado por entidad)', () => {
  it('funciona igual con un Manifest de otro dominio (Ventas: Cliente/Producto)', async () => {
    const cliente: EntityDefinition = {
      name: 'Cliente',
      label: 'Cliente',
      pluralLabel: 'Clientes',
      endpoint: '/api/clientes',
      id: { fields: [{ name: 'id', type: 'long' }], generated: true },
      displayField: 'nombre',
      fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
      relations: [],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
    };
    const ventasManifest: DomainManifest = { version: '1.0', application: { name: 'Ventas' }, entities: [cliente] };

    const local = new LocalDataSource(new InMemoryRecordStore<LocalDynamicEntity>(), fakeIdGenerator());
    const queue = new SyncQueue(new InMemoryRecordStore<SyncQueueItem>(), fakeIdGenerator());
    const remote = new FakeRemote();
    const engine = new SyncEngine(queue, local, remote, ventasManifest);

    const created = await local.create(cliente, { nombre: 'Pedro' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await queue.enqueue('Cliente', localId, { action: 'CREATE', entity: 'Cliente', data: { nombre: 'Pedro' } });

    const summary = await engine.processQueue();

    expect(summary.synced).toBe(1);
    expect(remote.create).toHaveBeenCalledWith(cliente, { nombre: 'Pedro' });
  });
});
