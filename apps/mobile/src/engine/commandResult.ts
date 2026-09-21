/** Resultado uniforme de ejecutar (o intentar ejecutar) un DynamicCommand (regla 44). */
export type CommandStatus =
  | 'SUCCESS'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'CONFLICT'
  | 'UNSUPPORTED';

export interface CommandDiagnostic {
  code: string;
  field?: string;
  message: string;
}

/**
 * `data` es `unknown` a propósito: según la acción puede ser un
 * DynamicEntity, un DynamicEntity[], un número (COUNT) o nada (DELETE).
 * Quien consume el resultado ya sabe qué acción pidió y puede castear con
 * confianza (regla 45/46).
 */
export interface CommandResult {
  status: CommandStatus;
  data?: unknown;
  message?: string;
  diagnostics?: CommandDiagnostic[];
}
