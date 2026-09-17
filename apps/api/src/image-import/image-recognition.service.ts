import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { EnvConfig } from '../config/env';
import { IMAGE_RECOGNITION_TOOLS, REPORT_DIAGRAM, REPORT_UNREADABLE } from './image-recognition.tools';
import { buildImportCommands } from './image-recognition.resolver';
import type { ImageRecognitionResult, RecognizedDiagram } from './image-recognition.types';

const MAX_TOKENS = 2048;
const VISION_MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `Sos el módulo de reconocimiento de imágenes del editor UML de ShareGrams. Se te va a mostrar una foto o captura de un diagrama de clases UML (a mano o hecho con una herramienta como Enterprise Architect).

Tu única tarea es reportar, con report_diagram, exactamente lo que ves: cada clase con su nombre y sus atributos (nombre y tipo), y cada relación entre clases con su tipo y multiplicidad si es visible.

Reglas estrictas:
- No inventes clases, atributos ni relaciones que no estén visibles en la imagen.
- Si un tipo de atributo no está escrito explícitamente, usá String por defecto.
- Si la imagen no muestra un diagrama de clases UML legible, usá report_unreadable en vez de inventar una estructura.
- Nunca respondas solo con texto: siempre usá alguna herramienta.`;

type SupportedMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const SUPPORTED_MEDIA_TYPES: ReadonlySet<string> = new Set<SupportedMediaType>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isSupportedImageType(mimetype: string): mimetype is SupportedMediaType {
  return SUPPORTED_MEDIA_TYPES.has(mimetype);
}

/**
 * Reconoce un diagrama UML a partir de una imagen (Fase 7). No persiste
 * nada: devuelve un batch de Command[] ya resueltos para que el frontend
 * los muestre como vista previa y el usuario decida aplicarlos con el
 * dispatch normal del editor -- mismo criterio que Fase 6 con la voz, no
 * ejecutar a ciegas algo que un reconocimiento automático puede leer mal.
 */
@Injectable()
export class ImageRecognitionService {
  private readonly logger = new Logger(ImageRecognitionService.name);
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

  async recognize(imageBuffer: Buffer, mediaType: SupportedMediaType, existingClassCount: number): Promise<ImageRecognitionResult> {
    const client = this.getClient();
    if (!client) {
      this.logger.warn('Se invocó el reconocimiento de imagen sin ANTHROPIC_API_KEY configurada.');
      return { ok: false, reason: 'not_configured', message: 'El reconocimiento de imagen no está configurado en este entorno.' };
    }

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: IMAGE_RECOGNITION_TOOLS,
        tool_choice: { type: 'any' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBuffer.toString('base64') } },
              { type: 'text', text: 'Reportá la estructura UML de este diagrama.' },
            ],
          },
        ],
      });
    } catch (error) {
      this.logger.error('Falló la llamada a la API de Anthropic (visión).', error instanceof Error ? error.stack : error);
      return { ok: false, reason: 'error', message: 'No se pudo procesar la imagen, intentá de nuevo.' };
    }

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    if (!toolUse) {
      this.logger.warn('La respuesta del reconocimiento de imagen no incluyó ninguna tool_use.');
      return { ok: false, reason: 'error', message: 'No se pudo procesar la imagen, intentá de nuevo.' };
    }

    if (toolUse.name === REPORT_UNREADABLE) {
      const input = toolUse.input as { message: string };
      return { ok: false, reason: 'unreadable', message: input.message };
    }

    if (toolUse.name !== REPORT_DIAGRAM) {
      this.logger.warn(`El reconocimiento de imagen devolvió una herramienta desconocida: ${toolUse.name}`);
      return { ok: false, reason: 'error', message: 'No se pudo procesar la imagen, intentá de nuevo.' };
    }

    const recognized = toolUse.input as RecognizedDiagram;
    const { commands, summary, warnings } = buildImportCommands(recognized, existingClassCount);
    return { ok: true, commands, summary, warnings };
  }
}
