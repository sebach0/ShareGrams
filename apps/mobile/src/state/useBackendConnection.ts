import { useCallback, useReducer } from 'react';
import { loadManifest } from '../api/manifestClient';
import { validateBackendUrl } from '../api/urlValidation';
import { connectionReducer, initialConnectionState, type ConnectionState } from './connectionReducer';

export interface UseBackendConnection {
  state: ConnectionState;
  connect: (rawUrl: string) => Promise<void>;
  disconnect: () => void;
}

/**
 * Único lugar que orquesta "validar URL -> pedir manifest -> guardar
 * resultado" para la UI (regla 32: backend switching sin recompilar --
 * desconectar y conectar a otra URL simplemente vuelve a correr este mismo
 * flujo, no hay nada hardcodeado por dominio).
 */
export function useBackendConnection(): UseBackendConnection {
  const [state, dispatch] = useReducer(connectionReducer, initialConnectionState);

  const connect = useCallback(async (rawUrl: string) => {
    const validated = validateBackendUrl(rawUrl);
    if (!validated.ok) {
      dispatch({ type: 'CONNECT_FAILURE', url: rawUrl, message: validated.error });
      return;
    }

    dispatch({ type: 'CONNECT_START', url: validated.url });
    const result = await loadManifest(validated.url);
    if (result.ok) {
      dispatch({ type: 'CONNECT_SUCCESS', manifest: result.manifest });
    } else {
      dispatch({ type: 'CONNECT_FAILURE', url: validated.url, message: result.error });
    }
  }, []);

  const disconnect = useCallback(() => dispatch({ type: 'DISCONNECT' }), []);

  return { state, connect, disconnect };
}
