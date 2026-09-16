import { Handle, Position as HandlePosition } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { UMLClass } from '@sharegrams/uml-core';

export type ClassNodeType = Node<{ umlClass: UMLClass }, 'umlClass'>;

export function ClassNode({ data, selected }: NodeProps<ClassNodeType>) {
  const { umlClass } = data;

  return (
    <div className={`uml-class-node${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={HandlePosition.Left} />
      <Handle type="source" position={HandlePosition.Right} />
      <div className="uml-class-node__header">{umlClass.name}</div>
      <div className="uml-class-node__attributes">
        {umlClass.attributes.length === 0 ? (
          <div className="uml-class-node__empty">Sin atributos</div>
        ) : (
          umlClass.attributes.map((attribute) => (
            <div key={attribute.id} className="uml-class-node__attribute">
              {attribute.name}: {attribute.type}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
