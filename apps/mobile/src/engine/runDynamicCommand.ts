import type { DomainManifest } from '../domain/manifest';
import { validateCommand } from './commandValidator';
import { executeCommand } from './commandExecutor';
import type { CommandResult } from './commandResult';
import type { DynamicDataSource } from '../offline/dynamicDataSource';

/**
 * Único punto de entrada al motor (regla 51/52): Validator SIEMPRE antes
 * que Executor, sin excepción. Tanto la UI dinámica como Claude (Fase 15)
 * y la voz (Fase 16) llaman a ESTA función -- nunca saltarse el
 * Validator, nunca llamar a DynamicApiClient/SQLite directo. `repository`
 * acepta cualquier `DynamicDataSource` (Fase 17): el `DynamicRepository`
 * de siempre (HTTP) o el nuevo `OfflineFirstDataSource` (local-first) --
 * este archivo nunca se entera de cuál es.
 */
export async function runDynamicCommand(raw: unknown, manifest: DomainManifest, repository: DynamicDataSource): Promise<CommandResult> {
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
