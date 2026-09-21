export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type HttpOutcome =
  | { kind: 'ok'; status: number; body: unknown }
  | { kind: 'no_content' }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'client_error'; status: number; message: string }
  | { kind: 'server_error'; status: number; message: string }
  | { kind: 'network_error'; message: string };

/**
 * Capa más baja del motor (regla 30): SOLO sabe hacer HTTP + JSON, y leer
 * el shape de error que ya genera Fase 10 (`{status, message, fields}`, ver
 * exception.template.ts). Nunca conoce el nombre de una entidad -- recibe
 * una URL ya armada por DynamicRepository a partir del Manifest. Clasifica
 * la respuesta por status HTTP UNA sola vez acá, para que ni Repository ni
 * Executor tengan que volver a interpretar códigos de estado.
 */
export async function request(
  baseUrl: string,
  path: string,
  method: HttpMethod,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<HttpOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { kind: 'network_error', message: err instanceof Error ? err.message : 'No se pudo conectar al backend.' };
  }

  if (response.status === 204) return { kind: 'no_content' };
  if (response.status === 404) return { kind: 'not_found' };

  if (response.status === 409) {
    return { kind: 'conflict', message: await readErrorMessage(response) };
  }
  if (response.status >= 500) {
    return { kind: 'server_error', status: response.status, message: await readErrorMessage(response) };
  }
  if (response.status >= 400) {
    return { kind: 'client_error', status: response.status, message: await readErrorMessage(response) };
  }

  try {
    return { kind: 'ok', status: response.status, body: await response.json() };
  } catch {
    return { kind: 'client_error', status: response.status, message: 'La respuesta del backend no es JSON válido.' };
  }
}

/** Ver GlobalExceptionHandler (Fase 10): {status, message, timestamp} y, en validación, además {fields: {campo: mensaje}}. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; fields?: Record<string, string> };
    if (body.fields && typeof body.fields === 'object') {
      const details = Object.entries(body.fields)
        .map(([field, msg]) => `${field}: ${msg}`)
        .join(', ');
      if (details) return details;
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    /* sin body JSON entendible -- cae al mensaje genérico */
  }
  return `El backend respondió con un error (HTTP ${response.status}).`;
}
