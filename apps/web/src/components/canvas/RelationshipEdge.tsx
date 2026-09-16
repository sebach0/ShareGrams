import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { Multiplicity, RelationshipType, UMLRelationship } from '@sharegrams/uml-core';

export type RelationshipEdgeType = Edge<{ relationship: UMLRelationship }, 'umlRelationship'>;

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

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps<RelationshipEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const relationship = data?.relationship;

  // Las multiplicidades se dibujan un poco separadas del handle (no encima)
  // para que el punto de conexión no tape el texto.
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const labelOffset = 18;
  const sourceLabelX = sourceX + (dx / length) * labelOffset;
  const sourceLabelY = sourceY + (dy / length) * labelOffset;
  const targetLabelX = targetX - (dx / length) * labelOffset;
  const targetLabelY = targetY - (dy / length) * labelOffset;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={selected ? { stroke: '#2563eb' } : undefined} />
      {relationship && (
        <EdgeLabelRenderer>
          <div
            className="uml-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${sourceLabelX}px, ${sourceLabelY}px)` }}
          >
            {formatMultiplicity(relationship.sourceMultiplicity)}
          </div>
          <div
            className="uml-edge-label uml-edge-label--center"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {TYPE_LABEL[relationship.type]}
          </div>
          <div
            className="uml-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${targetLabelX}px, ${targetLabelY}px)` }}
          >
            {formatMultiplicity(relationship.targetMultiplicity)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
