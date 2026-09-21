import type { DomainManifest } from '../domain/manifest';
import type { CommandResult } from './commandResult';
import type { DynamicCommand } from './dynamicCommand';
import type { DynamicRepository, RepositoryResult } from './dynamicRepository';

/**
 * Traduce un DynamicCommand YA VALIDADO a un CommandResult uniforme,
 * seleccionando la operación correspondiente del DynamicRepository (regla
 * 42). NO repite la validación semántica de CommandValidator (regla 43) --
 * confía en que quien lo llama corrió el Validator antes (ver
 * runDynamicCommand.ts, el único punto que encadena los dos).
 */
export async function executeCommand(command: DynamicCommand, manifest: DomainManifest, repository: DynamicRepository): Promise<CommandResult> {
  const entity = manifest.entities.find((e) => e.name === command.entity);
  if (!entity) {
    // Defensa mínima (regla 43), no una revalidación completa: si esto se
    // dispara es porque alguien construyó un DynamicCommand a mano sin
    // pasar por el Validator, no un caso esperado en el flujo normal.
    return { status: 'VALIDATION_ERROR', message: `"${command.entity}" no existe en este backend.` };
  }

  switch (command.action) {
    case 'LIST':
      return fromRepositoryResult(await repository.list(entity));
    case 'GET':
      return fromRepositoryResult(await repository.get(entity, command.id));
    case 'CREATE':
      return fromRepositoryResult(await repository.create(entity, command.data));
    case 'UPDATE':
      return fromRepositoryResult(await repository.update(entity, command.id, command.data));
    case 'DELETE':
      return fromRepositoryResult(await repository.delete(entity, command.id), 'Eliminado.');
    case 'SEARCH':
      return fromRepositoryResult(await repository.search(entity, command.filters));
    case 'COUNT':
      return fromRepositoryResult(await repository.count(entity, command.filters));
  }
}

function fromRepositoryResult<T>(result: RepositoryResult<T>, successMessage?: string): CommandResult {
  switch (result.kind) {
    case 'ok':
      return { status: 'SUCCESS', data: result.value, message: successMessage };
    case 'not_found':
      return { status: 'NOT_FOUND', message: 'No se encontró el recurso.' };
    case 'conflict':
      return { status: 'CONFLICT', message: result.message };
    case 'client_error':
      return { status: 'VALIDATION_ERROR', message: result.message };
    case 'server_error':
      return { status: 'SERVER_ERROR', message: result.message };
    case 'network_error':
      return { status: 'NETWORK_ERROR', message: result.message };
  }
}
