import { useUmlStore } from '../../store/useUmlStore';
import { ClassInspector } from './ClassInspector';
import { RelationshipInspector } from './RelationshipInspector';

export function Inspector() {
  const selection = useUmlStore((s) => s.selection);

  if (!selection) {
    return <div className="inspector inspector--empty">Seleccioná una clase o relación.</div>;
  }
  if (selection.kind === 'class') {
    return <ClassInspector key={selection.id} classId={selection.id} />;
  }
  return <RelationshipInspector key={selection.id} relationshipId={selection.id} />;
}
