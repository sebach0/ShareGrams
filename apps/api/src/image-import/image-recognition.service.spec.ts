import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env';
import { ImageRecognitionService } from './image-recognition.service';

const createMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

function toolUseResponse(name: string, input: unknown) {
  return { content: [{ type: 'tool_use', id: 'tool_0', name, input }] };
}

describe('ImageRecognitionService', () => {
  let config: jest.Mocked<ConfigService<EnvConfig, true>>;
  let service: ImageRecognitionService;

  beforeEach(() => {
    createMock.mockReset();
    config = { get: jest.fn() } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    config.get.mockImplementation((key: string) => (key === 'anthropicApiKey' ? 'test-key' : 'x'));
    service = new ImageRecognitionService(config);
  });

  it('devuelve not_configured si falta la API key, sin llamar al SDK', async () => {
    config.get.mockImplementation((key: string) => (key === 'anthropicApiKey' ? undefined : 'x'));

    const result = await service.recognize(Buffer.from('img'), 'image/png', 0);

    expect(result).toEqual({ ok: false, reason: 'not_configured', message: expect.any(String) });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('traduce report_diagram a un batch de comandos resuelto', async () => {
    createMock.mockResolvedValue(
      toolUseResponse('report_diagram', {
        classes: [{ name: 'Cliente', attributes: [{ name: 'nombre', type: 'String' }] }],
        relationships: [],
      }),
    );

    const result = await service.recognize(Buffer.from('img'), 'image/png', 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commands.filter((c) => c.type === 'CREATE_CLASS')).toHaveLength(1);
    expect(result.summary).toContain('1 clase');
  });

  it('mapea report_unreadable a unreadable', async () => {
    createMock.mockResolvedValue(toolUseResponse('report_unreadable', { message: 'La imagen está borrosa.' }));

    const result = await service.recognize(Buffer.from('img'), 'image/png', 0);

    expect(result).toEqual({ ok: false, reason: 'unreadable', message: 'La imagen está borrosa.' });
  });

  it('devuelve error si la respuesta no trae ningún tool_use', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'no puedo leer eso' }] });

    const result = await service.recognize(Buffer.from('img'), 'image/png', 0);

    expect(result).toEqual({ ok: false, reason: 'error', message: expect.any(String) });
  });

  it('devuelve error si la llamada a la API falla', async () => {
    createMock.mockRejectedValue(new Error('network down'));

    const result = await service.recognize(Buffer.from('img'), 'image/png', 0);

    expect(result).toEqual({ ok: false, reason: 'error', message: expect.any(String) });
  });
});
