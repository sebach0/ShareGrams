import type { DomainManifest } from '../domain/manifest';

/**
 * Un solo estado (no dos ejes paralelos "ConnectionStatus"/"ManifestStatus"
 * como sugiere la referencia conceptual, regla 33): en esta app "conectado"
 * y "con manifest cargado" son la misma cosa -- no existe un estado útil de
 * "conectado pero sin manifest todavía" distinto de "conectando". Une
 * ambos ejes en una sola unión discriminada para que no se puedan
 * representar combinaciones inválidas (ej. "desconectado" con un manifest
 * cargado).
 */
export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting'; url: string }
  | { status: 'connected'; url: string; manifest: DomainManifest }
  | { status: 'error'; url: string; message: string };

export type ConnectionAction =
  | { type: 'CONNECT_START'; url: string }
  | { type: 'CONNECT_SUCCESS'; manifest: DomainManifest }
  | { type: 'CONNECT_FAILURE'; url: string; message: string }
  | { type: 'DISCONNECT' };

export const initialConnectionState: ConnectionState = { status: 'disconnected' };

export function connectionReducer(state: ConnectionState, action: ConnectionAction): ConnectionState {
  switch (action.type) {
    case 'CONNECT_START':
      return { status: 'connecting', url: action.url };
    case 'CONNECT_SUCCESS':
      // Ignora una respuesta que ya no corresponde al intento de conexión en curso (ej. el usuario ya desconectó mientras la request seguía en vuelo).
      if (state.status !== 'connecting') return state;
      return { status: 'connected', url: state.url, manifest: action.manifest };
    case 'CONNECT_FAILURE':
      return { status: 'error', url: action.url, message: action.message };
    case 'DISCONNECT':
      return { status: 'disconnected' };
    default:
      return state;
  }
}
