import type Anthropic from '@anthropic-ai/sdk';
import { PRIMITIVE_TYPES, RELATIONSHIP_TYPES } from '@sharegrams/uml-core';

export const REPORT_DIAGRAM = 'report_diagram' as const;
export const REPORT_UNREADABLE = 'report_unreadable' as const;

const multiplicitySchema = {
  type: 'object',
  description: 'Multiplicidad de un extremo de relación.',
  properties: {
    lower: { type: 'integer', minimum: 0, description: 'Cota inferior, ej. 0 o 1.' },
    upper: { description: 'Cota superior: un entero, o el string "*" para "muchos".' },
  },
  required: ['lower', 'upper'],
} as const;

export const IMAGE_RECOGNITION_TOOLS: Anthropic.Tool[] = [
  {
    name: REPORT_DIAGRAM,
    description:
      'Reporta la estructura UML completa reconocida en la imagen: todas las clases con sus atributos, y todas las relaciones entre ellas. Se llama una sola vez con todo lo reconocido.',
    input_schema: {
      type: 'object',
      properties: {
        classes: {
          type: 'array',
          description: 'Todas las clases visibles en el diagrama.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              attributes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: {
                      type: 'string',
                      enum: [...PRIMITIVE_TYPES],
                      description: 'Si el tipo en la imagen no es exactamente uno de estos, elegí el más parecido.',
                    },
                  },
                  required: ['name', 'type'],
                },
              },
            },
            required: ['name', 'attributes'],
          },
        },
        relationships: {
          type: 'array',
          description: 'Todas las relaciones visibles entre clases.',
          items: {
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
      },
      required: ['classes', 'relationships'],
    },
  },
  {
    name: REPORT_UNREADABLE,
    description:
      'Usala si la imagen no muestra un diagrama de clases UML legible (foto borrosa, no es un diagrama, es otro tipo de diagrama, etc.), en vez de inventar una estructura.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
];
