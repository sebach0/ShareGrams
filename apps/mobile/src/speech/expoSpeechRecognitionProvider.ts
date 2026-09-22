import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type {
  PermissionState,
  SpeechRecognitionCallbacks,
  SpeechRecognitionErrorCode,
  SpeechRecognitionProvider,
  SpeechRecognitionSession,
} from './speechRecognitionProvider';

/**
 * Implementación concreta de `SpeechRecognitionProvider` sobre
 * `expo-speech-recognition`, que a su vez envuelve el reconocedor nativo
 * del sistema operativo (Android SpeechRecognizer / iOS
 * SFSpeechRecognizer) -- sin costo por uso, sin API key, ver justificación
 * de la elección en el informe de Fase 16.
 *
 * `continuous: false` -- una sola frase por sesión, coherente con la
 * regla 17 (nada de conversaciones multi-turno todavía). `isFinal` en el
 * evento "result" es lo que distingue el resultado definitivo de
 * resultados intermedios; acá solo se reporta el definitivo.
 */
/**
 * Mensajes propios en español por código, en vez de reenviar `event.message`
 * tal cual -- ese texto lo arma el sistema operativo en SU idioma (se
 * comprobó en un dispositivo real: llega en inglés aunque `lang` sea
 * "es-419", ya que es un mensaje de diagnóstico del OS, no del resultado
 * reconocido), y el resto de la UI de ShareGrams es en español.
 */
const ERROR_MESSAGES: Record<SpeechRecognitionErrorCode, string> = {
  'not-allowed': 'Permiso de micrófono denegado.',
  'no-speech': 'No se detectó ningún texto reconocible.',
  network: 'Error de red al reconocer la voz.',
  'audio-capture': 'No se pudo acceder al micrófono.',
  aborted: 'Reconocimiento cancelado.',
  unavailable: 'El reconocimiento de voz no está disponible en este dispositivo.',
  unknown: 'Error de reconocimiento de voz.',
};

function mapError(code: string): { code: SpeechRecognitionErrorCode; message: string } {
  const mapped = (code in ERROR_MESSAGES ? code : 'unknown') as SpeechRecognitionErrorCode;
  return { code: mapped, message: ERROR_MESSAGES[mapped] };
}

export const expoSpeechRecognitionProvider: SpeechRecognitionProvider = {
  async isAvailable() {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  },

  async getPermissions(): Promise<PermissionState> {
    const result = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    return { granted: result.granted, canAskAgain: result.canAskAgain };
  },

  async requestPermissions(): Promise<PermissionState> {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return { granted: result.granted, canAskAgain: result.canAskAgain };
  },

  startListening(options: { language: string }, callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession {
    // Se limpia sola apenas llega un evento terminal ("result" final o
    // "error"), no solo cuando quien llama corta la sesión a mano
    // (stop/cancel), para no dejar listeners nativos colgados después de
    // una sesión que ya terminó por su cuenta.
    let listeners: Array<{ remove: () => void }> = [];
    const cleanup = () => listeners.forEach((l) => l.remove());

    listeners = [
      ExpoSpeechRecognitionModule.addListener('speechstart', () => callbacks.onSpeechStart?.()),
      ExpoSpeechRecognitionModule.addListener('speechend', () => callbacks.onSpeechEnd?.()),
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        if (!event.isFinal) return;
        cleanup();
        const best = event.results[0];
        if (!best || !best.transcript) {
          callbacks.onError({ code: 'no-speech', message: 'No se detectó ningún texto reconocible.' });
          return;
        }
        callbacks.onResult({ text: best.transcript, confidence: best.confidence ?? null, language: options.language });
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        cleanup();
        callbacks.onError(mapError(event.error));
      }),
    ];

    ExpoSpeechRecognitionModule.start({
      lang: options.language,
      interimResults: false,
      continuous: false,
      maxAlternatives: 1,
    });

    return {
      stop: () => {
        ExpoSpeechRecognitionModule.stop();
        cleanup();
      },
      cancel: () => {
        ExpoSpeechRecognitionModule.abort();
        cleanup();
      },
    };
  },
};
