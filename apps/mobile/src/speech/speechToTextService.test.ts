import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechToTextService } from './speechToTextService';
import type { SpeechRecognitionCallbacks, SpeechRecognitionProvider, SpeechRecognitionSession } from './speechRecognitionProvider';

function fakeProvider(overrides: Partial<SpeechRecognitionProvider> = {}): SpeechRecognitionProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    getPermissions: vi.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
    requestPermissions: vi.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
    startListening: vi.fn(),
    ...overrides,
  };
}

describe('SpeechToTextService.listen', () => {
  it('audio válido: resuelve con el resultado que entrega el provider', async () => {
    const provider = fakeProvider({
      startListening: vi.fn((_opts, callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession => {
        callbacks.onResult({ text: 'Crea un paciente llamado Carlos', confidence: 0.95, language: 'es-419' });
        return { stop: vi.fn(), cancel: vi.fn() };
      }),
    });
    const service = new SpeechToTextService(provider);

    const result = await service.listen('es-419');

    expect(result).toEqual({ text: 'Crea un paciente llamado Carlos', confidence: 0.95, language: 'es-419' });
  });

  it('error del proveedor: rechaza con el código y mensaje que entrega el provider', async () => {
    const provider = fakeProvider({
      startListening: vi.fn((_opts, callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession => {
        callbacks.onError({ code: 'audio-capture', message: 'No se pudo acceder al micrófono.' });
        return { stop: vi.fn(), cancel: vi.fn() };
      }),
    });
    const service = new SpeechToTextService(provider);

    await expect(service.listen('es-419')).rejects.toEqual({ code: 'audio-capture', message: 'No se pudo acceder al micrófono.' });
  });

  it('respuesta vacía: el provider la reporta como no-speech, y el service la propaga tal cual', async () => {
    const provider = fakeProvider({
      startListening: vi.fn((_opts, callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession => {
        callbacks.onError({ code: 'no-speech', message: 'No se detectó ningún texto reconocible.' });
        return { stop: vi.fn(), cancel: vi.fn() };
      }),
    });
    const service = new SpeechToTextService(provider);

    await expect(service.listen('es-419')).rejects.toEqual({ code: 'no-speech', message: 'No se detectó ningún texto reconocible.' });
  });

  it('permiso ya concedido: no vuelve a pedirlo, solo consulta getPermissions', async () => {
    const requestPermissions = vi.fn();
    const provider = fakeProvider({
      getPermissions: vi.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
      requestPermissions,
      startListening: vi.fn((_opts, callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession => {
        callbacks.onResult({ text: 'ok', confidence: null, language: 'es-419' });
        return { stop: vi.fn(), cancel: vi.fn() };
      }),
    });
    const service = new SpeechToTextService(provider);

    await service.listen('es-419');

    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('permiso no concedido todavía: lo pide, y si el usuario lo otorga, sigue con la escucha', async () => {
    const provider = fakeProvider({
      getPermissions: vi.fn().mockResolvedValue({ granted: false, canAskAgain: true }),
      requestPermissions: vi.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
      startListening: vi.fn((_opts, callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession => {
        callbacks.onResult({ text: 'ok', confidence: null, language: 'es-419' });
        return { stop: vi.fn(), cancel: vi.fn() };
      }),
    });
    const service = new SpeechToTextService(provider);

    const result = await service.listen('es-419');

    expect(result.text).toBe('ok');
  });

  it('permiso rechazado (todavía se puede volver a pedir): rechaza sin llegar a escuchar', async () => {
    const startListening = vi.fn();
    const provider = fakeProvider({
      getPermissions: vi.fn().mockResolvedValue({ granted: false, canAskAgain: true }),
      requestPermissions: vi.fn().mockResolvedValue({ granted: false, canAskAgain: true }),
      startListening,
    });
    const service = new SpeechToTextService(provider);

    await expect(service.listen('es-419')).rejects.toEqual({
      code: 'not-allowed',
      message: 'Se necesita permiso de micrófono para usar el dictado por voz.',
    });
    expect(startListening).not.toHaveBeenCalled();
  });

  it('permiso rechazado para siempre: da un mensaje distinto, indicando ir a Ajustes', async () => {
    const provider = fakeProvider({
      getPermissions: vi.fn().mockResolvedValue({ granted: false, canAskAgain: false }),
      requestPermissions: vi.fn().mockResolvedValue({ granted: false, canAskAgain: false }),
    });
    const service = new SpeechToTextService(provider);

    await expect(service.listen('es-419')).rejects.toEqual({
      code: 'not-allowed',
      message: expect.stringContaining('ajustes'),
    });
  });

  it('dispositivo sin reconocimiento de voz disponible: rechaza sin pedir permisos', async () => {
    const getPermissions = vi.fn();
    const provider = fakeProvider({ isAvailable: vi.fn().mockResolvedValue(false), getPermissions });
    const service = new SpeechToTextService(provider);

    await expect(service.listen('es-419')).rejects.toEqual({
      code: 'unavailable',
      message: 'El reconocimiento de voz no está disponible en este dispositivo.',
    });
    expect(getPermissions).not.toHaveBeenCalled();
  });

  it('timeout: si el provider nunca llama a onResult/onError, rechaza con timeout y cancela la sesión', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const provider = fakeProvider({
      startListening: vi.fn((): SpeechRecognitionSession => ({ stop: vi.fn(), cancel })),
    });
    const service = new SpeechToTextService(provider, 5000);

    const pending = service.listen('es-419');
    const assertion = expect(pending).rejects.toEqual({ code: 'timeout', message: 'No se detectó ninguna instrucción a tiempo.' });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    expect(cancel).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('SpeechToTextService.cancel', () => {
  it('corta la sesión activa', async () => {
    const cancel = vi.fn();
    let capturedCallbacks: SpeechRecognitionCallbacks | undefined;
    let started: () => void = () => {};
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = fakeProvider({
      startListening: vi.fn((_opts, callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession => {
        capturedCallbacks = callbacks;
        started();
        return { stop: vi.fn(), cancel };
      }),
    });
    const service = new SpeechToTextService(provider);

    const pending = service.listen('es-419');
    await startedPromise; // esperamos a que la sesión realmente haya arrancado (isAvailable/permisos son async)
    service.cancel();

    expect(cancel).toHaveBeenCalled();
    // liberamos la promesa pendiente para que el test no cuelgue
    capturedCallbacks?.onError({ code: 'aborted', message: 'cancelado' });
    await expect(pending).rejects.toBeDefined();
  });

  it('no hace nada si no hay ninguna sesión activa', () => {
    const service = new SpeechToTextService(fakeProvider());
    expect(() => service.cancel()).not.toThrow();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
