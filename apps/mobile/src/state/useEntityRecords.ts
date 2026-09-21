import { useCallback, useEffect, useState } from 'react';
import { listRecords, type EntityRecord } from '../api/recordsClient';
import type { EntityDefinition } from '../domain/manifest';

export type RecordsState =
  | { status: 'loading' }
  | { status: 'loaded'; records: EntityRecord[] }
  | { status: 'error'; message: string };

export interface UseEntityRecords {
  state: RecordsState;
  reload: () => void;
}

/**
 * Carga la lista de UNA entidad descubierta. `entity` cambia cuando el
 * usuario navega a otra entidad del mismo manifest -- el efecto vuelve a
 * correr solo, sin lógica de "reset" manual (mismo patrón que
 * EditorPage.tsx en apps/web: una bandera local `cancelled` en vez de
 * cancelar la request en sí, para que una respuesta vieja nunca pise el
 * estado de una carga más nueva).
 */
export function useEntityRecords(baseUrl: string, entity: EntityDefinition): UseEntityRecords {
  const [state, setState] = useState<RecordsState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    listRecords(baseUrl, entity).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: 'loaded', records: result.records } : { status: 'error', message: result.error });
    });

    return () => {
      cancelled = true;
    };
  }, [baseUrl, entity, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return { state, reload };
}
