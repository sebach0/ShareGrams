import type { EntityDefinition } from '../domain/manifest';
import { request, type HttpOutcome } from '../api/dynamicApiClient';
import { toDynamicEntity, type DynamicEntity } from './dynamicEntity';
import type { DynamicData, DynamicId } from './dynamicCommand';

export type RepositoryResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'client_error'; message: string }
  | { kind: 'server_error'; message: string }
  | { kind: 'network_error'; message: string };

function idPath(entity: EntityDefinition, id: DynamicId): string {
  return `${entity.endpoint}/${id}`;
}

function fromOutcome<T>(outcome: HttpOutcome, map: (body: unknown) => T): RepositoryResult<T> {
  switch (outcome.kind) {
    case 'ok':
      return { kind: 'ok', value: map(outcome.body) };
    case 'no_content':
      return { kind: 'ok', value: map(undefined) };
    case 'not_found':
      return { kind: 'not_found' };
    case 'conflict':
      return { kind: 'conflict', message: outcome.message };
    case 'client_error':
      return { kind: 'client_error', message: outcome.message };
    case 'server_error':
      return { kind: 'server_error', message: outcome.message };
    case 'network_error':
      return { kind: 'network_error', message: outcome.message };
  }
}

function toEntityList(entity: EntityDefinition, body: unknown): DynamicEntity[] {
  if (!Array.isArray(body)) return [];
  return body.map((item) => toDynamicEntity(entity.name, item));
}

/** Mensaje legible para cualquier RepositoryResult no exitoso -- para que la UI no repita este switch en cada pantalla. */
export function repositoryErrorMessage(result: Exclude<RepositoryResult<unknown>, { kind: 'ok' }>): string {
  switch (result.kind) {
    case 'not_found':
      return 'No se encontró el recurso.';
    case 'conflict':
    case 'client_error':
    case 'server_error':
    case 'network_error':
      return result.message;
  }
}

/**
 * CRUD genérico contra CUALQUIER entidad descubierta (regla 32-34): toda
 * URL sale de `entity.endpoint`/`entity.id`, nunca de un switch/if por
 * nombre de entidad. SEARCH/COUNT no existen como endpoints reales en el
 * backend generado (Fase 10 -- ver diagnóstico inicial de esta fase), así
 * que acá quedan resueltos como LIST + filtro/conteo en memoria: es un MVP
 * documentado (regla 40/41), no una solución escalable -- no usar con
 * datasets grandes.
 */
export class DynamicRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async list(entity: EntityDefinition): Promise<RepositoryResult<DynamicEntity[]>> {
    const outcome = await request(this.baseUrl, entity.endpoint, 'GET', undefined, this.fetchImpl);
    return fromOutcome(outcome, (body) => toEntityList(entity, body));
  }

  async get(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<DynamicEntity>> {
    const outcome = await request(this.baseUrl, idPath(entity, id), 'GET', undefined, this.fetchImpl);
    return fromOutcome(outcome, (body) => toDynamicEntity(entity.name, body));
  }

  async create(entity: EntityDefinition, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> {
    const outcome = await request(this.baseUrl, entity.endpoint, 'POST', data, this.fetchImpl);
    return fromOutcome(outcome, (body) => toDynamicEntity(entity.name, body));
  }

  /** PUT, no PATCH: es el método real que genera Fase 10 (regla 38) -- no se inventa semántica de actualización parcial. */
  async update(entity: EntityDefinition, id: DynamicId, data: DynamicData): Promise<RepositoryResult<DynamicEntity>> {
    const outcome = await request(this.baseUrl, idPath(entity, id), 'PUT', data, this.fetchImpl);
    return fromOutcome(outcome, (body) => toDynamicEntity(entity.name, body));
  }

  async delete(entity: EntityDefinition, id: DynamicId): Promise<RepositoryResult<void>> {
    const outcome = await request(this.baseUrl, idPath(entity, id), 'DELETE', undefined, this.fetchImpl);
    return fromOutcome(outcome, () => undefined);
  }

  /** MVP (regla 40): sin endpoint de búsqueda real -- filtra el LIST en memoria por igualdad exacta de cada filtro. */
  async search(entity: EntityDefinition, filters: DynamicData): Promise<RepositoryResult<DynamicEntity[]>> {
    const listResult = await this.list(entity);
    if (listResult.kind !== 'ok') return listResult;
    const filtered = listResult.value.filter((record) => Object.entries(filters).every(([key, expected]) => record.values[key] === expected));
    return { kind: 'ok', value: filtered };
  }

  /** MVP (regla 41): sin endpoint /count real -- LIST (o SEARCH si hay filtros) + longitud local. */
  async count(entity: EntityDefinition, filters?: DynamicData): Promise<RepositoryResult<number>> {
    const listResult = filters && Object.keys(filters).length > 0 ? await this.search(entity, filters) : await this.list(entity);
    if (listResult.kind !== 'ok') return listResult;
    return { kind: 'ok', value: listResult.value.length };
  }
}
