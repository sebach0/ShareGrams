import type { DomainManifest } from '../domain/manifest';
import type { KnownRecords } from './knownRecords';

export type AICommandResult =
  | { status: 'COMMAND'; command: Record<string, unknown>; message: string }
  | { status: 'CLARIFICATION_REQUIRED'; message: string }
  | { status: 'INVALID_REQUEST'; message: string }
  | { status: 'AI_ERROR'; message: string }
  | { status: 'NOT_CONFIGURED'; message: string };

/**
 * Dónde vive la API propia de ShareGrams (NO el backend generado al que
 * está conectada la app -- esa es otra URL, la de la pantalla de conexión).
 * Configurable en build-time vía EXPO_PUBLIC_SHAREGRAMS_API_URL (mismo
 * mecanismo que VITE_API_URL en apps/web); si corrés esto en el emulador
 * apuntando a tu ShareGrams local, usá http://10.0.2.2:3000.
 */
const SHAREGRAMS_API_URL = process.env.EXPO_PUBLIC_SHAREGRAMS_API_URL ?? 'http://localhost:3000';

/**
 * AICommandInterpreter (Fase 15, regla 5): la app móvil NUNCA habla con
 * Claude directamente -- no hay (ni debe haber) una API key de Anthropic en
 * el dispositivo, mismo criterio de seguridad que Fases 5-7 en apps/web.
 * Esto le pega a la propia API de ShareGrams (que sí tiene la key
 * server-side) mandándole el texto + el Domain Manifest del backend
 * conectado como contexto.
 *
 * Lo que vuelve, si status es "COMMAND", es un candidato de DynamicCommand
 * SIN VALIDAR (regla 18): quien llama a esto tiene que pasarlo igual por
 * runDynamicCommand (CommandValidator -> CommandExecutor), exactamente
 * como si el usuario lo hubiera tipeado a mano en la consola de comandos.
 * Esta función nunca ejecuta nada por sí misma.
 */
export async function interpretInstruction(
  instruction: string,
  manifest: DomainManifest,
  fetchImpl: typeof fetch = fetch,
  knownRecords?: KnownRecords,
): Promise<AICommandResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${SHAREGRAMS_API_URL}/dynamic-assistant/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(knownRecords ? { instruction, manifest, knownRecords } : { instruction, manifest }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { status: 'AI_ERROR', message: 'No se pudo conectar con el asistente de IA. Verificá tu conexión.' };
  }

  if (!response.ok) {
    return { status: 'AI_ERROR', message: `El asistente respondió con un error (HTTP ${response.status}).` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { status: 'AI_ERROR', message: 'La respuesta del asistente no es JSON válido.' };
  }

  return validateResultShape(json);
}

const KNOWN_STATUSES = new Set(['CLARIFICATION_REQUIRED', 'INVALID_REQUEST', 'AI_ERROR', 'NOT_CONFIGURED']);

function validateResultShape(json: unknown): AICommandResult {
  if (!json || typeof json !== 'object' || !('status' in json)) {
    return { status: 'AI_ERROR', message: 'Respuesta del asistente con formato inesperado.' };
  }
  const candidate = json as { status?: unknown; command?: unknown; message?: unknown };

  if (candidate.status === 'COMMAND') {
    if (candidate.command && typeof candidate.command === 'object') {
      return { status: 'COMMAND', command: candidate.command as Record<string, unknown>, message: String(candidate.message ?? '') };
    }
    return { status: 'AI_ERROR', message: 'Respuesta del asistente con formato inesperado.' };
  }

  if (typeof candidate.status === 'string' && KNOWN_STATUSES.has(candidate.status)) {
    return { status: candidate.status as Exclude<AICommandResult['status'], 'COMMAND'>, message: String(candidate.message ?? '') };
  }

  return { status: 'AI_ERROR', message: 'Respuesta del asistente con formato inesperado.' };
}
