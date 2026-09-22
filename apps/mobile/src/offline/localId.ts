/**
 * Prefijo deliberado (Fase 17, regla 15): un id local nunca puede
 * confundirse con un id real del servidor (siempre numéricos, Fase 10 --
 * ver diagnóstico de Fase 17), así que un simple `id.startsWith('local:')`
 * alcanza para saber si un registro ya sincronizó o no, sin necesidad de
 * consultar `syncStatus` por separado.
 *
 * Pura a propósito, sin importar nada de `expo-crypto` acá (ver
 * `idGenerator.ts`): esto lo usa `SyncEngine` para decidir si una
 * relación necesita reescritura, y necesita poder testearse sin arrastrar
 * un módulo nativo a toda la cadena de imports.
 */
export function isLocalId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith('local:');
}
