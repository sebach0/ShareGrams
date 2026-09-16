import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createEmptyModel } from '@sharegrams/uml-core';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonValue } from '../prisma/json.util';

const DIAGRAM_SUMMARY_SELECT = { id: true, name: true, updatedAt: true } as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, name: string) {
    return this.prisma.project.create({
      data: {
        name,
        ownerId,
        diagrams: {
          create: [{ name: 'Diagrama principal', model: toJsonValue(createEmptyModel()) }],
        },
      },
      include: { diagrams: { select: DIAGRAM_SUMMARY_SELECT } },
    });
  }

  listForUser(ownerId: string) {
    return this.prisma.project.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      include: { diagrams: { select: DIAGRAM_SUMMARY_SELECT } },
    });
  }

  async getOwned(projectId: string, ownerId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { diagrams: { select: DIAGRAM_SUMMARY_SELECT } },
    });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado.');
    }
    if (project.ownerId !== ownerId) {
      throw new ForbiddenException('No tenés acceso a este proyecto.');
    }
    return project;
  }

  async deleteOwned(projectId: string, ownerId: string): Promise<void> {
    await this.getOwned(projectId, ownerId);
    await this.prisma.project.delete({ where: { id: projectId } });
  }
}
