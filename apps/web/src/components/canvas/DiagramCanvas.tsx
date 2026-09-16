import { useCallback, useMemo } from 'react';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import type { EdgeMouseHandler, NodeMouseHandler, OnNodeDrag, OnConnect } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { generateId } from '@sharegrams/uml-core';
import { useUmlStore } from '../../store/useUmlStore';
import { useCollabDispatch, useIsReadOnly } from '../../realtime/collabContext';
import { ClassNode } from './ClassNode';
import type { ClassNodeType } from './ClassNode';
import { RelationshipEdge } from './RelationshipEdge';
import type { RelationshipEdgeType } from './RelationshipEdge';

const nodeTypes = { umlClass: ClassNode };
const edgeTypes = { umlRelationship: RelationshipEdge };

export function DiagramCanvas() {
  const model = useUmlStore((s) => s.model);
  const selection = useUmlStore((s) => s.selection);
  const dispatch = useCollabDispatch();
  const readOnly = useIsReadOnly();
  const select = useUmlStore((s) => s.select);

  const nodes: ClassNodeType[] = useMemo(
    () =>
      model.classes.map((umlClass) => ({
        id: umlClass.id,
        type: 'umlClass',
        position: umlClass.position,
        selected: selection?.kind === 'class' && selection.id === umlClass.id,
        data: { umlClass },
      })),
    [model.classes, selection],
  );

  const edges: RelationshipEdgeType[] = useMemo(
    () =>
      model.relationships.map((relationship) => ({
        id: relationship.id,
        source: relationship.sourceClassId,
        target: relationship.targetClassId,
        type: 'umlRelationship',
        selected: selection?.kind === 'relationship' && selection.id === relationship.id,
        data: { relationship },
      })),
    [model.relationships, selection],
  );

  const onNodeDragStop: OnNodeDrag<ClassNodeType> = useCallback(
    (_event, node) => {
      dispatch({ type: 'MOVE_CLASS', classId: node.id, position: { x: node.position.x, y: node.position.y } });
    },
    [dispatch],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      dispatch({
        type: 'CREATE_RELATIONSHIP',
        relationshipId: generateId(),
        relationshipType: 'ASSOCIATION',
        sourceClassId: connection.source,
        targetClassId: connection.target,
        sourceMultiplicity: { lower: 0, upper: '*' },
        targetMultiplicity: { lower: 0, upper: '*' },
      });
    },
    [dispatch],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => select({ kind: 'class', id: node.id }),
    [select],
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => select({ kind: 'relationship', id: edge.id }),
    [select],
  );

  const onPaneClick = useCallback(() => select(null), [select]);

  return (
    <div className="diagram-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
