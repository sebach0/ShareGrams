import { describe, expect, it } from 'vitest';
import { fromDynamicEntity, toDynamicEntity } from './dynamicEntity';

describe('DynamicEntity', () => {
  it('la misma estructura representa entidades de dominios distintos', () => {
    const paciente = toDynamicEntity('Paciente', { id: 15, nombre: 'Carlos', fechaNacimiento: '2000-05-10' });
    const libro = toDynamicEntity('Libro', { id: 5, titulo: 'Clean Code' });

    expect(paciente).toEqual({ entityType: 'Paciente', values: { id: 15, nombre: 'Carlos', fechaNacimiento: '2000-05-10' } });
    expect(libro).toEqual({ entityType: 'Libro', values: { id: 5, titulo: 'Clean Code' } });
  });

  it('un JSON no-objeto se convierte en values vacío en vez de fallar', () => {
    expect(toDynamicEntity('Cliente', null)).toEqual({ entityType: 'Cliente', values: {} });
    expect(toDynamicEntity('Cliente', 'texto')).toEqual({ entityType: 'Cliente', values: {} });
  });

  it('fromDynamicEntity serializa de vuelta el JSON plano', () => {
    const entity = toDynamicEntity('Cliente', { nombre: 'Ana' });
    expect(fromDynamicEntity(entity)).toEqual({ nombre: 'Ana' });
  });
});
