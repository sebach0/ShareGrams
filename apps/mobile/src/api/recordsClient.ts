import type { EntityDefinition } from '../domain/manifest';

/** Un registro tal como lo devuelve/espera el backend generado: JSON plano, sin tipar por dominio. */
export type EntityRecord = Record<string, unknown>;

export type ListRecordsResult = { ok: true; records: EntityRecord[] } | { ok: false; error: string };
export type CreateRecordResult = { ok: true; record: EntityRecord } | { ok: false; error: string };

/**
 * CRUD genérico contra CUALQUIER entidad descubierta (regla 2/45, mismo
 * espíritu que manifestClient.ts): arma la URL a partir de `entity.endpoint`
 * y listo -- nunca hay un nombre de entidad hardcodeado acá. Fase 13 (MVP):
 * solo listar y crear, ver EntityRecordsScreen/EntityCreateScreen.
 */
export async function listRecords(baseUrl: string, entity: EntityDefinition, fetchImpl: typeof fetch = fetch): Promise<ListRecordsResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${entity.endpoint}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    return { ok: false, error: 'No se pudo conectar al backend.' };
  }

  if (!response.ok) {
    return { ok: false, error: `El backend respondió con un error (HTTP ${response.status}).` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: 'La respuesta del backend no es JSON válido.' };
  }

  if (!Array.isArray(json)) {
    return { ok: false, error: 'Se esperaba una lista de registros.' };
  }

  return { ok: true, records: json as EntityRecord[] };
}

export async function createRecord(
  baseUrl: string,
  entity: EntityDefinition,
  values: EntityRecord,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateRecordResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${entity.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, error: 'No se pudo conectar al backend.' };
  }

  if (!response.ok) {
    return { ok: false, error: await extractErrorMessage(response) };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: 'La respuesta del backend no es JSON válido.' };
  }

  return { ok: true, record: json as EntityRecord };
}

/**
 * El GlobalExceptionHandler generado (Fase 10) devuelve {status, message,
 * timestamp} y, en errores de validación, además {fields: {campo: mensaje}}
 * -- ver exception.template.ts. Si el body no tiene esa forma (error que no
 * pasó por ese handler), cae al mensaje genérico por HTTP status.
 */
async function extractErrorMessage(response: Response): Promise<string> {
  const generic = `El backend rechazó la operación (HTTP ${response.status}).`;
  try {
    const body = (await response.json()) as { message?: unknown; fields?: Record<string, string> };
    if (body.fields && typeof body.fields === 'object') {
      const details = Object.entries(body.fields)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(', ');
      if (details) return details;
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
    return generic;
  } catch {
    return generic;
  }
}
