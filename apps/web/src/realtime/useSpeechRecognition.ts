import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * SpeechRecognition (Web Speech API) es no estándar: no está en lib.dom de
 * TypeScript, así que declaramos acá el subconjunto mínimo que usamos en
 * vez de agregar una dependencia de tipos solo para esto.
 */
interface SpeechRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return 'Necesitamos permiso para usar el micrófono.';
    case 'no-speech':
      return 'No se detectó voz, probá de nuevo.';
    case 'network':
      return 'Error de red al reconocer la voz.';
    default:
      return 'No se pudo reconocer la voz, probá de nuevo.';
  }
}

const DEFAULT_LANG = 'es-419';

export interface UseSpeechRecognitionOptions {
  /** Se llama con el texto transcripto cuando el reconocimiento termina. No manda nada por sí solo: quien use el hook decide qué hacer con el texto. */
  onResult: (transcript: string) => void;
  lang?: string;
}

export interface UseSpeechRecognitionResult {
  /** false si el navegador no implementa SpeechRecognition (Firefox, Safari viejo, etc.). */
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSpeechRecognition({
  onResult,
  lang = DEFAULT_LANG,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const [Ctor] = useState(() => getSpeechRecognitionConstructor());
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const start = useCallback(() => {
    if (!Ctor) {
      setError('Tu navegador no soporta reconocimiento de voz. Probá con Chrome o Edge.');
      return;
    }

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      if (transcript.trim()) onResultRef.current(transcript.trim());
    };
    recognition.onerror = (event) => {
      setError(describeSpeechError(event.error));
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    setError(null);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [Ctor, lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  return { supported: Ctor !== null, listening, error, start, stop };
}
