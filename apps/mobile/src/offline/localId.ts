/**
 * Generador de ids temporales para registros creados offline (Fase 17,
 * regla 15). Mismo algoritmo que `generateId()` en
 * `packages/uml-core/src/model/factory.ts` (UUID v4 vía
 * `crypto.getRandomValues`, no `crypto.randomUUID` -- ese exige "secure
 * context" y este proyecto ya sirve contenido por HTTP plano en algunos
 * despliegues) -- no se importa directo porque `uml-core` es un paquete
 * compartido con el editor web y no vale la pena acoplar mobile a él solo
 * por esto.
 *
 * Prefijo `local:` deliberado: nunca puede confundirse con un id real del
 * servidor (que siempre son numéricos, Fase 10 -- ver diagnóstico de Fase
 * 17), así que un simple `id.startsWith('local:')` alcanza para saber si
 * un registro ya sincronizó o no, sin necesidad de consultar `syncStatus`.
 */
export function generateLocalId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `local:${uuid}`;
}

export function isLocalId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith('local:');
}
