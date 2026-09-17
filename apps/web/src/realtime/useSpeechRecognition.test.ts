import { describe, expect, it } from 'vitest';
import { describeSpeechError } from './useSpeechRecognition';

describe('describeSpeechError', () => {
  it('explica el permiso de micrófono denegado', () => {
    expect(describeSpeechError('not-allowed')).toMatch(/permiso/i);
    expect(describeSpeechError('permission-denied')).toMatch(/permiso/i);
  });

  it('explica que no se detectó voz', () => {
    expect(describeSpeechError('no-speech')).toMatch(/no se detectó voz/i);
  });

  it('da un mensaje genérico para códigos desconocidos', () => {
    expect(describeSpeechError('algo-raro')).toBeTruthy();
  });
});
