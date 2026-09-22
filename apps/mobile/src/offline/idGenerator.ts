import * as Crypto from 'expo-crypto';

/**
 * Generador REAL de ids temporales (Fase 17, regla 15) -- separado de
 * `localId.ts` a propósito. Bug real encontrado en uso en vivo: React
 * Native (Hermes) NO tiene un `crypto` global como el navegador o Node
 * -- el mismo patrón `crypto.getRandomValues()` que usa `generateId()` en
 * `packages/uml-core/src/model/factory.ts` (que corre en el navegador,
 * donde `crypto` SÍ existe) explota acá con `ReferenceError: Property
 * 'crypto' doesn't exist`. `expo-crypto` expone `Crypto.randomUUID()`
 * como polyfill multiplataforma.
 *
 * `expo-crypto` es un módulo nativo que Vitest ni siquiera puede parsear
 * (mismo problema que `expo-speech-recognition` en Fase 16) -- por eso
 * este archivo NUNCA lo importa `LocalDataSource`/`SyncQueue`
 * directamente (eso rompería TODOS sus tests, no solo los de esto,
 * porque el import envenena toda la cadena). En cambio, reciben un
 * `generateId: () => string` inyectado por constructor -- acá está la
 * única implementación real, usada por `createOfflineStack.ts`; los
 * tests inyectan un generador falso simple.
 */
export function generateLocalId(): string {
  return `local:${Crypto.randomUUID()}`;
}
