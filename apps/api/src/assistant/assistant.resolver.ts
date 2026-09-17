import { generateId, parseMultiplicity } from '@sharegrams/uml-core';
import type { Command, PrimitiveType, RelationshipType, UMLClass, UMLModel, UMLRelationship } from '@sharegrams/uml-core';
import type { AssistantToolInputMap, AssistantToolName } from './assistant.tools';

/**
 * Traduce una llamada a herramienta (nombres, tal como los ve el LLM) a un
 * Command real de uml-core (ids, tal como los espera el CommandHandler).
 * A propósito NO repite reglas de negocio como "nombre de clase duplicado":
 * eso ya lo valida applyCommand cuando DiagramsService aplica el comando
 * resultante, el mismo camino que usa un comando manual. Este módulo solo
 * resuelve "a qué entidad existente se refiere el usuario", nada más.
 */

export interface ResolveFailure {
  reason: 'not_found' | 'clarification_needed' | 'invalid_input';
  message: string;
}

export type ResolveResult = { ok: true; command: Command } | { ok: false; failure: ResolveFailure };

function notFound(message: string): ResolveResult {
  return { ok: false, failure: { reason: 'not_found', message } };
}

function needsClarification(message: string): ResolveResult {
  return { ok: false, failure: { reason: 'clarification_needed', message } };
}

function invalidInput(message: string): ResolveResult {
  return { ok: false, failure: { reason: 'invalid_input', message } };
}

function findClassByName(model: UMLModel, name: string): UMLClass | undefined {
  const normalized = name.trim().toLowerCase();
  return model.classes.find((c) => c.name.trim().toLowerCase() === normalized);
}

function resolveClass(model: UMLModel, name: string): { ok: true; klass: UMLClass } | { ok: false; failure: ResolveFailure } {
  const klass = findClassByName(model, name);
  if (!klass) {
    return { ok: false, failure: { reason: 'not_found', message: `No encontré una clase llamada "${name}".` } };
  }
  return { ok: true, klass };
}

function findRelationshipsBetween(model: UMLModel, classAId: string, classBId: string): UMLRelationship[] {
  return model.relationships.filter(
    (r) =>
      (r.sourceClassId === classAId && r.targetClassId === classBId) ||
      (r.sourceClassId === classBId && r.targetClassId === classAId),
  );
}

function resolveRelationshipBetween(
  model: UMLModel,
  classNameA: string,
  classNameB: string,
): { ok: true; relationship: UMLRelationship } | { ok: false; failure: ResolveFailure } {
  const a = resolveClass(model, classNameA);
  if (!a.ok) return a;
  const b = resolveClass(model, classNameB);
  if (!b.ok) return b;

  const candidates = findRelationshipsBetween(model, a.klass.id, b.klass.id);
  if (candidates.length === 0) {
    return {
      ok: false,
      failure: { reason: 'not_found', message: `No encontré una relación entre "${a.klass.name}" y "${b.klass.name}".` },
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      failure: {
        reason: 'clarification_needed',
        message: `Hay más de una relación entre "${a.klass.name}" y "${b.klass.name}" (${candidates
          .map((r) => r.type)
          .join(', ')}). ¿A cuál te referís?`,
      },
    };
  }
  return { ok: true, relationship: candidates[0] };
}

function endFor(relationship: UMLRelationship, classId: string): 'source' | 'target' | null {
  if (relationship.sourceClassId === classId) return 'source';
  if (relationship.targetClassId === classId) return 'target';
  return null;
}

function nextPosition(model: UMLModel): { x: number; y: number } {
  const index = model.classes.length;
  return { x: 120 + (index % 4) * 220, y: 120 + Math.floor(index / 4) * 160 };
}

export function resolveToolCall(model: UMLModel, toolName: AssistantToolName, rawInput: unknown): ResolveResult {
  switch (toolName) {
    case 'create_class': {
      const input = rawInput as AssistantToolInputMap['create_class'];
      if (!input.name?.trim()) return invalidInput('El nombre de la clase no puede estar vacío.');
      return {
        ok: true,
        command: { type: 'CREATE_CLASS', classId: generateId(), name: input.name, position: nextPosition(model) },
      };
    }

    case 'rename_class': {
      const input = rawInput as AssistantToolInputMap['rename_class'];
      const target = resolveClass(model, input.className);
      if (!target.ok) return { ok: false, failure: target.failure };
      return { ok: true, command: { type: 'UPDATE_CLASS', classId: target.klass.id, name: input.newName } };
    }

    case 'move_class': {
      const input = rawInput as AssistantToolInputMap['move_class'];
      const target = resolveClass(model, input.className);
      if (!target.ok) return { ok: false, failure: target.failure };
      return {
        ok: true,
        command: { type: 'MOVE_CLASS', classId: target.klass.id, position: { x: input.x, y: input.y } },
      };
    }

    case 'delete_class': {
      const input = rawInput as AssistantToolInputMap['delete_class'];
      const target = resolveClass(model, input.className);
      if (!target.ok) return { ok: false, failure: target.failure };
      return { ok: true, command: { type: 'DELETE_CLASS', classId: target.klass.id } };
    }

    case 'add_attribute': {
      const input = rawInput as AssistantToolInputMap['add_attribute'];
      const target = resolveClass(model, input.className);
      if (!target.ok) return { ok: false, failure: target.failure };
      return {
        ok: true,
        command: {
          type: 'ADD_ATTRIBUTE',
          classId: target.klass.id,
          attributeId: generateId(),
          name: input.attributeName,
          attributeType: input.attributeType as PrimitiveType,
        },
      };
    }

    case 'update_attribute': {
      const input = rawInput as AssistantToolInputMap['update_attribute'];
      const target = resolveClass(model, input.className);
      if (!target.ok) return { ok: false, failure: target.failure };
      const attribute = target.klass.attributes.find(
        (a) => a.name.trim().toLowerCase() === input.attributeName.trim().toLowerCase(),
      );
      if (!attribute) {
        return notFound(`La clase "${target.klass.name}" no tiene un atributo "${input.attributeName}".`);
      }
      if (!input.newName && !input.newType) {
        return needsClarification(
          `¿Qué querés cambiar del atributo "${attribute.name}" de "${target.klass.name}": el nombre, el tipo, o ambos?`,
        );
      }
      return {
        ok: true,
        command: {
          type: 'UPDATE_ATTRIBUTE',
          classId: target.klass.id,
          attributeId: attribute.id,
          name: input.newName ?? attribute.name,
          attributeType: (input.newType as PrimitiveType) ?? attribute.type,
        },
      };
    }

    case 'delete_attribute': {
      const input = rawInput as AssistantToolInputMap['delete_attribute'];
      const target = resolveClass(model, input.className);
      if (!target.ok) return { ok: false, failure: target.failure };
      const attribute = target.klass.attributes.find(
        (a) => a.name.trim().toLowerCase() === input.attributeName.trim().toLowerCase(),
      );
      if (!attribute) {
        return notFound(`La clase "${target.klass.name}" no tiene un atributo "${input.attributeName}".`);
      }
      return { ok: true, command: { type: 'DELETE_ATTRIBUTE', classId: target.klass.id, attributeId: attribute.id } };
    }

    case 'create_relationship': {
      const input = rawInput as AssistantToolInputMap['create_relationship'];
      const source = resolveClass(model, input.sourceClassName);
      if (!source.ok) return { ok: false, failure: source.failure };
      const target = resolveClass(model, input.targetClassName);
      if (!target.ok) return { ok: false, failure: target.failure };

      const relationshipType = input.relationshipType as RelationshipType;
      const sourceMultiplicity = parseMultiplicity(input.sourceMultiplicity) ?? undefined;
      const targetMultiplicity = parseMultiplicity(input.targetMultiplicity) ?? undefined;

      if (relationshipType !== 'GENERALIZATION' && (!sourceMultiplicity || !targetMultiplicity)) {
        return needsClarification(
          `¿Qué multiplicidad tiene la relación entre "${source.klass.name}" y "${target.klass.name}" en cada extremo?`,
        );
      }

      return {
        ok: true,
        command: {
          type: 'CREATE_RELATIONSHIP',
          relationshipId: generateId(),
          relationshipType,
          sourceClassId: source.klass.id,
          targetClassId: target.klass.id,
          sourceMultiplicity,
          targetMultiplicity,
        },
      };
    }

    case 'set_relationship_roles': {
      const input = rawInput as AssistantToolInputMap['set_relationship_roles'];
      const resolved = resolveRelationshipBetween(model, input.className, input.otherClassName);
      if (!resolved.ok) return { ok: false, failure: resolved.failure };
      const klass = resolveClass(model, input.className);
      if (!klass.ok) return { ok: false, failure: klass.failure };
      const end = endFor(resolved.relationship, klass.klass.id);
      if (!end) return notFound(`No encontré una clase llamada "${input.className}".`);
      return {
        ok: true,
        command: {
          type: 'UPDATE_RELATIONSHIP',
          relationshipId: resolved.relationship.id,
          sourceRole: end === 'source' ? input.role : resolved.relationship.sourceRole,
          targetRole: end === 'target' ? input.role : resolved.relationship.targetRole,
        },
      };
    }

    case 'delete_relationship': {
      const input = rawInput as AssistantToolInputMap['delete_relationship'];
      const resolved = resolveRelationshipBetween(model, input.firstClassName, input.secondClassName);
      if (!resolved.ok) return { ok: false, failure: resolved.failure };
      return { ok: true, command: { type: 'DELETE_RELATIONSHIP', relationshipId: resolved.relationship.id } };
    }

    case 'set_multiplicity': {
      const input = rawInput as AssistantToolInputMap['set_multiplicity'];
      const resolved = resolveRelationshipBetween(model, input.className, input.otherClassName);
      if (!resolved.ok) return { ok: false, failure: resolved.failure };
      const klass = resolveClass(model, input.className);
      if (!klass.ok) return { ok: false, failure: klass.failure };
      const end = endFor(resolved.relationship, klass.klass.id);
      if (!end) return notFound(`No encontré una clase llamada "${input.className}".`);
      const multiplicity = parseMultiplicity(input.multiplicity);
      if (!multiplicity) {
        return needsClarification(`¿Qué multiplicidad exacta querés para "${input.className}" en esa relación?`);
      }
      return {
        ok: true,
        command: { type: 'UPDATE_MULTIPLICITY', relationshipId: resolved.relationship.id, end, multiplicity },
      };
    }
  }
}
