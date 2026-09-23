import { useCallback, useRef, useState } from 'react';
import { SpeechToTextService, type SpeechToTextError } from './speechToTextService';
import { expoSpeechRecognitionProvider } from './expoSpeechRecognitionProvider';
import type { SpeechRecognitionResult } from './speechRecognitionProvider';

export type SpeechToTextState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

// "es-419" (español latinoamericano genérico) no es un locale confiable
// para el reconocimiento de voz nativo de Android: en algunos dispositivos
// (confirmado en un Xiaomi/MIUI) el SpeechRecognizer arranca a escuchar
// pero nunca devuelve resultado ni error -- el timeout propio de
// SpeechToTextService es lo único que corta la espera. Mismo síntoma y
// misma causa que ya se encontró y arregló en apps/web (useSpeechRecognition,
// Fase 6): "es-419" no está en la lista de locales que el motor soporta de
// forma confiable. "es-BO" sí.
export const DEFAULT_SPEECH_LANGUAGE = 'es-BO';

/**
 * Hook de React para la UI (equivalente mobile de `useSpeechRecognition`
 * en apps/web, Fase 6) sobre `SpeechToTextService`. Expone únicamente
 * estado + texto reconocido -- nunca decide qué hacer con ese texto
 * (regla 15/18): quien lo usa (AIChatScreen) es responsable de llenar el
 * input y dejar que el usuario confirme antes de mandarlo a Fase 15.
 */
export function useSpeechToText(language: string = DEFAULT_SPEECH_LANGUAGE) {
  const [state, setState] = useState<SpeechToTextState>('idle');
  const [error, setError] = useState<SpeechToTextError | null>(null);
  const serviceRef = useRef<SpeechToTextService | null>(null);
  if (!serviceRef.current) serviceRef.current = new SpeechToTextService(expoSpeechRecognitionProvider);

  const listen = useCallback(async (): Promise<SpeechRecognitionResult | null> => {
    setError(null);
    setState('listening');
    try {
      const result = await serviceRef.current!.listen(language, {
        onSpeechEnd: () => setState('processing'),
      });
      setState('success');
      return result;
    } catch (err) {
      setState('error');
      setError(err as SpeechToTextError);
      return null;
    }
  }, [language]);

  const cancel = useCallback(() => {
    serviceRef.current?.cancel();
    setState('idle');
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
  }, []);

  return { state, error, listen, cancel, reset };
}
