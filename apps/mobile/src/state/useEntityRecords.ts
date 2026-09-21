import { useCallback, useEffect, useState } from 'react';
import { DynamicRepository, repositoryErrorMessage } from '../engine/dynamicRepository';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { EntityDefinition } from '../domain/manifest';

export type RecordsState =
  | { status: 'loading' }
  | { status: 'loaded'; records: DynamicEntity[] }
  | { status: 'error'; message: string };

export interface UseEntityRecords {
  state: RecordsState;
  reload: () => void;
}

/**
 * Carga la lista de UNA entidad descubierta a través del motor de Fase 13
 * (DynamicRepository), no de un fetch propio -- misma regla 31 ("no HTTP en
 * widgets") aplicada también a los hooks. `entity` cambia cuando el usuario
 * navega a otra entidad del mismo manifest -- el efecto vuelve a correr
 * solo (mismo patrón `cancelled` que EditorPage.tsx en apps/web, para que
 * una respuesta vieja nunca pise el estado de una carga más nueva).
 */
export function useEntityRecords(baseUrl: string, entity: EntityDefinition): UseEntityRecords {
  const [state, setState] = useState<RecordsState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const repository = new DynamicRepository(baseUrl);
    repository.list(entity).then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') {
        setState({ status: 'loaded', records: result.value });
      } else {
        setState({ status: 'error', message: repositoryErrorMessage(result) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [baseUrl, entity, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return { state, reload };
}
