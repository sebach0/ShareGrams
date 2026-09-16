import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProjectsService', () => {
  let prisma: { project: Record<string, jest.Mock> };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ProjectsService(prisma as unknown as PrismaService);
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
});
