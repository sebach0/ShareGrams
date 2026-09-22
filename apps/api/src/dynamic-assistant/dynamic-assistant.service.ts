import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { DomainManifest } from '@sharegrams/uml-core';
import type { EnvConfig } from '../config/env';
import { ASK_CLARIFICATION, REPORT_INVALID_REQUEST, REPORT_UNSUPPORTED, actionForToolName, buildDynamicTools } from './dynamic-assistant.tools';
import type { DynamicAICommandResult } from './dynamic-assistant.types';

const MAX_TOKENS = 512;

/**
 * Traduce UNA instrucción en lenguaje natural a un DynamicCommand candidato
 * (Fase 15). Mismo patrón que AssistantService (Fase 5): tool use de
 * Claude, nunca texto libre, API key solo server-side. A diferencia de
 * Fase 5 -- que resuelve nombres contra el UMLModel canónico de
 * ShareGrams -- este servicio no conoce nada del backend generado más
 * allá del Domain Manifest que le manda la app móvil en cada request: no
 * hay estado, no hay memoria de conversación (regla 17).
 */
@Injectable()
export class DynamicAssistantService {
  private readonly logger = new Logger(DynamicAssistantService.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private getClient(): Anthropic | null {
    const apiKey = this.config.get('anthropicApiKey', { infer: true });
    if (!apiKey) return null;
    if (!this.client) {
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async interpret(instruction: string, manifest: DomainManifest): Promise<DynamicAICommandResult> {
    const client = this.getClient();
    if (!client) {
      this.logger.warn('Se invocó el intérprete dinámico sin ANTHROPIC_API_KEY configurada.');
      return { status: 'NOT_CONFIGURED', message: 'El asistente de IA no está configurado en este entorno.' };
    }

    const tools = buildDynamicTools(manifest);

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: this.config.get('anthropicModel', { infer: true }),
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(manifest),
        tools,
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: instruction }],
      });
    } catch (error) {
      this.logger.error('Falló la llamada a la API de Anthropic.', error instanceof Error ? error.stack : error);
      return { status: 'AI_ERROR', message: 'No se pudo procesar la instrucción, intentá de nuevo.' };
    }

    return this.resolveResponse(response);
  }

  private resolveResponse(response: Anthropic.Message): DynamicAICommandResult {
    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');

    if (!toolUse) {
      this.logger.warn('La respuesta del intérprete dinámico no incluyó ninguna tool_use.');
      return { status: 'AI_ERROR', message: 'No se pudo procesar la instrucción, intentá de nuevo.' };
    }

    if (toolUse.name === ASK_CLARIFICATION) {
      const input = toolUse.input as { question: string };
      return { status: 'CLARIFICATION_REQUIRED', message: input.question };
    }
    if (toolUse.name === REPORT_INVALID_REQUEST) {
      const input = toolUse.input as { message: string };
      return { status: 'INVALID_REQUEST', message: input.message };
    }
    if (toolUse.name === REPORT_UNSUPPORTED) {
      const input = toolUse.input as { message: string };
      return { status: 'INVALID_REQUEST', message: input.message };
    }

    const action = actionForToolName(toolUse.name);
    if (!action) {
      this.logger.warn(`El intérprete dinámico devolvió una herramienta desconocida: ${toolUse.name}`);
      return { status: 'AI_ERROR', message: 'No se pudo procesar la instrucción, intentá de nuevo.' };
    }

    const input = toolUse.input as { entity: string; id?: unknown; data?: Record<string, unknown> };
    const command: Record<string, unknown> = { action, entity: input.entity };
    if (input.id !== undefined) command.id = input.id;
    if (input.data !== undefined) command.data = input.data;

    return { status: 'COMMAND', command, message: describeAction(action, input.entity) };
  }
}

function buildSystemPrompt(manifest: DomainManifest): string {
  const entitiesDescription = manifest.entities.map(describeEntity).join('\n\n');

  return `Sos el intérprete de comandos de "${manifest.application.name}", una app móvil de ShareGrams. Tu única función es traducir UNA instrucción del usuario en UNA llamada a una de las herramientas disponibles -- nunca ejecutás nada vos mismo, nunca generás SQL, URLs ni código.

Entidades disponibles en este backend:

${entitiesDescription}

Reglas estrictas:
- Usá EXCLUSIVAMENTE los nombres de entidad y de campo tal como aparecen arriba. Nunca inventes una entidad o campo que no esté en esta lista.
- Para GET/UPDATE/DELETE necesitás el id explícito del registro (un número o texto que el usuario haya dado). Si el usuario se refiere a un registro por nombre en vez de por id, usá ask_clarification pidiendo el id.
- En CREATE/UPDATE, "data" son solo los campos que el usuario mencionó explícitamente. Nunca completes ni inventes valores para campos que no dijo.
- Si falta información para ejecutar una acción concreta, o hay más de una entidad posible y no está claro cuál, usá ask_clarification.
- Si la instrucción pide algo sobre una entidad o campo que no existe en la lista de arriba, usá report_invalid_request.
- Si la instrucción pide algo fuera de tu alcance (una operación masiva, una búsqueda o filtro complejo, o cualquier cosa que no sea una operación puntual sobre una sola entidad), usá report_unsupported.
- Nunca respondas solo con texto: siempre usá alguna herramienta.`;
}

function describeEntity(entity: DomainManifest['entities'][number]): string {
  const fields = entity.fields
    .map((f) => `  - ${f.name}: ${f.type}${f.required ? ' (obligatorio)' : ''}${f.generated ? ' (generado, no editable)' : ''}`)
    .join('\n');
  const relations = entity.relations.map((r) => `  - ${r.name} -> ${r.targetEntity} (${r.cardinality})${r.required ? ' (obligatorio)' : ''}`).join('\n');

  return [
    `${entity.name} (operaciones: ${entity.operations.join(', ')})`,
    `Campos:\n${fields || '  (ninguno)'}`,
    relations ? `Relaciones:\n${relations}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function describeAction(action: string, entity: string): string {
  switch (action) {
    case 'LIST':
      return `Listando ${entity}...`;
    case 'GET':
      return `Buscando ${entity}...`;
    case 'CREATE':
      return `Creando ${entity}...`;
    case 'UPDATE':
      return `Actualizando ${entity}...`;
    case 'DELETE':
      return `Eliminando ${entity}...`;
    default:
      return 'Procesando...';
  }
}
