import { createContext, useContext } from 'react';
import type { Command } from '@sharegrams/uml-core';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface CollabContextValue {
  status: ConnectionStatus;
  dispatch: (command: Command) => boolean;
}

export const CollabContext = createContext<CollabContextValue | null>(null);

function useCollabContext(): CollabContextValue {
  const ctx = useContext(CollabContext);
  if (!ctx) {
    throw new Error('Este componente debe usarse dentro de <CollabProvider>.');
  }
  return ctx;
}

/** Dispatch colaborativo: aplica el comando localmente y, si es válido, lo envía al servidor. */
export function useCollabDispatch(): (command: Command) => boolean {
  return useCollabContext().dispatch;
}

export function useCollabStatus(): ConnectionStatus {
  return useCollabContext().status;
}
