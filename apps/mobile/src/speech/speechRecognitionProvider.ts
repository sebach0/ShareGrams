/**
 * Abstracción de Fase 16 (regla 4/5): nada del resto de la app conoce
 * `expo-speech-recognition` directamente -- solo esta interfaz. Cambiar de
 * motor de voz (Whisper, Vosk, un servicio cloud, etc.) es implementar un
 * nuevo `SpeechRecognitionProvider`, sin tocar `SpeechToTextService` ni la
 * UI.
 *
 * El motor real (Android SpeechRecognizer / iOS SFSpeechRecognizer, vía
 * expo-speech-recognition) es un módulo nativo basado en eventos, no una
 * función `recognize(audio) -> texto` de una sola llamada -- graba y
 * transcribe en vivo, y puede emitir varios eventos por sesión (arranca,
 * empieza a detectar voz, entrega un resultado final, o falla). Esta
 * interfaz refleja eso tal cual es, en vez de forzar una forma Promise
 * simple que no existe en el motor real.
 */
export interface SpeechRecognitionResult {
  text: string;
  /** null si el proveedor no informa confianza (algunos motores on-device no la exponen). */
  confidence: number | null;
  language: string;
}

export type SpeechRecognitionErrorCode =
  | 'not-allowed'
  | 'no-speech'
  | 'network'
  | 'audio-capture'
  | 'aborted'
  | 'unavailable'
  | 'unknown';

export interface SpeechRecognitionError {
  code: SpeechRecognitionErrorCode;
  message: string;
}

export interface SpeechRecognitionCallbacks {
  onSpeechStart?: () => void;
  /** El usuario dejó de hablar y el motor está terminando de procesar -- útil para pasar de LISTENING a PROCESSING en la UI. */
  onSpeechEnd?: () => void;
  onResult: (result: SpeechRecognitionResult) => void;
  onError: (error: SpeechRecognitionError) => void;
}

export interface SpeechRecognitionSession {
  /** Corta la escucha y procesa lo que se alcanzó a grabar (dispara onResult u onError). */
  stop: () => void;
  /** Corta la escucha sin procesar nada (no dispara onResult). */
  cancel: () => void;
}

export interface PermissionState {
  granted: boolean;
  /** false = el usuario lo rechazó "para siempre" (Android) -- hay que mandarlo a Ajustes, no volver a pedir. */
  canAskAgain: boolean;
}

export interface SpeechRecognitionProvider {
  isAvailable: () => Promise<boolean>;
  getPermissions: () => Promise<PermissionState>;
  requestPermissions: () => Promise<PermissionState>;
  startListening: (options: { language: string }, callbacks: SpeechRecognitionCallbacks) => SpeechRecognitionSession;
}
