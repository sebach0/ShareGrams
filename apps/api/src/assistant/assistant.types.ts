import type { Command, UMLModel } from '@sharegrams/uml-core';

/**
 * Lo que el intérprete necesita saber del diagrama para resolver una
 * instrucción: el LLM solo conoce nombres (nunca ids), así que sin el
 * modelo actual no hay forma de mapear "Cliente" a un classId real.
 */
export interface AssistantContext {
  model: UMLModel;
}

export type AssistantInterpretation =
  /** Uno o más comandos ya resueltos contra ids reales, listos para pasar por el mismo applyCommandToDiagram que usa un comando manual. */
  | { ok: true; commands: Command[]; message: string }
  /** Falta información para ejecutar la instrucción (coordenadas no dadas, dos relaciones entre las mismas clases, etc.): no se adivina, se pide precisión. */
  | { ok: false; reason: 'clarification_needed'; message: string }
  /** La instrucción referencia una clase/atributo/relación que no existe en el modelo actual. */
  | { ok: false; reason: 'not_found'; message: string }
  /** La instrucción no se puede traducir a los comandos del catálogo (p. ej. "generá todo el sistema de ventas"). */
  | { ok: false; reason: 'unsupported'; message: string }
  /** Falta ANTHROPIC_API_KEY en el entorno: el resto de la API sigue funcionando, esta feature puntual no. */
  | { ok: false; reason: 'not_configured'; message: string }
  /** Falla de infraestructura (red, respuesta del LLM sin ninguna tool_use, etc.), no un rechazo semántico de la instrucción. */
  | { ok: false; reason: 'error'; message: string };

export interface AssistantInterpreter {
  interpret(instruction: string, context: AssistantContext): Promise<AssistantInterpretation>;
}
