import { useState } from 'react';
import { generateId, PRIMITIVE_TYPES } from '@sharegrams/uml-core';
import type { PrimitiveType, UMLAttribute } from '@sharegrams/uml-core';
import { useUmlStore } from '../../store/useUmlStore';
import { useCollabDispatch, useIsReadOnly } from '../../realtime/collabContext';

interface ClassInspectorProps {
  classId: string;
}

interface AttributeRowProps {
  classId: string;
  attribute: UMLAttribute;
}

function AttributeRow({ classId, attribute }: AttributeRowProps) {
  const dispatch = useCollabDispatch();
  const readOnly = useIsReadOnly();
  const [name, setName] = useState(attribute.name);
  const [attributeType, setAttributeType] = useState<PrimitiveType>(attribute.type);

  const commit = (overrides?: Partial<{ name: string; attributeType: PrimitiveType }>) => {
    const finalName = overrides?.name ?? name;
    const finalType = overrides?.attributeType ?? attributeType;
    if (finalName.trim() !== attribute.name || finalType !== attribute.type) {
      dispatch({
        type: 'UPDATE_ATTRIBUTE',
        classId,
        attributeId: attribute.id,
        name: finalName,
        attributeType: finalType,
      });
    }
  };

  return (
    <li className="inspector__attribute-row">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        disabled={readOnly}
      />
      <select
        value={attributeType}
        onChange={(e) => {
          const value = e.target.value as PrimitiveType;
          setAttributeType(value);
          commit({ attributeType: value });
        }}
        disabled={readOnly}
      >
        {PRIMITIVE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label="Eliminar atributo"
        onClick={() => dispatch({ type: 'DELETE_ATTRIBUTE', classId, attributeId: attribute.id })}
        disabled={readOnly}
      >
        ×
      </button>
    </li>
  );
}

export function ClassInspector({ classId }: ClassInspectorProps) {
  const umlClass = useUmlStore((s) => s.model.classes.find((c) => c.id === classId));
  const dispatch = useCollabDispatch();
  const readOnly = useIsReadOnly();
  const lastError = useUmlStore((s) => s.lastError);

  const [name, setName] = useState(umlClass?.name ?? '');
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrType, setNewAttrType] = useState<PrimitiveType>('String');

  if (!umlClass) return null;

  const commitName = () => {
    if (name.trim() !== umlClass.name) {
      dispatch({ type: 'UPDATE_CLASS', classId: umlClass.id, name });
    }
  };

  const handleAddAttribute = () => {
    if (!newAttrName.trim()) return;
    const success = dispatch({
      type: 'ADD_ATTRIBUTE',
      classId: umlClass.id,
      attributeId: generateId(),
      name: newAttrName,
      attributeType: newAttrType,
    });
    if (success) {
      setNewAttrName('');
      setNewAttrType('String');
    }
  };

  return (
    <div className="inspector">
      <h3>Clase</h3>
      <label className="inspector__field">
        <span>Nombre</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
          disabled={readOnly}
        />
      </label>

      <h4>Atributos</h4>
      <ul className="inspector__attribute-list">
        {umlClass.attributes.map((attribute) => (
          <AttributeRow key={attribute.id} classId={umlClass.id} attribute={attribute} />
        ))}
      </ul>

      <div className="inspector__new-attribute">
        <input
          placeholder="nombre"
          value={newAttrName}
          onChange={(e) => setNewAttrName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddAttribute()}
          disabled={readOnly}
        />
        <select
          value={newAttrType}
          onChange={(e) => setNewAttrType(e.target.value as PrimitiveType)}
          disabled={readOnly}
        >
          {PRIMITIVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleAddAttribute} disabled={readOnly}>
          + atributo
        </button>
      </div>

      {lastError && <p className="inspector__error">{lastError.message}</p>}
    </div>
  );
}
