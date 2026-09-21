import type { DomainManifest } from '../domain/manifest';

export type ManifestLoadResult = { ok: true; manifest: DomainManifest } | { ok: false; error: string };

export const SUPPORTED_MANIFEST_VERSION = '1.0';

/**
 * Única pieza responsable de pedir metadata al backend (regla 27): nada de
 * fetch disperso en pantallas. `GET {baseUrl}/api/meta`, con timeout, y
 * validación de que lo que volvió realmente es un Domain Manifest
 * entendible antes de devolverlo -- nunca deja pasar un contrato
 * incompatible en silencio (regla 30).
 */
export async function loadManifest(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<ManifestLoadResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/meta`, { signal: AbortSignal.timeout(8000) });
  } catch {
    return { ok: false, error: 'No se pudo conectar al backend. Verificá la URL y que esté corriendo.' };
  }

  if (response.status === 404) {
    return { ok: false, error: 'El backend no expone /api/meta (¿la URL apunta a un backend generado por ShareGrams?).' };
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

  return validateManifestShape(json);
}

function validateManifestShape(json: unknown): ManifestLoadResult {
  if (!json || typeof json !== 'object') {
    return { ok: false, error: 'Metadata inválida recibida del backend.' };
  }
  const candidate = json as Partial<DomainManifest>;

  if (typeof candidate.version !== 'string') {
    return { ok: false, error: 'Metadata inválida recibida del backend: falta la versión.' };
  }
  if (candidate.version !== SUPPORTED_MANIFEST_VERSION) {
    return {
      ok: false,
      error: `Versión de manifest no soportada ("${candidate.version}"). Esta app entiende la versión ${SUPPORTED_MANIFEST_VERSION}.`,
    };
  }
  if (!candidate.application || typeof candidate.application.name !== 'string') {
    return { ok: false, error: 'Metadata inválida recibida del backend: falta el nombre de la aplicación.' };
  }
  if (!Array.isArray(candidate.entities)) {
    return { ok: false, error: 'Metadata inválida recibida del backend: falta la lista de entidades.' };
  }
  if (candidate.entities.length === 0) {
    return { ok: false, error: 'El backend no expone ninguna entidad.' };
  }
  for (const entity of candidate.entities) {
    if (!entity || typeof entity.name !== 'string' || !Array.isArray(entity.fields) || !Array.isArray(entity.operations)) {
      return { ok: false, error: 'Metadata inválida recibida del backend: una entidad no tiene la forma esperada.' };
    }
  }

  return { ok: true, manifest: candidate as DomainManifest };
}
