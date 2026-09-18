import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { BaseEdge, EdgeLabelRenderer, useInternalNode, useReactFlow } from '@xyflow/react';
import type { Edge, EdgeProps, InternalNode, Node } from '@xyflow/react';
import type { LabelOffset, Multiplicity, RelationshipType, UMLRelationship, Waypoint } from '@sharegrams/uml-core';
import { useCollabDispatch } from '../../realtime/collabContext';

export type RelationshipEdgeType = Edge<{ relationship: UMLRelationship }, 'umlRelationship'>;

/**
 * Punto donde una relación toca el borde de una clase: si la relación trae
 * un anchor guardado (se arrastró a mano), se apunta ahí; si no (creada por
 * IA/XMI/imagen, o nunca se tocó), se apunta al centro de la otra clase --
 * "floating edge" clásico. En ambos casos es la misma cuenta: intersección
 * del rayo centro-del-nodo -> punto-objetivo con el rectángulo del nodo.
 */
function getNodeIntersection(node: InternalNode<Node>, aimPoint: { x: number; y: number }): { x: number; y: number } {
  const width = node.measured.width ?? 0;
  const height = node.measured.height ?? 0;
  const w = width / 2;
  const h = height / 2;
  const pos = node.internals.positionAbsolute;
  const x2 = pos.x + w;
  const y2 = pos.y + h;
  const x1 = aimPoint.x;
  const y1 = aimPoint.y;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function nodeCenter(node: InternalNode<Node>): { x: number; y: number } {
  return {
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
  };
}

function formatMultiplicity(multiplicity?: Multiplicity): string {
  if (!multiplicity) return '';
  return multiplicity.lower === multiplicity.upper
    ? `${multiplicity.lower}`
    : `${multiplicity.lower}..${multiplicity.upper}`;
}

const TYPE_LABEL: Record<RelationshipType, string> = {
  ASSOCIATION: '',
  AGGREGATION: '◇ agregación',
  COMPOSITION: '◆ composición',
  GENERALIZATION: '▷ hereda de',
};

interface DraggableLabelProps {
  x: number;
  y: number;
  className: string;
  onMoveEnd: (delta: { dx: number; dy: number }) => void;
  onDoubleClick?: () => void;
  children: ReactNode;
}

/**
 * Cualquier etiqueta de una relación (multiplicidad, nombre) es arrastrable
 * a mano libre -- no hay ningún punto fijo. Mientras se arrastra, el
 * desplazamiento es puramente local (useState) para que se sienta fluido;
 * recién al soltar se llama onMoveEnd, que es quien decide qué comando
 * mandar (mismo criterio que mover una clase: solo se sincroniza el
 * resultado final, no cuadro a cuadro).
 */
function DraggableLabel({ x, y, className, onMoveEnd, onDoubleClick, children }: DraggableLabelProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [liveDelta, setLiveDelta] = useState<{ dx: number; dy: number } | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button === 2) return; // click derecho: se ignora acá, onContextMenu de abajo evita el menú del navegador
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragOrigin.current = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setLiveDelta({ dx: 0, dy: 0 });
    },
    [screenToFlowPosition],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragOrigin.current) return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setLiveDelta({ dx: point.x - dragOrigin.current.x, dy: point.y - dragOrigin.current.y });
    },
    [screenToFlowPosition],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = dragOrigin.current;
      dragOrigin.current = null;
      setLiveDelta(null);
      if (!origin) return;
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const delta = { dx: point.x - origin.x, dy: point.y - origin.y };
      if (Math.abs(delta.dx) > 1 || Math.abs(delta.dy) > 1) onMoveEnd(delta);
    },
    [screenToFlowPosition, onMoveEnd],
  );

  // El pointerdown de arriba frena la propagación del propio pointerdown,
  // pero el navegador dispara un 'click' aparte al soltar -- ese sí llegaba
  // hasta el pane de React Flow y disparaba onPaneClick (deselecciona), lo
  // que desmontaba justo el elemento que se estaba arrastrando (los que
  // dependen de {selected && ...}: quiebres nuevos y puntas de conexión),
  // cortando la captura del puntero a mitad del gesto. Frenar el click acá
  // también evita esa deselección fantasma.
  const handleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const displayX = x + (liveDelta?.dx ?? 0);
  const displayY = y + (liveDelta?.dy ?? 0);

  return (
    <div
      className={className}
      style={{
        transform: `translate(-50%, -50%) translate(${displayX}px, ${displayY}px)`,
        pointerEvents: 'all',
        cursor: 'grab',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

export function RelationshipEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  selected,
}: EdgeProps<RelationshipEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const dispatch = useCollabDispatch();
  const relationship = data?.relationship;

  let sx = sourceX;
  let sy = sourceY;
  let tx = targetX;
  let ty = targetY;

  if (sourceNode?.measured.width && targetNode?.measured.width) {
    const sourceCenter = nodeCenter(sourceNode);
    const targetCenter = nodeCenter(targetNode);
    // Con anchor guardado se apunta ahí (dirección libre, elegida a mano);
    // sin anchor, se apunta al centro de la otra clase (automático).
    const sourceAim = relationship?.sourceAnchor
      ? { x: sourceCenter.x + relationship.sourceAnchor.dx, y: sourceCenter.y + relationship.sourceAnchor.dy }
      : targetCenter;
    const targetAim = relationship?.targetAnchor
      ? { x: targetCenter.x + relationship.targetAnchor.dx, y: targetCenter.y + relationship.targetAnchor.dy }
      : sourceCenter;

    const sourceIntersection = getNodeIntersection(sourceNode, sourceAim);
    const targetIntersection = getNodeIntersection(targetNode, targetAim);
    sx = sourceIntersection.x;
    sy = sourceIntersection.y;
    tx = targetIntersection.x;
    ty = targetIntersection.y;
  }

  // Siempre polilínea recta (source -> quiebres -> target), nunca curva: sin
  // quiebres da una sola línea recta de clase a clase, que es justo lo que
  // se pidió -- nada de bezier que "decida" una forma por su cuenta.
  const waypoints = relationship?.waypoints ?? [];
  const points = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }];
  const edgePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const midIndex = Math.floor(points.length / 2);
  const labelX = points[midIndex].x;
  const labelY = points[midIndex].y;

  // Posiciones por defecto (sin desplazamiento manual todavía): las
  // multiplicidades cerca de cada extremo, el nombre un poco debajo del
  // centro para no pisar el ícono del tipo de relación.
  const dx = tx - sx;
  const dy = ty - sy;
  const length = Math.hypot(dx, dy) || 1;
  const labelOffset = 18;
  const defaultSourceLabel = { x: sx + (dx / length) * labelOffset, y: sy + (dy / length) * labelOffset };
  const defaultTargetLabel = { x: tx - (dx / length) * labelOffset, y: ty - (dy / length) * labelOffset };
  const defaultNameLabel = { x: labelX, y: labelY + 16 };

  // El punto para cambiar de extremo se dibuja un poco separado del borde
  // (no exactamente sobre él): justo ahí es donde también están los
  // puntitos de conexión de la clase, y competían por el click -- por eso
  // andaban bien los quiebres/etiquetas (que ya estaban corridos) pero no
  // esto.
  const endpointNudge = 9;
  const sourceEndpointPos = { x: sx + (dx / length) * endpointNudge, y: sy + (dy / length) * endpointNudge };
  const targetEndpointPos = { x: tx - (dx / length) * endpointNudge, y: ty - (dy / length) * endpointNudge };

  const applyOffset = (base: { x: number; y: number }, offset: LabelOffset | undefined) => ({
    x: base.x + (offset?.dx ?? 0),
    y: base.y + (offset?.dy ?? 0),
  });

  const sourceLabelPos = applyOffset(defaultSourceLabel, relationship?.sourceLabelOffset);
  const targetLabelPos = applyOffset(defaultTargetLabel, relationship?.targetLabelOffset);
  const nameLabelPos = applyOffset(defaultNameLabel, relationship?.nameLabelOffset);

  const moveSourceLabel = (delta: { dx: number; dy: number }) => {
    if (!relationship) return;
    dispatch({
      type: 'UPDATE_RELATIONSHIP_LAYOUT',
      relationshipId: relationship.id,
      sourceLabelOffset: {
        dx: (relationship.sourceLabelOffset?.dx ?? 0) + delta.dx,
        dy: (relationship.sourceLabelOffset?.dy ?? 0) + delta.dy,
      },
    });
  };

  const moveTargetLabel = (delta: { dx: number; dy: number }) => {
    if (!relationship) return;
    dispatch({
      type: 'UPDATE_RELATIONSHIP_LAYOUT',
      relationshipId: relationship.id,
      targetLabelOffset: {
        dx: (relationship.targetLabelOffset?.dx ?? 0) + delta.dx,
        dy: (relationship.targetLabelOffset?.dy ?? 0) + delta.dy,
      },
    });
  };

  const moveNameLabel = (delta: { dx: number; dy: number }) => {
    if (!relationship) return;
    dispatch({
      type: 'UPDATE_RELATIONSHIP_LAYOUT',
      relationshipId: relationship.id,
      nameLabelOffset: {
        dx: (relationship.nameLabelOffset?.dx ?? 0) + delta.dx,
        dy: (relationship.nameLabelOffset?.dy ?? 0) + delta.dy,
      },
    });
  };

  const setWaypoints = (next: Waypoint[]) => {
    if (!relationship) return;
    dispatch({ type: 'UPDATE_RELATIONSHIP_LAYOUT', relationshipId: relationship.id, waypoints: next });
  };

  const moveWaypoint = (index: number, delta: { dx: number; dy: number }) => {
    const current = waypoints[index];
    if (!current) return;
    const next = [...waypoints];
    next[index] = { x: current.x + delta.dx, y: current.y + delta.dy };
    setWaypoints(next);
  };

  const removeWaypoint = (index: number) => {
    setWaypoints(waypoints.filter((_, i) => i !== index));
  };

  const segmentMidpoints = points.slice(0, -1).map((p, i) => ({
    x: (p.x + points[i + 1].x) / 2,
    y: (p.y + points[i + 1].y) / 2,
  }));

  /** Arrastrar el punto medio de un tramo (entre points[segmentIndex] y points[segmentIndex+1]) inserta un quiebre nuevo ahí. */
  const insertWaypoint = (segmentIndex: number, delta: { dx: number; dy: number }) => {
    const midpoint = segmentMidpoints[segmentIndex];
    const next = [...waypoints];
    next.splice(segmentIndex, 0, { x: midpoint.x + delta.dx, y: midpoint.y + delta.dy });
    setWaypoints(next);
  };

  /**
   * Cambiar de qué lado sale/entra un extremo YA CREADO, sin borrar y
   * recrear la relación. Es un punto arrastrable propio (no el reconnect
   * nativo de React Flow): ese usa su propia cuenta de posición, que no
   * coincide con el punto que este componente calcula y dibuja, así que la
   * manija terminaba en otro lado del que se ve la línea. Esto en cambio
   * arrastra siempre desde el punto exacto que ya se está mostrando.
   */
  const moveSourceAnchor = (delta: { dx: number; dy: number }) => {
    if (!relationship || !sourceNode) return;
    const center = nodeCenter(sourceNode);
    dispatch({
      type: 'UPDATE_RELATIONSHIP_LAYOUT',
      relationshipId: relationship.id,
      sourceAnchor: { dx: sourceEndpointPos.x + delta.dx - center.x, dy: sourceEndpointPos.y + delta.dy - center.y },
    });
  };

  const moveTargetAnchor = (delta: { dx: number; dy: number }) => {
    if (!relationship || !targetNode) return;
    const center = nodeCenter(targetNode);
    dispatch({
      type: 'UPDATE_RELATIONSHIP_LAYOUT',
      relationshipId: relationship.id,
      targetAnchor: { dx: targetEndpointPos.x + delta.dx - center.x, dy: targetEndpointPos.y + delta.dy - center.y },
    });
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={selected ? { stroke: '#2563eb' } : undefined} />
      {relationship && (
        <EdgeLabelRenderer>
          {relationship.type !== 'GENERALIZATION' && (
            <>
              <DraggableLabel x={sourceLabelPos.x} y={sourceLabelPos.y} className="uml-edge-label" onMoveEnd={moveSourceLabel}>
                {formatMultiplicity(relationship.sourceMultiplicity)}
              </DraggableLabel>
              <DraggableLabel x={targetLabelPos.x} y={targetLabelPos.y} className="uml-edge-label" onMoveEnd={moveTargetLabel}>
                {formatMultiplicity(relationship.targetMultiplicity)}
              </DraggableLabel>
            </>
          )}
          {TYPE_LABEL[relationship.type] && (
            <div
              className="uml-edge-label uml-edge-label--center"
              style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            >
              {TYPE_LABEL[relationship.type]}
            </div>
          )}
          {relationship.name && (
            <DraggableLabel
              x={nameLabelPos.x}
              y={nameLabelPos.y}
              className="uml-edge-label uml-edge-label--name"
              onMoveEnd={moveNameLabel}
            >
              {relationship.name}
            </DraggableLabel>
          )}
          {waypoints.map((waypoint, index) => (
            <DraggableLabel
              key={index}
              x={waypoint.x}
              y={waypoint.y}
              className="uml-waypoint"
              onMoveEnd={(delta) => moveWaypoint(index, delta)}
              onDoubleClick={() => removeWaypoint(index)}
            >
              <span title="Arrastrar para mover, doble click para quitar" />
            </DraggableLabel>
          ))}
          {selected &&
            segmentMidpoints.map((midpoint, index) => (
              <DraggableLabel
                key={index}
                x={midpoint.x}
                y={midpoint.y}
                className="uml-waypoint uml-waypoint--add"
                onMoveEnd={(delta) => insertWaypoint(index, delta)}
              >
                <span title="Arrastrar para agregar un quiebre acá" />
              </DraggableLabel>
            ))}
          {selected && (
            <>
              <DraggableLabel x={sourceEndpointPos.x} y={sourceEndpointPos.y} className="uml-endpoint" onMoveEnd={moveSourceAnchor}>
                <span title="Arrastrar para cambiar de qué lado sale esta relación" />
              </DraggableLabel>
              <DraggableLabel x={targetEndpointPos.x} y={targetEndpointPos.y} className="uml-endpoint" onMoveEnd={moveTargetAnchor}>
                <span title="Arrastrar para cambiar de qué lado entra esta relación" />
              </DraggableLabel>
            </>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}
