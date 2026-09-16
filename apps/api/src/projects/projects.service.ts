import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createEmptyModel } from '@sharegrams/uml-core';
import type { ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonValue } from '../prisma/json.util';
import { UsersService } from '../users/users.service';
import { PROJECT_MEMBER_REMOVED, PROJECT_MEMBER_ROLE_CHANGED } from './project-events';
import type { ProjectMemberRemovedEvent, ProjectMemberRoleChangedEvent } from './project-events';

const DIAGRAM_SUMMARY_SELECT = { id: true, name: true, updatedAt: true } as const;
const MEMBER_USER_SELECT = { id: true, email: true, name: true } as const;

export type AccessLevel = 'OWNER' | ProjectRole;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

  /** Proyectos propios + proyectos donde el usuario fue agregado como colaborador. */
  listForUser(userId: string) {
    return this.prisma.project.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      orderBy: { updatedAt: 'desc' },
      include: { diagrams: { select: DIAGRAM_SUMMARY_SELECT } },
    });
  }

  /** Nivel de acceso de un usuario a un proyecto, o null si no tiene ninguno. No lanza. */
  async getAccessLevel(projectId: string, userId: string): Promise<AccessLevel | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) return null;
    if (project.ownerId === userId) return 'OWNER';

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return membership?.role ?? null;
  }

  /** Cualquier nivel de acceso (dueño o colaborador) alcanza para ver el proyecto. */
  async getAccessible(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { diagrams: { select: DIAGRAM_SUMMARY_SELECT } },
    });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado.');
    }
    if (project.ownerId !== userId) {
      const membership = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!membership) {
        throw new ForbiddenException('No tenés acceso a este proyecto.');
      }
    }
    return project;
  }

  /** Solo el dueño: gestión del proyecto (borrar, invitar, listar/quitar colaboradores). */
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

  async inviteMember(projectId: string, ownerId: string, email: string, role: ProjectRole) {
    const project = await this.getOwned(projectId, ownerId);

    const invitee = await this.usersService.findByEmail(email);
    if (!invitee) {
      throw new NotFoundException('No existe ninguna cuenta con ese email.');
    }
    if (invitee.id === project.ownerId) {
      throw new BadRequestException('El dueño del proyecto ya tiene acceso total.');
    }

    return this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: invitee.id } },
      create: { projectId, userId: invitee.id, role },
      update: { role },
      include: { user: { select: MEMBER_USER_SELECT } },
    });
  }

  async listMembers(projectId: string, ownerId: string) {
    await this.getOwned(projectId, ownerId);
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateMemberRole(projectId: string, ownerId: string, memberUserId: string, role: ProjectRole) {
    await this.getOwned(projectId, ownerId);
    const updated = await this.prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: memberUserId } },
      data: { role },
      include: { user: { select: MEMBER_USER_SELECT } },
    });

    this.eventEmitter.emit(PROJECT_MEMBER_ROLE_CHANGED, {
      projectId,
      userId: memberUserId,
      role,
    } satisfies ProjectMemberRoleChangedEvent);

    return updated;
  }

  async removeMember(projectId: string, ownerId: string, memberUserId: string): Promise<void> {
    await this.getOwned(projectId, ownerId);
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId: memberUserId } });

    this.eventEmitter.emit(PROJECT_MEMBER_REMOVED, {
      projectId,
      userId: memberUserId,
    } satisfies ProjectMemberRemovedEvent);
  }
}
