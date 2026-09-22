/**
 * Resultado de interpretar UNA instrucción en lenguaje natural contra el
 * Domain Manifest de un backend generado (regla 19 de Fase 15). Mismo
 * espíritu que AssistantInterpretation (Fase 5): unión discriminada, nunca
 * una excepción para un rechazo semántico normal.
 *
 * "command" es un candidato de DynamicCommand *sin validar* -- a propósito
 * (regla 18): quien recibe esto (la app móvil) lo pasa por SU PROPIO
 * CommandValidator antes de ejecutar nada, exactamente igual que si el
 * usuario lo hubiera escrito a mano en la consola de comandos. Este
 * servicio nunca decide si el comando es válido, solo lo propone.
 */
export type DynamicAICommandResult =
  | { status: 'COMMAND'; command: Record<string, unknown>; message: string }
  | { status: 'CLARIFICATION_REQUIRED'; message: string }
  | { status: 'INVALID_REQUEST'; message: string }
  | { status: 'AI_ERROR'; message: string }
  | { status: 'NOT_CONFIGURED'; message: string };

/**
 * Registros YA existentes de una entidad (id + su displayField), que la
 * app móvil arma consultando el backend generado ANTES de llamar al
 * intérprete -- este servicio nunca los consulta por su cuenta (no tiene
 * forma de llegar a la URL del backend generado, que puede ser una
 * dirección solo válida desde el emulador/dispositivo, ej. 10.0.2.2).
 * Sin esto, Claude no puede resolver un nombre ("la universidad UMSA") a
 * un id real dentro de una sola llamada a herramienta -- este intérprete
 * no encadena LIST->CREATE, todo pasa en un único tool_use por
 * instrucción. Opcional: si no viene, el comportamiento es el mismo de
 * antes (siempre pide el id explícito ante una referencia por nombre).
 */
export type KnownRecords = Record<string, Array<{ id: unknown; label: string }>>;
