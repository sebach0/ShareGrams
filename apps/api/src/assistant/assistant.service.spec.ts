import { ConfigService } from '@nestjs/config';
import type { UMLModel } from '@sharegrams/uml-core';
import type { EnvConfig } from '../config/env';
import { AssistantService } from './assistant.service';

const createMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

function toolUseResponse(blocks: Array<{ name: string; input: unknown }>) {
  return {
    content: blocks.map((b, i) => ({ type: 'tool_use', id: `tool_${i}`, name: b.name, input: b.input })),
  };
}

describe('AssistantService', () => {
  let config: jest.Mocked<ConfigService<EnvConfig, true>>;
  let service: AssistantService;

  const emptyModel: UMLModel = { classes: [], relationships: [] };

  beforeEach(() => {
    createMock.mockReset();
    config = { get: jest.fn() } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    config.get.mockImplementation((key: string) => {
      if (key === 'anthropicApiKey') return 'test-key';
      if (key === 'anthropicModel') return 'claude-haiku-4-5-20251001';
      throw new Error(`config key inesperada: ${key}`);
    });
    service = new AssistantService(config);
  });

  it('devuelve not_configured si falta la API key, sin llamar al SDK', async () => {
    config.get.mockImplementation((key: string) => (key === 'anthropicApiKey' ? undefined : 'x'));

    const result = await service.interpret('crear clase Cliente', { model: emptyModel });

    expect(result).toEqual({
      ok: false,
      reason: 'not_configured',
      message: expect.any(String),
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('traduce una instrucción simple a un Command resuelto', async () => {
    createMock.mockResolvedValue(toolUseResponse([{ name: 'create_class', input: { name: 'Cliente' } }]));

    const result = await service.interpret('creá la clase Cliente', { model: emptyModel });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ type: 'CREATE_CLASS', name: 'Cliente' });
    expect(result.message).toContain('Cliente');
  });

  it('aplica varios tool_use en una sola instrucción, en orden', async () => {
    createMock.mockResolvedValue(
      toolUseResponse([
        { name: 'create_class', input: { name: 'Cliente' } },
        { name: 'create_class', input: { name: 'Pedido' } },
      ]),
    );

    const result = await service.interpret('creá Cliente y Pedido', { model: emptyModel });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.commands.map((c) => (c as { name: string }).name)).toEqual(['Cliente', 'Pedido']);
  });

  it('mapea ask_clarification a clarification_needed', async () => {
    createMock.mockResolvedValue(
      toolUseResponse([{ name: 'ask_clarification', input: { question: '¿A qué posición la muevo?' } }]),
    );

    const result = await service.interpret('mové la clase Cliente', { model: emptyModel });

    expect(result).toEqual({ ok: false, reason: 'clarification_needed', message: '¿A qué posición la muevo?' });
  });

  it('mapea report_unsupported a unsupported', async () => {
    createMock.mockResolvedValue(
      toolUseResponse([{ name: 'report_unsupported', input: { message: 'Eso pide generar todo el sistema.' } }]),
    );

    const result = await service.interpret('diseñame el sistema completo de ventas', { model: emptyModel });

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported',
      message: 'Eso pide generar todo el sistema.',
    });
  });

  it('propaga un not_found que detecta el resolver, aunque el LLM haya elegido una tool de UML', async () => {
    createMock.mockResolvedValue(
      toolUseResponse([{ name: 'delete_class', input: { className: 'NoExiste' } }]),
    );

    const result = await service.interpret('eliminá la clase NoExiste', { model: emptyModel });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not_found');
  });

  it('devuelve error si la respuesta no trae ningún tool_use', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'no puedo ayudarte con eso' }] });

    const result = await service.interpret('hola', { model: emptyModel });

    expect(result).toEqual({ ok: false, reason: 'error', message: expect.any(String) });
  });

  it('devuelve error si la llamada a la API falla', async () => {
    createMock.mockRejectedValue(new Error('network down'));

    const result = await service.interpret('creá la clase Cliente', { model: emptyModel });

    expect(result).toEqual({ ok: false, reason: 'error', message: expect.any(String) });
  });
});
