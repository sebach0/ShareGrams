import type Anthropic from '@anthropic-ai/sdk';
import type { DomainManifest, Operation } from '@sharegrams/uml-core';

/**
 * Un tool de Anthropic por acción de DynamicCommand (regla 9 de Fase 15:
 * exclusivamente LIST/GET/CREATE/UPDATE/DELETE -- SEARCH/COUNT quedan
 * fuera de este MVP, ver informe final), con el parámetro "entity"
 * restringido vía `enum` a las entidades que REALMENTE soportan esa
 * operación según el Domain Manifest del backend conectado (regla 10/20):
 * Claude no puede ni pedirle al schema una entidad/operación que no
 * existe -- esto no depende solo de instrucciones de texto, es una
 * restricción real del JSON Schema que Anthropic ya valida antes de
 * devolvernos el tool_use.
 */

export const ASK_CLARIFICATION = 'ask_clarification' as const;
export const REPORT_INVALID_REQUEST = 'report_invalid_request' as const;
export const REPORT_UNSUPPORTED = 'report_unsupported' as const;

const ACTION_TOOL_NAMES = {
  LIST: 'list_records',
  GET: 'get_record',
  CREATE: 'create_record',
  UPDATE: 'update_record',
  DELETE: 'delete_record',
} as const;

type SupportedAction = keyof typeof ACTION_TOOL_NAMES;

function entitiesSupporting(manifest: DomainManifest, operation: Operation): string[] {
  return manifest.entities.filter((e) => e.operations.includes(operation)).map((e) => e.name);
}

export function buildDynamicTools(manifest: DomainManifest): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  const listEntities = entitiesSupporting(manifest, 'LIST');
  if (listEntities.length > 0) {
    tools.push({
      name: ACTION_TOOL_NAMES.LIST,
      description: 'Lista todos los registros de una entidad.',
      input_schema: {
        type: 'object',
        properties: { entity: { type: 'string', enum: listEntities } },
        required: ['entity'],
      },
    });
  }

  const getEntities = entitiesSupporting(manifest, 'GET');
  if (getEntities.length > 0) {
    tools.push({
      name: ACTION_TOOL_NAMES.GET,
      description:
        'Consulta UN registro puntual de una entidad por su id. Necesita el id explícito -- si el usuario no lo dio (por ejemplo, se refiere al registro por nombre), no uses esta herramienta, usá ask_clarification.',
      input_schema: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: getEntities },
          id: { description: 'Id del registro, tal como lo dio el usuario (número o texto).' },
        },
        required: ['entity', 'id'],
      },
    });
  }

  const createEntities = entitiesSupporting(manifest, 'CREATE');
  if (createEntities.length > 0) {
    tools.push({
      name: ACTION_TOOL_NAMES.CREATE,
      description:
        'Crea un registro nuevo de una entidad. "data" son únicamente los campos que el usuario mencionó explícitamente -- nunca inventes ni completes valores para campos que no dijo.',
      input_schema: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: createEntities },
          data: { type: 'object', description: 'Pares campo:valor mencionados explícitamente por el usuario.' },
        },
        required: ['entity', 'data'],
      },
    });
  }

  const updateEntities = entitiesSupporting(manifest, 'UPDATE');
  if (updateEntities.length > 0) {
    tools.push({
      name: ACTION_TOOL_NAMES.UPDATE,
      description:
        'Modifica un registro existente. Necesita el id explícito del registro -- si el usuario no lo dio, no uses esta herramienta, usá ask_clarification.',
      input_schema: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: updateEntities },
          id: { description: 'Id del registro a modificar.' },
          data: { type: 'object', description: 'Solo los campos que el usuario pidió cambiar.' },
        },
        required: ['entity', 'id', 'data'],
      },
    });
  }

  const deleteEntities = entitiesSupporting(manifest, 'DELETE');
  if (deleteEntities.length > 0) {
    tools.push({
      name: ACTION_TOOL_NAMES.DELETE,
      description:
        'Elimina UN registro puntual por su id. Nunca la uses para "todos los registros" ni para un criterio -- para eso usá report_unsupported (el borrado masivo no está soportado todavía).',
      input_schema: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: deleteEntities },
          id: { description: 'Id del registro a eliminar.' },
        },
        required: ['entity', 'id'],
      },
    });
  }

  tools.push(
    {
      name: ASK_CLARIFICATION,
      description:
        'Usala cuando falta información necesaria para ejecutar una acción concreta: no se especificó qué entidad, o se referencia un registro por nombre en vez de por id para GET/UPDATE/DELETE, o hay más de una entidad posible y no está claro cuál.',
      input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    },
    {
      name: REPORT_INVALID_REQUEST,
      description: 'Usala cuando la instrucción se refiere a una entidad o campo que no existe en este backend.',
      input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
    },
    {
      name: REPORT_UNSUPPORTED,
      description:
        'Usala para pedidos fuera de alcance: operaciones masivas (ej. "eliminá todos los..."), búsquedas o filtros complejos, o cualquier cosa que no sea una operación puntual (LIST/GET/CREATE/UPDATE/DELETE) sobre UNA entidad.',
      input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
    },
  );

  return tools;
}

export function actionForToolName(name: string): SupportedAction | null {
  const entry = (Object.entries(ACTION_TOOL_NAMES) as [SupportedAction, string][]).find(([, toolName]) => toolName === name);
  return entry ? entry[0] : null;
}
