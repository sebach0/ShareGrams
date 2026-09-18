import { useCallback, useMemo, useRef } from 'react';
import { Background, Controls, ReactFlow, useReactFlow } from '@xyflow/react';
import type { EdgeMouseHandler, NodeMouseHandler, OnNodeDrag, OnConnectStart, OnConnectEnd } from '@xyflow/react';
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

/** MouseEvent y TouchEvent no tienen la misma forma para leer dónde está el puntero. */
function clientPointOf(event: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
  if ('changedTouches' in event && event.changedTouches.length > 0) return event.changedTouches[0];
  if ('touches' in event && event.touches.length > 0) return event.touches[0];
  return event as MouseEvent;
}

export function DiagramCanvas() {
  const model = useUmlStore((s) => s.model);
  const selection = useUmlStore((s) => s.selection);
  const dispatch = useCollabDispatch();
  const readOnly = useIsReadOnly();
  const select = useUmlStore((s) => s.select);
  const { screenToFlowPosition } = useReactFlow();

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

  // A dónde (en coordenadas del canvas, no de la pantalla) empezó el arrastre
  // de una conexión nueva. Se calcula del evento crudo del mouse/touch, no de
  // connectionState.pointer -- ver el comentario largo en onConnectEnd.
  const connectStartPointRef = useRef<{ x: number; y: number } | null>(null);

  const onConnectStart: OnConnectStart = useCallback(
    (event) => {
      const point = clientPointOf(event);
      connectStartPointRef.current = screenToFlowPosition({ x: point.clientX, y: point.clientY });
    },
    [screenToFlowPosition],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const startPoint = connectStartPointRef.current;
      connectStartPointRef.current = null;
      if (!startPoint || !connectionState.isValid || !connectionState.fromNode || !connectionState.toNode) return;

      const sourceNode = connectionState.fromNode;
      const targetNode = connectionState.toNode;
      const sourceCenter = {
        x: sourceNode.internals.positionAbsolute.x + (sourceNode.measured.width ?? 0) / 2,
        y: sourceNode.internals.positionAbsolute.y + (sourceNode.measured.height ?? 0) / 2,
      };
      const targetCenter = {
        x: targetNode.internals.positionAbsolute.x + (targetNode.measured.width ?? 0) / 2,
        y: targetNode.internals.positionAbsolute.y + (targetNode.measured.height ?? 0) / 2,
      };
      // connectionState.pointer no da un punto confiable acá (en la práctica
      // termina pisando el centro del nodo, produciendo un anchor {0,0} --
      // exactamente el bug de "la línea se conecta al centro"). El evento
      // crudo del mouse/touch sí tiene la posición real donde se soltó.
      const point = clientPointOf(event);
      const endPoint = screenToFlowPosition({ x: point.clientX, y: point.clientY });

      dispatch({
        type: 'CREATE_RELATIONSHIP',
        relationshipId: generateId(),
        relationshipType: 'ASSOCIATION',
        sourceClassId: sourceNode.id,
        targetClassId: targetNode.id,
        sourceMultiplicity: { lower: 0, upper: '*' },
        targetMultiplicity: { lower: 0, upper: '*' },
        // Dirección real hacia donde arrastraste (píxel a píxel, no un punto
        // fijo): así la relación queda enganchada justo donde la soltaste.
        sourceAnchor: { dx: startPoint.x - sourceCenter.x, dy: startPoint.y - sourceCenter.y },
        targetAnchor: { dx: endPoint.x - targetCenter.x, dy: endPoint.y - targetCenter.y },
      });
    },
    [dispatch, screenToFlowPosition],
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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
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
