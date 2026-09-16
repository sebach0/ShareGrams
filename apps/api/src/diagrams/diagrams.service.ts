import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { applyCommand, validateModel } from '@sharegrams/uml-core';
import type { Command, CommandError, UMLModel } from '@sharegrams/uml-core';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonValue } from '../prisma/json.util';

const MAX_APPLY_RETRIES = 5;

export type ApplyCommandResult =
  | { ok: true; model: UMLModel; version: number }
  | { ok: false; reason: 'invalid'; error: CommandError }
  | { ok: false; reason: 'conflict' };

/**
 * Un diagrama es compartido "por link": cualquier usuario autenticado que
 * conozca su id (un UUID, no adivinable) puede verlo y editarlo. No hay
 * concepto de dueño exclusivo a este nivel -- eso sigue existiendo para
 * Project (quién lo ve en "Mis proyectos", quién puede borrarlo), pero un
 * diagrama puntual es, a propósito, tan abierto como una pizarra colaborativa.
 */
@Injectable()
export class DiagramsService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(diagramId: string) {
    const diagram = await this.prisma.diagram.findUnique({ where: { id: diagramId } });
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado.');
    }
    return diagram;
  }

  async save(diagramId: string, model: UMLModel) {
    const errors = validateModel(model);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'El modelo UML recibido no es válido.',
        errors,
      });
    }

    await this.getById(diagramId); // 404 si no existe

    return this.prisma.diagram.update({
      where: { id: diagramId },
      data: {
        model: toJsonValue(model),
        version: { increment: 1 },
      },
    });
  }

  /**
   * Aplica un único comando de colaboración en tiempo real. A diferencia de
   * save (que reemplaza el modelo entero), acá el servidor es quien decide
   * el resultado: relee el modelo actual, aplica el comando con el mismo
   * CommandHandler que usa el navegador, y solo escribe si nadie más cambió
   * el diagrama mientras tanto (bloqueo optimista vía `version`). Si alguien
   * se adelantó, reintenta contra el estado más nuevo en vez de pisarlo.
   */
  async applyCommandToDiagram(diagramId: string, command: Command): Promise<ApplyCommandResult> {
    for (let attempt = 0; attempt < MAX_APPLY_RETRIES; attempt += 1) {
      const diagram = await this.getById(diagramId);
      const currentModel = diagram.model as unknown as UMLModel;

      const result = applyCommand(currentModel, command);
      if (!result.ok) {
        return { ok: false, reason: 'invalid', error: result.error };
      }

      const update = await this.prisma.diagram.updateMany({
        where: { id: diagramId, version: diagram.version },
        data: {
          model: toJsonValue(result.model),
          version: { increment: 1 },
        },
      });

      if (update.count === 1) {
        return { ok: true, model: result.model, version: diagram.version + 1 };
      }
      // Otro comando escribió entre la lectura y el update: reintentar con el estado nuevo.
    }

    return { ok: false, reason: 'conflict' };
  }
}
