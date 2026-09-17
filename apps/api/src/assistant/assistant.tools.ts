import type Anthropic from '@anthropic-ai/sdk';
import { PRIMITIVE_TYPES, RELATIONSHIP_TYPES } from '@sharegrams/uml-core';

/**
 * El LLM nunca ve ni inventa ids: solo nombres, tal como aparecen en el
 * contexto que le mandamos (ver buildDiagramSummary en assistant.service).
 * assistant.resolver.ts es quien traduce esos nombres a los ids reales del
 * modelo antes de armar un Command de @sharegrams/uml-core.
 */

interface MultiplicityInput {
  lower: unknown;
  upper: unknown;
}

export interface CreateClassInput {
  name: string;
}
export interface RenameClassInput {
  className: string;
  newName: string;
}
export interface MoveClassInput {
  className: string;
  x: number;
  y: number;
}
export interface DeleteClassInput {
  className: string;
}
export interface AddAttributeInput {
  className: string;
  attributeName: string;
  attributeType: string;
}
export interface UpdateAttributeInput {
  className: string;
  attributeName: string;
  newName?: string;
  newType?: string;
}
export interface DeleteAttributeInput {
  className: string;
  attributeName: string;
}
export interface CreateRelationshipInput {
  relationshipType: string;
  sourceClassName: string;
  targetClassName: string;
  sourceMultiplicity?: MultiplicityInput;
  targetMultiplicity?: MultiplicityInput;
}
export interface SetRelationshipRolesInput {
  className: string;
  otherClassName: string;
  role: string;
}
export interface DeleteRelationshipInput {
  firstClassName: string;
  secondClassName: string;
}
export interface SetMultiplicityInput {
  className: string;
  otherClassName: string;
  multiplicity: MultiplicityInput;
}

export interface AssistantToolInputMap {
  create_class: CreateClassInput;
  rename_class: RenameClassInput;
  move_class: MoveClassInput;
  delete_class: DeleteClassInput;
  add_attribute: AddAttributeInput;
  update_attribute: UpdateAttributeInput;
  delete_attribute: DeleteAttributeInput;
  create_relationship: CreateRelationshipInput;
  set_relationship_roles: SetRelationshipRolesInput;
  delete_relationship: DeleteRelationshipInput;
  set_multiplicity: SetMultiplicityInput;
}

export type AssistantToolName = keyof AssistantToolInputMap;

export const ASK_CLARIFICATION = 'ask_clarification' as const;
export const REPORT_NOT_FOUND = 'report_not_found' as const;
export const REPORT_UNSUPPORTED = 'report_unsupported' as const;

export type ControlToolName = typeof ASK_CLARIFICATION | typeof REPORT_NOT_FOUND | typeof REPORT_UNSUPPORTED;

const multiplicitySchema = {
  type: 'object',
  description: 'Multiplicidad de un extremo de relación.',
  properties: {
    lower: { type: 'integer', minimum: 0, description: 'Cota inferior, ej. 0 o 1.' },
    upper: { description: 'Cota superior: un entero, o el string "*" para "muchos".' },
  },
  required: ['lower', 'upper'],
} as const;

const UML_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_class',
    description: 'Crea una clase nueva en el diagrama.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nombre de la clase, ej. "Cliente".' } },
      required: ['name'],
    },
  },
  {
    name: 'rename_class',
    description: 'Cambia el nombre de una clase existente.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'Nombre actual de la clase.' },
        newName: { type: 'string' },
      },
      required: ['className', 'newName'],
    },
  },
  {
    name: 'move_class',
    description:
      'Mueve una clase a una posición absoluta del canvas. Si el usuario no da coordenadas explícitas, no uses esta herramienta: usá ask_clarification.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['className', 'x', 'y'],
    },
  },
  {
    name: 'delete_class',
    description: 'Elimina una clase del diagrama junto con sus relaciones.',
    input_schema: {
      type: 'object',
      properties: { className: { type: 'string' } },
      required: ['className'],
    },
  },
  {
    name: 'add_attribute',
    description: 'Agrega un atributo nuevo a una clase existente.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string' },
        attributeName: { type: 'string' },
        attributeType: { type: 'string', enum: [...PRIMITIVE_TYPES] },
      },
      required: ['className', 'attributeName', 'attributeType'],
    },
  },
  {
    name: 'update_attribute',
    description: 'Cambia el nombre y/o el tipo de un atributo que ya existe en una clase.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string' },
        attributeName: { type: 'string', description: 'Nombre actual del atributo.' },
        newName: { type: 'string' },
        newType: { type: 'string', enum: [...PRIMITIVE_TYPES] },
      },
      required: ['className', 'attributeName'],
    },
  },
  {
    name: 'delete_attribute',
    description: 'Elimina un atributo de una clase.',
    input_schema: {
      type: 'object',
      properties: { className: { type: 'string' }, attributeName: { type: 'string' } },
      required: ['className', 'attributeName'],
    },
  },
  {
    name: 'create_relationship',
    description:
      'Crea una relación entre dos clases existentes. GENERALIZATION (herencia) no lleva multiplicidad; las demás sí, en ambos extremos.',
    input_schema: {
      type: 'object',
      properties: {
        relationshipType: { type: 'string', enum: [...RELATIONSHIP_TYPES] },
        sourceClassName: { type: 'string' },
        targetClassName: { type: 'string' },
        sourceMultiplicity: multiplicitySchema,
        targetMultiplicity: multiplicitySchema,
      },
      required: ['relationshipType', 'sourceClassName', 'targetClassName'],
    },
  },
  {
    name: 'set_relationship_roles',
    description: 'Asigna el rol (nombre de extremo) que cumple una clase dentro de su relación con otra.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'Clase cuyo rol se define.' },
        otherClassName: { type: 'string', description: 'La otra clase de esa relación.' },
        role: { type: 'string' },
      },
      required: ['className', 'otherClassName', 'role'],
    },
  },
  {
    name: 'delete_relationship',
    description: 'Elimina la relación entre dos clases.',
    input_schema: {
      type: 'object',
      properties: { firstClassName: { type: 'string' }, secondClassName: { type: 'string' } },
      required: ['firstClassName', 'secondClassName'],
    },
  },
  {
    name: 'set_multiplicity',
    description: 'Cambia la multiplicidad del extremo de una relación que corresponde a una clase puntual.',
    input_schema: {
      type: 'object',
      properties: {
        className: { type: 'string', description: 'Clase cuyo extremo de la relación se está fijando.' },
        otherClassName: { type: 'string' },
        multiplicity: multiplicitySchema,
      },
      required: ['className', 'otherClassName', 'multiplicity'],
    },
  },
];

const CONTROL_TOOLS: Anthropic.Tool[] = [
  {
    name: ASK_CLARIFICATION,
    description: 'Usala cuando la instrucción no da información suficiente para ejecutar una acción concreta.',
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question'],
    },
  },
  {
    name: REPORT_NOT_FOUND,
    description:
      'Usala cuando la instrucción se refiere a una clase, atributo o relación que no existe en el diagrama actual.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
  {
    name: REPORT_UNSUPPORTED,
    description:
      'Usala cuando la instrucción pide algo fuera de tu alcance: generar un diagrama completo a partir de una descripción, ejecutar código, o cualquier cosa que no sea una edición puntual del diagrama actual.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
];

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [...UML_TOOLS, ...CONTROL_TOOLS];

const UML_TOOL_NAME_SET = new Set<string>(UML_TOOLS.map((tool) => tool.name));

export function isUmlToolName(name: string): name is AssistantToolName {
  return UML_TOOL_NAME_SET.has(name);
}
