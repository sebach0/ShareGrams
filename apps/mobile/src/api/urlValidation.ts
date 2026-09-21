export type UrlValidationResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validación razonable de la URL del backend (regla 26): formato,
 * esquema http/https, no vacía. Nada más elaborado -- no hace falta.
 */
export function validateBackendUrl(input: string): UrlValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'La URL no puede estar vacía.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'La URL no tiene un formato válido (ej. http://192.168.1.30:8080).' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'La URL debe usar http:// o https://.' };
  }

  // Sin barra final, para poder concatenar rutas de forma determinista ("${url}/api/meta").
  const normalized = trimmed.replace(/\/+$/, '');
  return { ok: true, url: normalized };
}
