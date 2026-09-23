import { Handle, Position as HandlePosition, useConnection } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { UMLClass } from '@sharegrams/uml-core';
import { primitiveTypeLabel } from '../../uml/primitiveTypeLabel';

export type ClassNodeType = Node<{ umlClass: UMLClass }, 'umlClass'>;

/**
 * Empezar una conexión nueva necesita sí o sí un punto discreto: React Flow
 * usa el mismo tipo de elemento (Handle) para "acá se puede iniciar una
 * conexión" y no distingue eso de "acá se puede arrastrar la clase entera" --
 * si todo el cuerpo fuera un handle, se rompería poder mover la clase. Esto
 * no es una limitación nuestra, es de cómo está armada la librería.
 *
 * Lo que sí se puede hacer bien: muchos más puntos que antes (5 por lado en
 * vez de 1) para que arrancar se sienta bastante libre, y dejar terminar
 * (soltar/reenganchar) en CUALQUIER punto del rectángulo -- ver el target de
 * abajo, que cubre toda la clase y solo se activa mientras hay una conexión
 * en curso (así el resto del tiempo no interfiere con seleccionar/arrastrar
 * la clase normalmente).
 */
const SOURCE_HANDLE_FRACTIONS = [0.2, 0.35, 0.5, 0.65, 0.8];

interface SourceHandleSpec {
  id: string;
  style: CSSProperties;
}

function buildSourceHandles(): SourceHandleSpec[] {
  const handles: SourceHandleSpec[] = [];
  for (const fraction of SOURCE_HANDLE_FRACTIONS) {
    const pct = `${fraction * 100}%`;
    handles.push({ id: `top-${fraction}-source`, style: { left: pct, top: 0, transform: 'translate(-50%, -50%)' } });
    handles.push({ id: `bottom-${fraction}-source`, style: { left: pct, top: '100%', transform: 'translate(-50%, -50%)' } });
    handles.push({ id: `left-${fraction}-source`, style: { left: 0, top: pct, transform: 'translate(-50%, -50%)' } });
    handles.push({ id: `right-${fraction}-source`, style: { left: '100%', top: pct, transform: 'translate(-50%, -50%)' } });
  }
  return handles;
}

const SOURCE_HANDLES = buildSourceHandles();

export function ClassNode({ data, selected }: NodeProps<ClassNodeType>) {
  const { umlClass } = data;
  // true mientras alguien está arrastrando una conexión desde cualquier clase del diagrama.
  const connectionInProgress = useConnection((connection) => connection.inProgress);

  return (
    <div className={`uml-class-node${selected ? ' is-selected' : ''}`}>
      <Handle
        type="target"
        position={HandlePosition.Top}
        id="any-target"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          transform: 'none',
          borderRadius: 'inherit',
          background: 'transparent',
          border: 'none',
          // Fuera de una conexión en curso, no debe interceptar clicks/arrastres normales de la clase.
          pointerEvents: connectionInProgress ? 'all' : 'none',
        }}
      />
      {SOURCE_HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          type="source"
          position={HandlePosition.Top}
          id={handle.id}
          className="uml-class-node__source-handle"
          style={handle.style}
        />
      ))}
      <div className="uml-class-node__header">{umlClass.name}</div>
      <div className="uml-class-node__attributes">
        {umlClass.attributes.length === 0 ? (
          <div className="uml-class-node__empty">Sin atributos</div>
        ) : (
          umlClass.attributes.map((attribute) => (
            <div key={attribute.id} className="uml-class-node__attribute">
              {attribute.name}: {primitiveTypeLabel(attribute.type)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
