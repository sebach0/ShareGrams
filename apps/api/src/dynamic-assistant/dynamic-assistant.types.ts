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
