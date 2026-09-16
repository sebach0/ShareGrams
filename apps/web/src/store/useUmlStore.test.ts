import { beforeEach, describe, expect, it } from 'vitest';
import { useUmlStore } from './useUmlStore';
import type { UMLModel } from '@sharegrams/uml-core';

function resetStore() {
  useUmlStore.setState({
    model: { classes: [], relationships: [] },
    lastError: null,
    selection: null,
  });
}

describe('useUmlStore', () => {
  beforeEach(resetStore);

  it('dispatch aplica un comando válido y actualiza el modelo', () => {
    const ok = useUmlStore.getState().dispatch({
      type: 'CREATE_CLASS',
      classId: 'c1',
      name: 'Cliente',
      position: { x: 0, y: 0 },
    });

    expect(ok).toBe(true);
    expect(useUmlStore.getState().model.classes).toHaveLength(1);
    expect(useUmlStore.getState().lastError).toBeNull();
  });

  it('dispatch rechaza un comando inválido y deja el modelo intacto', () => {
    const before = useUmlStore.getState().model;

    const ok = useUmlStore.getState().dispatch({ type: 'DELETE_CLASS', classId: 'no-existe' });

    expect(ok).toBe(false);
    expect(useUmlStore.getState().model).toBe(before);
    expect(useUmlStore.getState().lastError).not.toBeNull();
  });

  it('loadModel reemplaza el modelo y resetea selección y error', () => {
    useUmlStore.setState({
      selection: { kind: 'class', id: 'c1' },
      lastError: { code: 'X', message: 'algo falló' },
    });
    const nuevoModelo: UMLModel = { classes: [], relationships: [] };

    useUmlStore.getState().loadModel(nuevoModelo);

    expect(useUmlStore.getState().model).toBe(nuevoModelo);
    expect(useUmlStore.getState().selection).toBeNull();
    expect(useUmlStore.getState().lastError).toBeNull();
  });

  it('syncSavedModel reemplaza el modelo sin tocar la selección', () => {
    // Se usa para resincronizar tras un conflicto de colaboración (Fase 4) sin
    // que el usuario pierda de vista la clase/relación que tenía seleccionada.
    // También sirve de regresión para un bug real: Postgres (jsonb) no preserva
    // el orden de claves del JSON, así que comparar por JSON.stringify contra
    // el modelo en memoria nunca daría igual si no reemplazáramos `model` por
    // la copia exacta que confirma el servidor.
    const selection = { kind: 'class' as const, id: 'c1' };
    useUmlStore.setState({ selection });

    const modeloDelServidor: UMLModel = {
      relationships: [],
      classes: [{ id: 'c1', position: { x: 0, y: 0 }, attributes: [], name: 'Cliente' }],
    };

    useUmlStore.getState().syncSavedModel(modeloDelServidor);

    expect(useUmlStore.getState().model).toBe(modeloDelServidor);
    expect(useUmlStore.getState().selection).toBe(selection);
  });

  it('applyRemoteCommand aplica un comando de otro usuario sin marcarlo como propio', () => {
    const ok = useUmlStore.getState().applyRemoteCommand({
      type: 'CREATE_CLASS',
      classId: 'c1',
      name: 'Pedido',
      position: { x: 0, y: 0 },
    });

    expect(ok).toBe(true);
    expect(useUmlStore.getState().model.classes).toHaveLength(1);
  });

  it('applyRemoteCommand rechaza un comando inválido y deja el modelo intacto', () => {
    const before = useUmlStore.getState().model;

    const ok = useUmlStore.getState().applyRemoteCommand({ type: 'DELETE_CLASS', classId: 'no-existe' });

    expect(ok).toBe(false);
    expect(useUmlStore.getState().model).toBe(before);
    expect(useUmlStore.getState().lastError).not.toBeNull();
  });
});
