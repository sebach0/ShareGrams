import { useState } from 'react';
import type { Multiplicity } from '@sharegrams/uml-core';
import { useUmlStore } from '../../store/useUmlStore';
import { useCollabDispatch, useIsReadOnly } from '../../realtime/collabContext';

interface RelationshipInspectorProps {
  relationshipId: string;
}

/**
 * Catálogo cerrado de multiplicidades (a pedido: nada de texto libre). "0..*"
 * y "*" son semánticamente lo mismo en UML (lower:0, upper:'*') -- se dejan
 * como dos opciones separadas porque son dos formas de escribirlo que la
 * gente reconoce distinto, aunque produzcan el mismo valor.
 */
const MULTIPLICITY_OPTIONS: { label: string; value: Multiplicity }[] = [
  { label: '0..1', value: { lower: 0, upper: 1 } },
  { label: '1', value: { lower: 1, upper: 1 } },
  { label: '0..*', value: { lower: 0, upper: '*' } },
  { label: '1..*', value: { lower: 1, upper: '*' } },
  { label: '*', value: { lower: 0, upper: '*' } },
];

function sameMultiplicity(a: Multiplicity, b: Multiplicity): boolean {
  return a.lower === b.lower && a.upper === b.upper;
}

/** Si el valor no está en el catálogo (ej. vino de un import con una cota rara), no se fuerza ninguna opción. */
function labelFor(multiplicity: Multiplicity | undefined): string {
  if (!multiplicity) return '';
  return MULTIPLICITY_OPTIONS.find((option) => sameMultiplicity(option.value, multiplicity))?.label ?? '';
}

export function RelationshipInspector({ relationshipId }: RelationshipInspectorProps) {
  const relationship = useUmlStore((s) => s.model.relationships.find((r) => r.id === relationshipId));
  const classes = useUmlStore((s) => s.model.classes);
  const dispatch = useCollabDispatch();
  const readOnly = useIsReadOnly();
  const select = useUmlStore((s) => s.select);
  const lastError = useUmlStore((s) => s.lastError);

  const [sourceRole, setSourceRole] = useState(relationship?.sourceRole ?? '');
  const [targetRole, setTargetRole] = useState(relationship?.targetRole ?? '');
  const [name, setName] = useState(relationship?.name ?? '');

  if (!relationship) return null;

  const sourceClassName = classes.find((c) => c.id === relationship.sourceClassId)?.name ?? '?';
  const targetClassName = classes.find((c) => c.id === relationship.targetClassId)?.name ?? '?';
  const editableMultiplicity = relationship.type !== 'GENERALIZATION';

  // Los tres campos van siempre juntos en un UPDATE_RELATIONSHIP: el comando
  // sobreescribe los tres con lo que le llega (ver comments en uml-core), así
  // que tocar solo uno sin reenviar los otros dos los borraría sin querer.
  const commitRelationshipData = () => {
    dispatch({
      type: 'UPDATE_RELATIONSHIP',
      relationshipId: relationship.id,
      sourceRole: sourceRole.trim() || undefined,
      targetRole: targetRole.trim() || undefined,
      name: name.trim() || undefined,
    });
  };

  const handleMultiplicityChange = (end: 'source' | 'target', label: string) => {
    const option = MULTIPLICITY_OPTIONS.find((candidate) => candidate.label === label);
    if (!option) return;
    dispatch({ type: 'UPDATE_MULTIPLICITY', relationshipId: relationship.id, end, multiplicity: option.value });
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
            <select
              value={labelFor(relationship.sourceMultiplicity)}
              onChange={(e) => handleMultiplicityChange('source', e.target.value)}
              disabled={readOnly}
            >
              <option value="" disabled>
                Elegir…
              </option>
              {MULTIPLICITY_OPTIONS.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inspector__field">
            <span>Multiplicidad en {targetClassName}</span>
            <select
              value={labelFor(relationship.targetMultiplicity)}
              onChange={(e) => handleMultiplicityChange('target', e.target.value)}
              disabled={readOnly}
            >
              <option value="" disabled>
                Elegir…
              </option>
              {MULTIPLICITY_OPTIONS.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {editableMultiplicity && (
        <label className="inspector__field">
          <span>Nombre de la relación (ej. "Pertenece")</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRelationshipData}
            placeholder="Sin nombre"
            disabled={readOnly}
          />
        </label>
      )}

      <label className="inspector__field">
        <span>Rol en {sourceClassName}</span>
        <input
          value={sourceRole}
          onChange={(e) => setSourceRole(e.target.value)}
          onBlur={commitRelationshipData}
          disabled={readOnly}
        />
      </label>
      <label className="inspector__field">
        <span>Rol en {targetClassName}</span>
        <input
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          onBlur={commitRelationshipData}
          disabled={readOnly}
        />
      </label>

      <button type="button" onClick={handleDelete} disabled={readOnly}>
        Eliminar relación
      </button>

      {lastError && <p className="inspector__error">{lastError.message}</p>}
    </div>
  );
}
