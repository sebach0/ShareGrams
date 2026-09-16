import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import type { Command, UMLModel } from '@sharegrams/uml-core';
import { useUmlStore } from '../store/useUmlStore';
import { createDiagramSocket } from './socket';
import { CollabContext, type CollabContextValue, type ConnectionStatus } from './collabContext';

interface JoinDiagramResponse {
  ok: boolean;
  model?: UMLModel;
  version?: number;
}

interface CommandAckResponse {
  ok: boolean;
}

interface CollabProviderProps {
  diagramId: string;
  token: string;
  /** Se invoca cuando el servidor rechaza un comando propio o uno remoto no aplica localmente: hay que resincronizar. */
  onOutOfSync: () => void;
  children: ReactNode;
}

/**
 * Dueño del socket de colaboración para UN diagrama. El resto de la UI nunca
 * habla con socket.io directamente: usa useCollabDispatch()/useCollabStatus()
 * (en ./collabContext), que son la única puerta de entrada/salida hacia el
 * servidor en tiempo real.
 */
export function CollabProvider({ diagramId, token, onOutOfSync, children }: CollabProviderProps) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = createDiagramSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_diagram', { diagramId }, (response: JoinDiagramResponse) => {
        if (response.ok && response.model) {
          useUmlStore.getState().loadModel(response.model);
          setStatus('connected');
        } else {
          setStatus('disconnected');
        }
      });
    });

    socket.on('disconnect', () => setStatus('connecting'));
    socket.on('connect_error', () => setStatus('disconnected'));

    socket.on('remote_command', (payload: { command: Command }) => {
      const applied = useUmlStore.getState().applyRemoteCommand(payload.command);
      if (!applied) onOutOfSync();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [diagramId, token, onOutOfSync]);

  const dispatch = useMemo<CollabContextValue['dispatch']>(
    () => (command) => {
      const ok = useUmlStore.getState().dispatch(command);
      if (ok) {
        socketRef.current?.emit('command', { diagramId, command }, (response: CommandAckResponse) => {
          if (!response.ok) onOutOfSync();
        });
      }
      return ok;
    },
    [diagramId, onOutOfSync],
  );

  const value = useMemo<CollabContextValue>(() => ({ status, dispatch }), [status, dispatch]);

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}
