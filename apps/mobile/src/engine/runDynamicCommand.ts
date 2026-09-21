import type { DomainManifest } from '../domain/manifest';
import { validateCommand } from './commandValidator';
import { executeCommand } from './commandExecutor';
import type { CommandResult } from './commandResult';
import type { DynamicRepository } from './dynamicRepository';

/**
 * Único punto de entrada al motor (regla 51/52): Validator SIEMPRE antes
 * que Executor, sin excepción. Tanto la pantalla de pruebas de esta fase
 * como Claude en una fase futura deben llamar a ESTA función -- nunca
 * saltarse el Validator, nunca llamar a DynamicApiClient directo.
 */
export async function runDynamicCommand(raw: unknown, manifest: DomainManifest, repository: DynamicRepository): Promise<CommandResult> {
  const validation = validateCommand(raw, manifest);
  if (!validation.valid) {
    return {
      status: 'VALIDATION_ERROR',
      message: 'El comando no pasó la validación.',
      diagnostics: validation.diagnostics,
    };
  }
  return executeCommand(validation.command, manifest, repository);
}
