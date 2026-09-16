import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import type { Command, UMLModel } from '@sharegrams/uml-core';
import type { AccessLevel } from '../api/types';
import { useUmlStore } from '../store/useUmlStore';
import { createDiagramSocket } from './socket';
import { CollabContext, type CollabContextValue, type ConnectionStatus } from './collabContext';

interface JoinDiagramResponse {
  ok: boolean;
  model?: UMLModel;
  version?: number;
  role?: AccessLevel;
}

interface CommandAckResponse {
  ok: boolean;
}

interface RoleChangedPayload {
  role: AccessLevel;
}

interface AccessRevokedPayload {
  reason: 'removed';
}

interface CollabProviderProps {
  diagramId: string;
  token: string;
  /** Se invoca cuando el servidor rechaza un comando propio o uno remoto no aplica localmente: hay que resincronizar. */
  onOutOfSync: () => void;
  /** El dueño te sacó del proyecto mientras estabas conectado: ya no tiene sentido seguir en esta pantalla. */
  onAccessRevoked: () => void;
  children: ReactNode;
}

/**
 * Dueño del socket de colaboración para UN diagrama. El resto de la UI nunca
 * habla con socket.io directamente: usa useCollabDispatch()/useCollabStatus()/
 * useCollabRole() (en ./collabContext), que son la única puerta de entrada/
 * salida hacia el servidor en tiempo real.
 */
export function CollabProvider({ diagramId, token, onOutOfSync, onAccessRevoked, children }: CollabProviderProps) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [role, setRole] = useState<AccessLevel | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Evita que el 'disconnect' que sigue a una expulsión se muestre como "Conectando...":
  // ya sabemos por qué se cortó, y onAccessRevoked() va a sacar a este componente de pantalla.
  const revokedRef = useRef(false);

  useEffect(() => {
    const socket = createDiagramSocket(token);
    socketRef.current = socket;
    revokedRef.current = false;

    socket.on('connect', () => {
      socket.emit('join_diagram', { diagramId }, (response: JoinDiagramResponse) => {
        if (response.ok && response.model) {
          useUmlStore.getState().loadModel(response.model);
          setRole(response.role ?? null);
          setStatus('connected');
        } else {
          setStatus('disconnected');
        }
      });
    });

    socket.on('disconnect', () => {
      if (!revokedRef.current) setStatus('connecting');
    });
    socket.on('connect_error', () => setStatus('disconnected'));

    socket.on('remote_command', (payload: { command: Command }) => {
      const applied = useUmlStore.getState().applyRemoteCommand(payload.command);
      if (!applied) onOutOfSync();
    });

    socket.on('role_changed', (payload: RoleChangedPayload) => setRole(payload.role));

    socket.on('access_revoked', (_payload: AccessRevokedPayload) => {
      revokedRef.current = true;
      onAccessRevoked();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [diagramId, token, onOutOfSync, onAccessRevoked]);

  const dispatch = useMemo<CollabContextValue['dispatch']>(
    () => (command) => {
      if (role === 'VIEWER') return false; // el servidor lo rechazaría igual; esto evita el viaje de ida y vuelta
      const ok = useUmlStore.getState().dispatch(command);
      if (ok) {
        socketRef.current?.emit('command', { diagramId, command }, (response: CommandAckResponse) => {
          if (!response.ok) onOutOfSync();
        });
      }
      return ok;
    },
    [diagramId, role, onOutOfSync],
  );

  const value = useMemo<CollabContextValue>(() => ({ status, role, dispatch }), [status, role, dispatch]);

  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}
