import { createContext, useContext } from 'react';
import type { Command } from '@sharegrams/uml-core';
import type { AccessLevel } from '../api/types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type AssistantInstructionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export interface CollabContextValue {
  status: ConnectionStatus;
  /** null mientras no se confirmó la unión al diagrama (todavía no se sabe el rol). */
  role: AccessLevel | null;
  dispatch: (command: Command) => boolean;
  /** Manda una instrucción en lenguaje natural al asistente de IA (Fase 5). Aplica los comandos resultantes localmente si tiene éxito. */
  sendAssistantInstruction: (instruction: string) => Promise<AssistantInstructionResult>;
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

export function useCollabRole(): AccessLevel | null {
  return useCollabContext().role;
}

/** true si el usuario es VIEWER: la UI debe deshabilitar los controles de edición. */
export function useIsReadOnly(): boolean {
  return useCollabContext().role === 'VIEWER';
}

export function useAssistantInstruction(): (instruction: string) => Promise<AssistantInstructionResult> {
  return useCollabContext().sendAssistantInstruction;
}
