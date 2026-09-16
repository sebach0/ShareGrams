import { useState } from 'react';
import type { Multiplicity } from '@sharegrams/uml-core';
import { useUmlStore } from '../../store/useUmlStore';
import { useCollabDispatch } from '../../realtime/collabContext';

interface RelationshipInspectorProps {
  relationshipId: string;
}

function parseMultiplicity(input: string): Multiplicity | null {
  const trimmed = input.trim();
  if (trimmed === '*') return { lower: 0, upper: '*' };
  if (/^\d+$/.test(trimmed)) return { lower: Number(trimmed), upper: Number(trimmed) };
  const match = trimmed.match(/^(\d+)\.\.(\d+|\*)$/);
  if (match) {
    return { lower: Number(match[1]), upper: match[2] === '*' ? '*' : Number(match[2]) };
  }
  return null;
}

function formatMultiplicity(multiplicity?: Multiplicity): string {
  if (!multiplicity) return '';
  return multiplicity.lower === multiplicity.upper
    ? `${multiplicity.lower}`
    : `${multiplicity.lower}..${multiplicity.upper}`;
}

export function RelationshipInspector({ relationshipId }: RelationshipInspectorProps) {
  const relationship = useUmlStore((s) => s.model.relationships.find((r) => r.id === relationshipId));
  const classes = useUmlStore((s) => s.model.classes);
  const dispatch = useCollabDispatch();
  const select = useUmlStore((s) => s.select);
  const lastError = useUmlStore((s) => s.lastError);

  const [sourceRole, setSourceRole] = useState(relationship?.sourceRole ?? '');
  const [targetRole, setTargetRole] = useState(relationship?.targetRole ?? '');
  const [sourceMultiplicityText, setSourceMultiplicityText] = useState(
    formatMultiplicity(relationship?.sourceMultiplicity),
  );
  const [targetMultiplicityText, setTargetMultiplicityText] = useState(
    formatMultiplicity(relationship?.targetMultiplicity),
  );

  if (!relationship) return null;

  const sourceClassName = classes.find((c) => c.id === relationship.sourceClassId)?.name ?? '?';
  const targetClassName = classes.find((c) => c.id === relationship.targetClassId)?.name ?? '?';
  const editableMultiplicity = relationship.type !== 'GENERALIZATION';

  const commitRoles = () => {
    dispatch({
      type: 'UPDATE_RELATIONSHIP',
      relationshipId: relationship.id,
      sourceRole: sourceRole.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
    });
  };

  const commitMultiplicity = (end: 'source' | 'target', text: string) => {
    const parsed = parseMultiplicity(text);
    if (!parsed) return;
    dispatch({ type: 'UPDATE_MULTIPLICITY', relationshipId: relationship.id, end, multiplicity: parsed });
  };

  const handleDelete = () => {
    dispatch({ type: 'DELETE_RELATIONSHIP', relationshipId: relationship.id });
    select(null);
  };

  return (
    <div className="inspector">
      <h3>Relación</h3>
      <p className="inspector__relationship-summary">
        {sourceClassName} → {targetClassName}
      </p>
      <p className="inspector__relationship-type">{relationship.type}</p>

      {editableMultiplicity && (
        <>
          <label className="inspector__field">
            <span>Multiplicidad en {sourceClassName}</span>
            <input
              value={sourceMultiplicityText}
              onChange={(e) => setSourceMultiplicityText(e.target.value)}
              onBlur={() => commitMultiplicity('source', sourceMultiplicityText)}
              onKeyDown={(e) => e.key === 'Enter' && commitMultiplicity('source', sourceMultiplicityText)}
              placeholder="1, 0..1, 0..*, *"
            />
          </label>
          <label className="inspector__field">
            <span>Multiplicidad en {targetClassName}</span>
            <input
              value={targetMultiplicityText}
              onChange={(e) => setTargetMultiplicityText(e.target.value)}
              onBlur={() => commitMultiplicity('target', targetMultiplicityText)}
              onKeyDown={(e) => e.key === 'Enter' && commitMultiplicity('target', targetMultiplicityText)}
              placeholder="1, 0..1, 0..*, *"
            />
          </label>
        </>
      )}

      <label className="inspector__field">
        <span>Rol en {sourceClassName}</span>
        <input value={sourceRole} onChange={(e) => setSourceRole(e.target.value)} onBlur={commitRoles} />
      </label>
      <label className="inspector__field">
        <span>Rol en {targetClassName}</span>
        <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} onBlur={commitRoles} />
      </label>

      <button type="button" onClick={handleDelete}>
        Eliminar relación
      </button>

      {lastError && <p className="inspector__error">{lastError.message}</p>}
    </div>
  );
}
