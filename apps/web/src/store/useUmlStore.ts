import { create } from 'zustand';
import { applyCommand, createEmptyModel } from '@sharegrams/uml-core';
import type { Command, CommandError, UMLModel } from '@sharegrams/uml-core';

export type Selection = { kind: 'class'; id: string } | { kind: 'relationship'; id: string } | null;

interface UmlStoreState {
  model: UMLModel;
  lastError: CommandError | null;
  selection: Selection;
  /** Único punto por el que la UI puede disparar un comando propio. Devuelve false si fue rechazado. */
  dispatch: (command: Command) => boolean;
  /**
   * Aplica un comando que ya fue validado y persistido por el servidor (originado por
   * otro usuario en la sesión colaborativa). Nunca se reenvía: a diferencia de `dispatch`,
   * esto es la mitad "recibir", no "originar".
   */
  applyRemoteCommand: (command: Command) => boolean;
  select: (selection: Selection) => void;
  /** Reemplaza el modelo completo (carga inicial desde el backend), reseteando la sesión de edición. */
  loadModel: (model: UMLModel) => void;
  /**
   * Resincroniza el modelo con la copia canónica del servidor sin tocar la selección
   * actual. Se usa tanto después de guardar como al recuperarse de un conflicto de
   * colaboración, dos casos donde el usuario sigue "parado" en la misma clase/relación.
   */
  syncSavedModel: (model: UMLModel) => void;
}

export const useUmlStore = create<UmlStoreState>((set, get) => {
  function applyToModel(command: Command): boolean {
    const result = applyCommand(get().model, command);
    if (!result.ok) {
      set({ lastError: result.error });
      return false;
    }
    set({ model: result.model, lastError: null });
    return true;
  }

  return {
    model: createEmptyModel(),
    lastError: null,
    selection: null,
    dispatch: applyToModel,
    applyRemoteCommand: applyToModel,
    select: (selection) => set({ selection }),
    loadModel: (model) => set({ model, selection: null, lastError: null }),
    syncSavedModel: (model) => set({ model }),
  };
});
