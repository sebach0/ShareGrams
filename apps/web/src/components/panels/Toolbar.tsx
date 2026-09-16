import { generateId } from '@sharegrams/uml-core';
import { useUmlStore } from '../../store/useUmlStore';
import { useCollabDispatch, useIsReadOnly } from '../../realtime/collabContext';

function nextClassName(existingNames: string[]): string {
  const normalized = existingNames.map((n) => n.toLowerCase());
  let index = existingNames.length + 1;
  while (normalized.includes(`clase${index}`)) index += 1;
  return `Clase${index}`;
}

export function Toolbar() {
  const model = useUmlStore((s) => s.model);
  const selection = useUmlStore((s) => s.selection);
  const dispatch = useCollabDispatch();
  const select = useUmlStore((s) => s.select);
  const readOnly = useIsReadOnly();

  const handleAddClass = () => {
    const name = nextClassName(model.classes.map((c) => c.name));
    dispatch({
      type: 'CREATE_CLASS',
      classId: generateId(),
      name,
      position: { x: 80 + model.classes.length * 40, y: 80 + model.classes.length * 40 },
    });
  };

  const handleDeleteSelection = () => {
    if (!selection) return;
    if (selection.kind === 'class') {
      dispatch({ type: 'DELETE_CLASS', classId: selection.id });
    } else {
      dispatch({ type: 'DELETE_RELATIONSHIP', relationshipId: selection.id });
    }
    select(null);
  };

  return (
    <header className="toolbar">
      <span className="toolbar__brand">ShareGrams</span>
      <button type="button" onClick={handleAddClass} disabled={readOnly}>
        + Clase
      </button>
      <button type="button" onClick={handleDeleteSelection} disabled={readOnly || !selection}>
        Eliminar seleccionado
      </button>
      {readOnly && <span className="toolbar__readonly">Solo lectura</span>}
    </header>
  );
}
