import { generateId, parseMultiplicity, PRIMITIVE_TYPES, RELATIONSHIP_TYPES } from '@sharegrams/uml-core';
import type { Command, PrimitiveType, RelationshipType } from '@sharegrams/uml-core';
import type { RecognizedDiagram } from './image-recognition.types';

export interface BuildImportCommandsResult {
  commands: Command[];
  summary: string;
  warnings: string[];
}

const PRIMITIVE_TYPE_SET = new Set<string>(PRIMITIVE_TYPES);
const RELATIONSHIP_TYPE_SET = new Set<string>(RELATIONSHIP_TYPES);

function gridPosition(index: number): { x: number; y: number } {
  return { x: 120 + (index % 4) * 220, y: 120 + Math.floor(index / 4) * 160 };
}

/**
 * Traduce la estructura que reconoció el LLM (nombres, sin ids) a un batch
 * de Command[] listo para aplicar con el dispatch normal del editor, uno
 * por uno. A diferencia de assistant.resolver.ts, acá no hay un modelo
 * existente contra el cual resolver nombres: todo es nuevo, así que la
 * única "resolución" es interna a la propia estructura reconocida (que una
 * relación apunte a una clase que también se reconoció en esta imagen).
 *
 * Nunca falla del todo: lo que no se puede traducir con confianza se
 * ignora y queda como warning, en vez de tirar abajo todo el import por
 * un solo dato mal leído.
 */
export function buildImportCommands(recognized: RecognizedDiagram, existingClassCount: number): BuildImportCommandsResult {
  const commands: Command[] = [];
  const warnings: string[] = [];
  const classIdByName = new Map<string, string>();

  for (const recognizedClass of recognized.classes) {
    const name = recognizedClass.name?.trim();
    if (!name) {
      warnings.push('Se ignoró una clase sin nombre.');
      continue;
    }
    const normalized = name.toLowerCase();
    if (classIdByName.has(normalized)) {
      warnings.push(`Se ignoró una clase duplicada llamada "${name}".`);
      continue;
    }

    const classId = generateId();
    classIdByName.set(normalized, classId);
    commands.push({
      type: 'CREATE_CLASS',
      classId,
      name,
      position: gridPosition(existingClassCount + classIdByName.size - 1),
    });

    for (const attribute of recognizedClass.attributes) {
      const attributeName = attribute.name?.trim();
      if (!attributeName) continue;
      commands.push({
        type: 'ADD_ATTRIBUTE',
        classId,
        attributeId: generateId(),
        name: attributeName,
        attributeType: normalizePrimitiveType(attribute.type),
      });
    }
  }

  for (const relationship of recognized.relationships) {
    const sourceId = classIdByName.get(relationship.sourceClassName?.trim().toLowerCase() ?? '');
    const targetId = classIdByName.get(relationship.targetClassName?.trim().toLowerCase() ?? '');
    if (!sourceId || !targetId) {
      warnings.push(
        `Se ignoró una relación entre "${relationship.sourceClassName}" y "${relationship.targetClassName}": no se reconocieron ambas clases.`,
      );
      continue;
    }

    if (!RELATIONSHIP_TYPE_SET.has(relationship.relationshipType)) {
      warnings.push(
        `Se ignoró la relación entre "${relationship.sourceClassName}" y "${relationship.targetClassName}": tipo de relación no reconocido.`,
      );
      continue;
    }
    const relationshipType = relationship.relationshipType as RelationshipType;

    const sourceMultiplicity = parseMultiplicity(relationship.sourceMultiplicity) ?? undefined;
    const targetMultiplicity = parseMultiplicity(relationship.targetMultiplicity) ?? undefined;
    if (relationshipType !== 'GENERALIZATION' && (!sourceMultiplicity || !targetMultiplicity)) {
      warnings.push(
        `Se ignoró la relación entre "${relationship.sourceClassName}" y "${relationship.targetClassName}": no se pudo leer la multiplicidad con claridad.`,
      );
      continue;
    }

    commands.push({
      type: 'CREATE_RELATIONSHIP',
      relationshipId: generateId(),
      relationshipType,
      sourceClassId: sourceId,
      targetClassId: targetId,
      sourceMultiplicity,
      targetMultiplicity,
    });
  }

  return { commands, summary: describeImport(commands, warnings), warnings };
}

function normalizePrimitiveType(type: string): PrimitiveType {
  return PRIMITIVE_TYPE_SET.has(type) ? (type as PrimitiveType) : 'String';
}

function describeImport(commands: Command[], warnings: string[]): string {
  const classCount = commands.filter((c) => c.type === 'CREATE_CLASS').length;
  const relationshipCount = commands.filter((c) => c.type === 'CREATE_RELATIONSHIP').length;

  const parts: string[] = [];
  parts.push(
    classCount === 0
      ? 'No se reconoció ninguna clase.'
      : `Se reconocieron ${classCount} clase${classCount === 1 ? '' : 's'} y ${relationshipCount} relaci${relationshipCount === 1 ? 'ón' : 'ones'}.`,
  );
  if (warnings.length > 0) {
    parts.push(`${warnings.length} advertencia${warnings.length === 1 ? '' : 's'}.`);
  }
  return parts.join(' ');
}
