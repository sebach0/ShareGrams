import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Command, UMLModel } from '@sharegrams/uml-core';
import type { EnvConfig } from '../config/env';
import { ASK_CLARIFICATION, ASSISTANT_TOOLS, REPORT_NOT_FOUND, REPORT_UNSUPPORTED, isUmlToolName } from './assistant.tools';
import { resolveToolCall } from './assistant.resolver';
import type { AssistantContext, AssistantInterpretation, AssistantInterpreter } from './assistant.types';

const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `Sos el asistente del editor UML de ShareGrams. Tu única función es traducir UNA instrucción del usuario en llamadas a las herramientas disponibles, que reflejan exactamente los comandos que el editor ya sabe validar y aplicar sobre el modelo canónico del diagrama.

Reglas estrictas:
- Nunca generes un diagrama completo a partir de una descripción de un sistema ni crees clases, atributos o relaciones que el usuario no haya pedido explícitamente. Si te piden diseñar un sistema entero, usá report_unsupported.
- Referite a clases, atributos y relaciones por su nombre tal como aparecen en el contexto. Nunca inventes ni asumas un id.
- Si la instrucción no da información suficiente para ejecutar una acción concreta (por ejemplo, mover una clase sin decir a dónde, o crear una relación sin decir la multiplicidad), usá ask_clarification.
- Si la instrucción se refiere a una clase, atributo o relación que no aparece en el contexto, usá report_not_found.
- Una instrucción puede requerir más de una llamada a herramientas solo si describe explícitamente más de una acción (por ejemplo "creá las clases Cliente y Pedido").
- Nunca respondas solo con texto: siempre usá alguna herramienta.`;

/**
 * Traduce una instrucción en lenguaje natural a Command(s) de uml-core
 * usando tool use de Claude. No aplica nada por sí mismo: DiagramGateway es
 * quien toma el resultado y lo pasa por DiagramsService.applyCommandToDiagram,
 * exactamente igual que un comando manual (mismo control de rol, mismo
 * optimistic locking, misma validación de negocio en el CommandHandler).
 */
@Injectable()
export class AssistantService implements AssistantInterpreter {
  private readonly logger = new Logger(AssistantService.name);
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

  async interpret(instruction: string, context: AssistantContext): Promise<AssistantInterpretation> {
    const client = this.getClient();
    if (!client) {
      this.logger.warn('Se invocó el asistente sin ANTHROPIC_API_KEY configurada.');
      return {
        ok: false,
        reason: 'not_configured',
        message: 'El asistente de IA no está configurado en este entorno.',
      };
    }

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: this.config.get('anthropicModel', { infer: true }),
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: ASSISTANT_TOOLS,
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: buildUserMessage(instruction, context.model) }],
      });
    } catch (error) {
      this.logger.error('Falló la llamada a la API de Anthropic.', error instanceof Error ? error.stack : error);
      return { ok: false, reason: 'error', message: 'No se pudo procesar la instrucción, intentá de nuevo.' };
    }

    return this.resolveResponse(response, context.model);
  }

  private resolveResponse(response: Anthropic.Message, model: UMLModel): AssistantInterpretation {
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      this.logger.warn('La respuesta del asistente no incluyó ninguna tool_use.');
      return { ok: false, reason: 'error', message: 'No se pudo procesar la instrucción, intentá de nuevo.' };
    }

    const commands: Command[] = [];

    for (const toolUse of toolUses) {
      if (toolUse.name === ASK_CLARIFICATION) {
        const input = toolUse.input as { question: string };
        return { ok: false, reason: 'clarification_needed', message: input.question };
      }
      if (toolUse.name === REPORT_NOT_FOUND) {
        const input = toolUse.input as { message: string };
        return { ok: false, reason: 'not_found', message: input.message };
      }
      if (toolUse.name === REPORT_UNSUPPORTED) {
        const input = toolUse.input as { message: string };
        return { ok: false, reason: 'unsupported', message: input.message };
      }

      if (!isUmlToolName(toolUse.name)) {
        this.logger.warn(`El asistente devolvió una herramienta desconocida: ${toolUse.name}`);
        return { ok: false, reason: 'error', message: 'No se pudo procesar la instrucción, intentá de nuevo.' };
      }

      const resolved = resolveToolCall(model, toolUse.name, toolUse.input);
      if (!resolved.ok) {
        return { ok: false, reason: resolved.failure.reason === 'invalid_input' ? 'error' : resolved.failure.reason, message: resolved.failure.message };
      }
      commands.push(resolved.command);
    }

    return { ok: true, commands, message: describeCommands(commands) };
  }
}

function buildUserMessage(instruction: string, model: UMLModel): string {
  return `Diagrama actual:\n${describeModel(model)}\n\nInstrucción del usuario: "${instruction}"`;
}

function describeModel(model: UMLModel): string {
  if (model.classes.length === 0) {
    return 'El diagrama está vacío, todavía no hay clases.';
  }

  const classesDescription = model.classes
    .map((umlClass) => {
      const attributes =
        umlClass.attributes.length > 0
          ? umlClass.attributes.map((a) => `${a.name}: ${a.type}`).join(', ')
          : '(sin atributos)';
      return `- ${umlClass.name}: ${attributes}`;
    })
    .join('\n');

  const relationshipsDescription =
    model.relationships.length > 0
      ? model.relationships
          .map((r) => {
            const source = model.classes.find((c) => c.id === r.sourceClassId)?.name ?? '?';
            const target = model.classes.find((c) => c.id === r.targetClassId)?.name ?? '?';
            return `- ${source} --${r.type}--> ${target}`;
          })
          .join('\n')
      : '(sin relaciones)';

  return `Clases:\n${classesDescription}\n\nRelaciones:\n${relationshipsDescription}`;
}

function describeCommands(commands: Command[]): string {
  return commands.map(describeCommand).join(' ');
}

function describeCommand(command: Command): string {
  switch (command.type) {
    case 'CREATE_CLASS':
      return `Creé la clase "${command.name}".`;
    case 'UPDATE_CLASS':
      return `Renombré la clase a "${command.name}".`;
    case 'MOVE_CLASS':
      return 'Moví la clase.';
    case 'DELETE_CLASS':
      return 'Eliminé la clase.';
    case 'ADD_ATTRIBUTE':
      return `Agregué el atributo "${command.name}" (${command.attributeType}).`;
    case 'UPDATE_ATTRIBUTE':
      return `Actualicé el atributo a "${command.name}" (${command.attributeType}).`;
    case 'DELETE_ATTRIBUTE':
      return 'Eliminé el atributo.';
    case 'CREATE_RELATIONSHIP':
      return `Creé una relación de tipo ${command.relationshipType}.`;
    case 'UPDATE_RELATIONSHIP':
      return 'Actualicé los roles de la relación.';
    case 'UPDATE_RELATIONSHIP_LAYOUT':
      return 'Actualicé la posición de la relación.';
    case 'DELETE_RELATIONSHIP':
      return 'Eliminé la relación.';
    case 'UPDATE_MULTIPLICITY':
      return 'Actualicé la multiplicidad.';
  }
}
