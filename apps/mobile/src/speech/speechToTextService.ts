import type { PermissionState, SpeechRecognitionError, SpeechRecognitionProvider, SpeechRecognitionResult, SpeechRecognitionSession } from './speechRecognitionProvider';

export interface SpeechToTextError {
  code: SpeechRecognitionError['code'] | 'unavailable' | 'timeout';
  message: string;
}

/** Cuánto esperar a que el usuario EMPIECE a hablar antes de rendirse. */
const DEFAULT_TIMEOUT_MS = 10000;
/**
 * Una vez que ya empezó a hablar (`onSpeechStart`), el timeout de arriba se
 * reemplaza por este -- mucho más largo, porque acá ya no estamos
 * esperando a que arranque, sino dándole margen a una frase larga con
 * pausas naturales. Sin este cambio, una instrucción de más de
 * DEFAULT_TIMEOUT_MS se cortaba a la mitad (regla 18: nunca inventamos
 * texto, así que cortarla a la mitad no solo se ve mal -- puede mandar una
 * instrucción incompleta a Claude). El motor nativo (`continuous:false`)
 * igual corta solo apenas detecta silencio después de hablar, así que este
 * valor rara vez se llega a usar -- es una red de seguridad, no el timeout
 * "normal".
 */
const SPEECH_IN_PROGRESS_TIMEOUT_MS = 25000;

/**
 * SpeechToTextService (Fase 16, regla 7): recibe la orden de escuchar,
 * llama al SpeechRecognitionProvider configurado, y devuelve un resultado
 * estructurado o rechaza con un error -- nunca interpreta la instrucción,
 * nunca llama a Claude, nunca arma ni ejecuta un DynamicCommand (regla 18:
 * eso sigue siendo, entero, responsabilidad de Fase 15/13). Quien use este
 * servicio recibe texto plano, punto.
 */
export class SpeechToTextService {
  private activeSession: SpeechRecognitionSession | null = null;

  constructor(
    private readonly provider: SpeechRecognitionProvider,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private readonly speechInProgressTimeoutMs: number = SPEECH_IN_PROGRESS_TIMEOUT_MS,
  ) {}

  /** Corta una escucha en curso sin procesar nada, si hay alguna. No-op si no hay ninguna. */
  cancel(): void {
    this.activeSession?.cancel();
    this.activeSession = null;
  }

  async listen(language: string, callbacks?: { onSpeechStart?: () => void; onSpeechEnd?: () => void }): Promise<SpeechRecognitionResult> {
    const available = await this.provider.isAvailable();
    if (!available) {
      throw toError('unavailable', 'El reconocimiento de voz no está disponible en este dispositivo.');
    }

    const permission = await this.ensurePermission();
    if (!permission.granted) {
      throw toError(
        'not-allowed',
        permission.canAskAgain
          ? 'Se necesita permiso de micrófono para usar el dictado por voz.'
          : 'El permiso de micrófono fue denegado permanentemente -- habilitalo desde los ajustes del sistema.',
      );
    }

    return new Promise<SpeechRecognitionResult>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;

      const fail = (error: SpeechToTextError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.activeSession?.cancel();
        this.activeSession = null;
        reject(error);
      };

      timeout = setTimeout(() => fail(toError('timeout', 'No se detectó ninguna instrucción a tiempo.')), this.timeoutMs);

      this.activeSession = this.provider.startListening(
        { language },
        {
          onSpeechStart: () => {
            // Ya empezó a hablar: reemplazamos el timeout corto (esperando
            // que arranque) por uno largo (red de seguridad mientras habla),
            // para no cortarle una frase larga a la mitad.
            clearTimeout(timeout);
            timeout = setTimeout(() => fail(toError('timeout', 'No se detectó ninguna instrucción a tiempo.')), this.speechInProgressTimeoutMs);
            callbacks?.onSpeechStart?.();
          },
          onSpeechEnd: callbacks?.onSpeechEnd,
          onResult: (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            this.activeSession = null;
            resolve(result);
          },
          onError: (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            this.activeSession = null;
            reject(toError(error.code, error.message));
          },
        },
      );
    });
  }

  private async ensurePermission(): Promise<PermissionState> {
    const current = await this.provider.getPermissions();
    if (current.granted) return current;
    return this.provider.requestPermissions();
  }
}

function toError(code: SpeechToTextError['code'], message: string): SpeechToTextError {
  return { code, message };
}
