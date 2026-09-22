import { describe, expect, it } from 'vitest';
import { coerceAiCommand } from './coerceAiCommand';
import type { DomainManifest } from '../domain/manifest';

const manifest: DomainManifest = {
  version: '1.0',
  application: { name: 'Clínica' },
  entities: [
    {
      name: 'Paciente',
      label: 'Paciente',
      pluralLabel: 'Pacientes',
      endpoint: '/api/pacientes',
      id: { fields: [{ name: 'id', type: 'long' }], generated: true },
      displayField: 'nombre',
      fields: [
        { name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false },
        { name: 'edad', label: 'Edad', type: 'integer', required: false, editable: true, generated: false },
        { name: 'activo', label: 'Activo', type: 'boolean', required: false, editable: true, generated: false },
      ],
      relations: [{ name: 'medicoId', targetEntity: 'Medico', cardinality: 'MANY_TO_ONE', required: true }],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
    },
  ],
};

describe('coerceAiCommand', () => {
  it('convierte un id numérico en string a number, según el tipo real de la PK', () => {
    const result = coerceAiCommand({ action: 'GET', entity: 'Paciente', id: '5' }, manifest);
    expect(result).toEqual({ action: 'GET', entity: 'Paciente', id: 5 });
  });

  it('convierte campos integer/boolean dentro de "data" que Claude mandó como string', () => {
    const result = coerceAiCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', edad: '30', activo: 'true' } }, manifest);
    expect(result).toEqual({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', edad: 30, activo: true } });
  });

  it('convierte el id de una relación (string numérico -> number)', () => {
    const result = coerceAiCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', medicoId: '7' } }, manifest);
    expect(result).toEqual({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', medicoId: 7 } });
  });

  it('no toca un valor que ya viene con el tipo correcto', () => {
    const result = coerceAiCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', edad: 30 } }, manifest);
    expect(result).toEqual({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', edad: 30 } });
  });

  it('no fuerza una conversión si el valor no calza con el tipo -- lo deja tal cual para que el Validator lo rechace', () => {
    const result = coerceAiCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', edad: 'no-es-un-numero' } }, manifest);
    expect(result).toEqual({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos', edad: 'no-es-un-numero' } });
  });

  it('deja pasar un campo desconocido sin tocarlo (el Validator lo va a rechazar con UNKNOWN_FIELD)', () => {
    const result = coerceAiCommand({ action: 'CREATE', entity: 'Paciente', data: { marcaVehiculo: 'Toyota' } }, manifest);
    expect(result).toEqual({ action: 'CREATE', entity: 'Paciente', data: { marcaVehiculo: 'Toyota' } });
  });

  it('entidad inexistente: devuelve el comando sin cambios', () => {
    const result = coerceAiCommand({ action: 'LIST', entity: 'Avion' }, manifest);
    expect(result).toEqual({ action: 'LIST', entity: 'Avion' });
  });

  it('comando sin forma de objeto: se devuelve tal cual', () => {
    expect(coerceAiCommand('no es un objeto', manifest)).toBe('no es un objeto');
    expect(coerceAiCommand(null, manifest)).toBe(null);
  });
});
