import { createContext, useContext } from 'react';
import type { Command } from '@sharegrams/uml-core';
import type { AccessLevel } from '../api/types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type AssistantInstructionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export interface DispatchBatchResult {
  /** Cuántos comandos del batch se confirmaron contra el servidor antes de parar (por rol de solo lectura o porque el servidor rechazó alguno). */
  appliedCount: number;
  total: number;
  /** Presente si el batch se cortó antes de terminar. */
  error?: string;
}

export interface CollabContextValue {
  status: ConnectionStatus;
  /** null mientras no se confirmó la unión al diagrama (todavía no se sabe el rol). */
  role: AccessLevel | null;
  dispatch: (command: Command) => boolean;
  /**
   * Aplica varios comandos EN ORDEN, esperando la confirmación del servidor
   * de cada uno antes de mandar el siguiente. Necesario para lotes donde un
   * comando depende del anterior (un ADD_ATTRIBUTE necesita que su
   * CREATE_CLASS ya esté confirmado) -- ver ImageImportDialog/XmiImportDialog,
   * donde antes se mandaban todos con dispatch() en un for suelto y una
   * carrera entre requests podía hacer que el server rechazara un comando
   * por llegar antes que el del que dependía.
   */
  dispatchBatch: (commands: Command[]) => Promise<DispatchBatchResult>;
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

/** Para lotes de comandos que dependen entre sí (imports): ver DispatchBatchResult. */
export function useCollabDispatchBatch(): (commands: Command[]) => Promise<DispatchBatchResult> {
  return useCollabContext().dispatchBatch;
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
