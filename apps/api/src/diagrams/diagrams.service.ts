import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { applyCommand, validateModel } from '@sharegrams/uml-core';
import type { Command, CommandError, UMLModel } from '@sharegrams/uml-core';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonValue } from '../prisma/json.util';
import { ProjectsService } from '../projects/projects.service';

const MAX_APPLY_RETRIES = 5;

export type ApplyCommandResult =
  | { ok: true; model: UMLModel; version: number }
  | { ok: false; reason: 'invalid'; error: CommandError }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'read_only' };

/**
 * Un diagrama se comparte por link entre cualquier usuario que tenga acceso
 * al proyecto dueño (como dueño, EDITOR o VIEWER -- ver ProjectsService). No
 * hay ownership propio a nivel diagrama: la autorización siempre pasa por el
 * proyecto. VIEWER puede leer pero no mutar.
 */
@Injectable()
export class DiagramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  private async loadWithAccess(diagramId: string, userId: string) {
    const diagram = await this.prisma.diagram.findUnique({ where: { id: diagramId } });
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado.');
    }
    const access = await this.projectsService.getAccessLevel(diagram.projectId, userId);
    if (!access) {
      throw new ForbiddenException('No tenés acceso a este diagrama.');
    }
    return { diagram, access };
  }

  async getById(diagramId: string, userId: string) {
    const { diagram } = await this.loadWithAccess(diagramId, userId);
    return diagram;
  }

  /** Igual que getById, pero además informa el rol del usuario (lo necesita el gateway para el modo solo-lectura). */
  async getByIdWithAccess(diagramId: string, userId: string) {
    return this.loadWithAccess(diagramId, userId);
  }

  async save(diagramId: string, userId: string, model: UMLModel) {
    const errors = validateModel(model);
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'El modelo UML recibido no es válido.',
        errors,
      });
    }

    const { access } = await this.loadWithAccess(diagramId, userId);
    if (access === 'VIEWER') {
      throw new ForbiddenException('Tu rol en este proyecto es de solo lectura.');
    }

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
  async applyCommandToDiagram(diagramId: string, userId: string, command: Command): Promise<ApplyCommandResult> {
    for (let attempt = 0; attempt < MAX_APPLY_RETRIES; attempt += 1) {
      const { diagram, access } = await this.loadWithAccess(diagramId, userId);
      if (access === 'VIEWER') {
        return { ok: false, reason: 'read_only' };
      }

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
