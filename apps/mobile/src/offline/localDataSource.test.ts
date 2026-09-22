import { describe, expect, it } from 'vitest';
import { LocalDataSource } from './localDataSource';
import { InMemoryRecordStore } from './recordStore';
import type { LocalDynamicEntity } from './localDynamicEntity';
import type { EntityDefinition } from '../domain/manifest';

const paciente: EntityDefinition = {
  name: 'Paciente',
  label: 'Paciente',
  pluralLabel: 'Pacientes',
  endpoint: '/api/pacientes',
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

function newDataSource() {
  return new LocalDataSource(new InMemoryRecordStore<LocalDynamicEntity>(), fakeIdGenerator());
}

describe('LocalDataSource.create', () => {
  it('genera un localId y lo devuelve como el id público del registro', async () => {
    const ds = newDataSource();
    const result = await ds.create(paciente, { nombre: 'Carlos' });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.value.values.nombre).toBe('Carlos');
    expect(String(result.value.values.id)).toMatch(/^local:/);
  });

  it('el registro queda PENDING_SYNC y sin remoteId', async () => {
    const ds = newDataSource();
    const result = await ds.create(paciente, { nombre: 'Carlos' });
    if (result.kind !== 'ok') throw new Error('esperaba ok');
    const raw = await ds.getByLocalId(String(result.value.values.id));
    expect(raw?.syncStatus).toBe('PENDING_SYNC');
    expect(raw?.remoteId).toBeNull();
  });
});

describe('LocalDataSource.list/get/search/count', () => {
  it('list devuelve solo los registros de esa entidad, no de otras', async () => {
    const ds = newDataSource();
    await ds.create(paciente, { nombre: 'Carlos' });
    const otraEntidad: EntityDefinition = { ...paciente, name: 'Medico' };
    await ds.create(otraEntidad, { nombre: 'Dra. Pérez' });

    const result = await ds.list(paciente);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].values.nombre).toBe('Carlos');
  });

  it('get por el localId encuentra el registro recién creado', async () => {
    const ds = newDataSource();
    const created = await ds.create(paciente, { nombre: 'Carlos' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;

    const result = await ds.get(paciente, localId);
    expect(result).toEqual({ kind: 'ok', value: { entityType: 'Paciente', values: { nombre: 'Carlos', id: localId } } });
  });

  it('get con un id que no existe -> not_found', async () => {
    const ds = newDataSource();
    const result = await ds.get(paciente, 'local:no-existe');
    expect(result).toEqual({ kind: 'not_found' });
  });

  it('get por remoteId encuentra el registro ya sincronizado', async () => {
    const ds = newDataSource();
    const created = await ds.create(paciente, { nombre: 'Carlos' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await ds.markSynced(localId, 5, { id: 5, nombre: 'Carlos' });

    const result = await ds.get(paciente, 5);
    expect(result).toEqual({ kind: 'ok', value: { entityType: 'Paciente', values: { id: 5, nombre: 'Carlos' } } });
  });

  it('search filtra en memoria por igualdad exacta', async () => {
    const ds = newDataSource();
    await ds.create(paciente, { nombre: 'Carlos' });
    await ds.create(paciente, { nombre: 'Ana' });

    const result = await ds.search(paciente, { nombre: 'Ana' });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].values.nombre).toBe('Ana');
  });

  it('count sin filtros cuenta todos los registros de la entidad', async () => {
    const ds = newDataSource();
    await ds.create(paciente, { nombre: 'Carlos' });
    await ds.create(paciente, { nombre: 'Ana' });
    const result = await ds.count(paciente);
    expect(result).toEqual({ kind: 'ok', value: 2 });
  });
});

describe('LocalDataSource.update', () => {
  it('actualiza los valores y mantiene PENDING_SYNC', async () => {
    const ds = newDataSource();
    const created = await ds.create(paciente, { nombre: 'Carlos' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;

    const result = await ds.update(paciente, localId, { nombre: 'Carlos Actualizado' });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.value.values.nombre).toBe('Carlos Actualizado');
  });

  it('update de un id inexistente -> not_found', async () => {
    const ds = newDataSource();
    const result = await ds.update(paciente, 'local:no-existe', { nombre: 'x' });
    expect(result).toEqual({ kind: 'not_found' });
  });
});

describe('LocalDataSource.delete', () => {
  it('un registro que nunca sincronizó se borra directo (no queda tombstone)', async () => {
    const ds = newDataSource();
    const created = await ds.create(paciente, { nombre: 'Carlos' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;

    const result = await ds.delete(paciente, localId);
    expect(result).toEqual({ kind: 'ok', value: undefined });
    expect(await ds.getByLocalId(localId)).toBeNull();
  });

  it('un registro ya sincronizado queda como tombstone (soft delete) hasta que el SyncEngine lo confirme', async () => {
    const ds = newDataSource();
    const created = await ds.create(paciente, { nombre: 'Carlos' });
    if (created.kind !== 'ok') throw new Error('esperaba ok');
    const localId = created.value.values.id as string;
    await ds.markSynced(localId, 5, { id: 5, nombre: 'Carlos' });

    const result = await ds.delete(paciente, 5);
    expect(result).toEqual({ kind: 'ok', value: undefined });

    const raw = await ds.getByLocalId(localId);
    expect(raw?.deleted).toBe(true);
    // ya no aparece en list/get aunque la fila siga existiendo
    expect(await ds.get(paciente, 5)).toEqual({ kind: 'not_found' });
  });

  it('delete de un id inexistente -> not_found', async () => {
    const ds = newDataSource();
    const result = await ds.delete(paciente, 'local:no-existe');
    expect(result).toEqual({ kind: 'not_found' });
  });
});
