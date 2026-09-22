import { ConfigService } from '@nestjs/config';
import type { DomainManifest } from '@sharegrams/uml-core';
import type { EnvConfig } from '../config/env';
import { DynamicAssistantService } from './dynamic-assistant.service';

const createMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

function toolUseResponse(name: string, input: unknown) {
  return { content: [{ type: 'tool_use', id: 'tool_0', name, input }] };
}

const clinicaManifest: DomainManifest = {
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
      fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
      relations: [],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
    },
    {
      name: 'Medico',
      label: 'Medico',
      pluralLabel: 'Medicos',
      endpoint: '/api/medicos',
      id: { fields: [{ name: 'id', type: 'long' }], generated: true },
      displayField: 'nombre',
      fields: [{ name: 'nombre', label: 'Nombre', type: 'string', required: true, editable: true, generated: false }],
      relations: [],
      operations: ['LIST', 'GET', 'CREATE'],
    },
  ],
};

describe('DynamicAssistantService', () => {
  let config: jest.Mocked<ConfigService<EnvConfig, true>>;
  let service: DynamicAssistantService;

  beforeEach(() => {
    createMock.mockReset();
    config = { get: jest.fn() } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    config.get.mockImplementation((key: string) => {
      if (key === 'anthropicApiKey') return 'test-key';
      if (key === 'anthropicModel') return 'claude-haiku-4-5-20251001';
      throw new Error(`config key inesperada: ${key}`);
    });
    service = new DynamicAssistantService(config);
  });

  it('devuelve NOT_CONFIGURED si falta la API key, sin llamar al SDK', async () => {
    config.get.mockImplementation((key: string) => (key === 'anthropicApiKey' ? undefined : 'x'));

    const result = await service.interpret('crea un paciente llamado Carlos', clinicaManifest);

    expect(result).toEqual({ status: 'NOT_CONFIGURED', message: expect.any(String) });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('CREATE: traduce una instrucción simple a un comando candidato', async () => {
    createMock.mockResolvedValue(toolUseResponse('create_record', { entity: 'Paciente', data: { nombre: 'Carlos' } }));

    const result = await service.interpret('crea un paciente llamado Carlos', clinicaManifest);

    expect(result).toEqual({
      status: 'COMMAND',
      command: { action: 'CREATE', entity: 'Paciente', data: { nombre: 'Carlos' } },
      message: expect.stringContaining('Paciente'),
    });
  });

  it('LIST: no lleva id ni data', async () => {
    createMock.mockResolvedValue(toolUseResponse('list_records', { entity: 'Paciente' }));

    const result = await service.interpret('muéstrame todos los pacientes', clinicaManifest);

    expect(result).toEqual({ status: 'COMMAND', command: { action: 'LIST', entity: 'Paciente' }, message: expect.any(String) });
  });

  it('GET: incluye el id', async () => {
    createMock.mockResolvedValue(toolUseResponse('get_record', { entity: 'Paciente', id: 5 }));

    const result = await service.interpret('muéstrame el paciente con id 5', clinicaManifest);

    expect(result).toEqual({ status: 'COMMAND', command: { action: 'GET', entity: 'Paciente', id: 5 }, message: expect.any(String) });
  });

  it('UPDATE: incluye id y data', async () => {
    createMock.mockResolvedValue(toolUseResponse('update_record', { entity: 'Paciente', id: 5, data: { nombre: 'Juan' } }));

    const result = await service.interpret('cambia el nombre del paciente 5 a Juan', clinicaManifest);

    expect(result).toEqual({
      status: 'COMMAND',
      command: { action: 'UPDATE', entity: 'Paciente', id: 5, data: { nombre: 'Juan' } },
      message: expect.any(String),
    });
  });

  it('DELETE: no incluye la herramienta para Medico (Manifest no declara DELETE para esa entidad) -- no se puede probar acá sin invocar Anthropic real, se verifica en dynamic-assistant.tools.spec.ts', async () => {
    createMock.mockResolvedValue(toolUseResponse('delete_record', { entity: 'Paciente', id: 5 }));

    const result = await service.interpret('elimina el paciente 5', clinicaManifest);

    expect(result).toEqual({ status: 'COMMAND', command: { action: 'DELETE', entity: 'Paciente', id: 5 }, message: expect.any(String) });
  });

  it('mapea ask_clarification a CLARIFICATION_REQUIRED', async () => {
    createMock.mockResolvedValue(toolUseResponse('ask_clarification', { question: '¿Qué entidad querés crear?' }));

    const result = await service.interpret('crea un registro', clinicaManifest);

    expect(result).toEqual({ status: 'CLARIFICATION_REQUIRED', message: '¿Qué entidad querés crear?' });
  });

  it('mapea report_invalid_request a INVALID_REQUEST', async () => {
    createMock.mockResolvedValue(toolUseResponse('report_invalid_request', { message: 'La entidad Avion no existe.' }));

    const result = await service.interpret('crea un avión', clinicaManifest);

    expect(result).toEqual({ status: 'INVALID_REQUEST', message: 'La entidad Avion no existe.' });
  });

  it('mapea report_unsupported a INVALID_REQUEST (operación masiva)', async () => {
    createMock.mockResolvedValue(toolUseResponse('report_unsupported', { message: 'El borrado masivo no está soportado.' }));

    const result = await service.interpret('elimina todos los pacientes', clinicaManifest);

    expect(result).toEqual({ status: 'INVALID_REQUEST', message: 'El borrado masivo no está soportado.' });
  });

  it('devuelve AI_ERROR si la respuesta no trae ningún tool_use', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'hola' }] });

    const result = await service.interpret('hola', clinicaManifest);

    expect(result).toEqual({ status: 'AI_ERROR', message: expect.any(String) });
  });

  it('devuelve AI_ERROR si la llamada a la API falla', async () => {
    createMock.mockRejectedValue(new Error('network down'));

    const result = await service.interpret('crea un paciente', clinicaManifest);

    expect(result).toEqual({ status: 'AI_ERROR', message: expect.any(String) });
  });

  it('devuelve AI_ERROR si Claude devuelve un tool_use desconocido', async () => {
    createMock.mockResolvedValue(toolUseResponse('herramienta_inventada', {}));

    const result = await service.interpret('crea un paciente', clinicaManifest);

    expect(result).toEqual({ status: 'AI_ERROR', message: expect.any(String) });
  });
});
