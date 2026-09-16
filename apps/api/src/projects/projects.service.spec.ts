import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PROJECT_MEMBER_REMOVED, PROJECT_MEMBER_ROLE_CHANGED } from './project-events';

describe('ProjectsService', () => {
  let prisma: {
    project: Record<string, jest.Mock>;
    projectMember: Record<string, jest.Mock>;
  };
  let usersService: jest.Mocked<UsersService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      projectMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;
    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    service = new ProjectsService(prisma as unknown as PrismaService, usersService, eventEmitter);
  });

  describe('create', () => {
    it('crea el proyecto junto con un diagrama inicial vacío', async () => {
      prisma.project.create.mockResolvedValue({ id: 'p1', name: 'Ventas', ownerId: 'u1', diagrams: [] });

      await service.create('u1', 'Ventas');

      const [[args]] = prisma.project.create.mock.calls;
      expect(args.data.ownerId).toBe('u1');
      expect(args.data.diagrams.create).toHaveLength(1);
      expect(args.data.diagrams.create[0].model).toEqual({ classes: [], relationships: [] });
    });
  });

  describe('getOwned', () => {
    it('lanza NotFoundException si el proyecto no existe', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.getOwned('p1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el usuario no es el dueño', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'otro-usuario', diagrams: [] });

      await expect(service.getOwned('p1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('devuelve el proyecto cuando el usuario es el dueño', async () => {
      const project = { id: 'p1', ownerId: 'u1', diagrams: [] };
      prisma.project.findUnique.mockResolvedValue(project);

      await expect(service.getOwned('p1', 'u1')).resolves.toBe(project);
    });
  });

  describe('getAccessLevel', () => {
    it('devuelve null si el proyecto no existe', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.getAccessLevel('p1', 'u1')).resolves.toBeNull();
    });

    it('devuelve OWNER para el dueño', async () => {
      prisma.project.findUnique.mockResolvedValue({ ownerId: 'u1' });

      await expect(service.getAccessLevel('p1', 'u1')).resolves.toBe('OWNER');
    });

    it('devuelve el rol de ProjectMember para un colaborador', async () => {
      prisma.project.findUnique.mockResolvedValue({ ownerId: 'otro-usuario' });
      prisma.projectMember.findUnique.mockResolvedValue({ role: 'EDITOR' });

      await expect(service.getAccessLevel('p1', 'u1')).resolves.toBe('EDITOR');
    });

    it('devuelve null si no es dueño ni colaborador', async () => {
      prisma.project.findUnique.mockResolvedValue({ ownerId: 'otro-usuario' });
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.getAccessLevel('p1', 'u1')).resolves.toBeNull();
    });
  });

  describe('getAccessible', () => {
    it('lanza NotFoundException si el proyecto no existe', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(service.getAccessible('p1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si no es dueño ni colaborador', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'otro-usuario', diagrams: [] });
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(service.getAccessible('p1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('permite el acceso a un colaborador invitado', async () => {
      const project = { id: 'p1', ownerId: 'otro-usuario', diagrams: [] };
      prisma.project.findUnique.mockResolvedValue(project);
      prisma.projectMember.findUnique.mockResolvedValue({ role: 'VIEWER' });

      await expect(service.getAccessible('p1', 'u1')).resolves.toBe(project);
    });
  });

  describe('deleteOwned', () => {
    it('no elimina nada si el usuario no es el dueño', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'otro-usuario', diagrams: [] });

      await expect(service.deleteOwned('p1', 'u1')).rejects.toThrow(ForbiddenException);
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });

    it('elimina el proyecto cuando el usuario es el dueño', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', diagrams: [] });

      await service.deleteOwned('p1', 'u1');

      expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('inviteMember', () => {
    it('rechaza si quien invita no es el dueño', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'otro-usuario', diagrams: [] });

      await expect(service.inviteMember('p1', 'u1', 'ana@example.com', 'EDITOR')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.projectMember.upsert).not.toHaveBeenCalled();
    });

    it('rechaza si el email invitado no tiene cuenta', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', diagrams: [] });
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.inviteMember('p1', 'u1', 'nadie@example.com', 'EDITOR')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza invitar al propio dueño', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', diagrams: [] });
      usersService.findByEmail.mockResolvedValue({ id: 'u1', email: 'owner@example.com' } as never);

      await expect(service.inviteMember('p1', 'u1', 'owner@example.com', 'EDITOR')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('agrega (o actualiza) el rol del colaborador', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', diagrams: [] });
      usersService.findByEmail.mockResolvedValue({ id: 'u2', email: 'ana@example.com' } as never);
      prisma.projectMember.upsert.mockResolvedValue({ projectId: 'p1', userId: 'u2', role: 'EDITOR' });

      await service.inviteMember('p1', 'u1', 'ana@example.com', 'EDITOR');

      expect(prisma.projectMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId_userId: { projectId: 'p1', userId: 'u2' } },
          create: { projectId: 'p1', userId: 'u2', role: 'EDITOR' },
          update: { role: 'EDITOR' },
        }),
      );
    });
  });

  describe('removeMember', () => {
    it('rechaza si quien saca no es el dueño', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'otro-usuario', diagrams: [] });

      await expect(service.removeMember('p1', 'u1', 'u2')).rejects.toThrow(ForbiddenException);
      expect(prisma.projectMember.deleteMany).not.toHaveBeenCalled();
    });

    it('elimina la membresía del colaborador', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', diagrams: [] });

      await service.removeMember('p1', 'u1', 'u2');

      expect(prisma.projectMember.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1', userId: 'u2' } });
    });

    it('emite PROJECT_MEMBER_REMOVED para que el gateway pueda expulsar la sesión activa', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', diagrams: [] });

      await service.removeMember('p1', 'u1', 'u2');

      expect(eventEmitter.emit).toHaveBeenCalledWith(PROJECT_MEMBER_REMOVED, { projectId: 'p1', userId: 'u2' });
    });
  });

  describe('updateMemberRole (evento)', () => {
    it('emite PROJECT_MEMBER_ROLE_CHANGED con el nuevo rol', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', diagrams: [] });
      prisma.projectMember.update.mockResolvedValue({ projectId: 'p1', userId: 'u2', role: 'VIEWER' });

      await service.updateMemberRole('p1', 'u1', 'u2', 'VIEWER');

      expect(eventEmitter.emit).toHaveBeenCalledWith(PROJECT_MEMBER_ROLE_CHANGED, {
        projectId: 'p1',
        userId: 'u2',
        role: 'VIEWER',
      });
    });
  });
});
