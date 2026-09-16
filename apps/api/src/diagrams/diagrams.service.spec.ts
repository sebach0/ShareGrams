import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Command, UMLModel } from '@sharegrams/uml-core';
import { DiagramsService } from './diagrams.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DiagramsService', () => {
  let prisma: { diagram: Record<string, jest.Mock> };
  let service: DiagramsService;

  const validModel: UMLModel = {
    classes: [{ id: 'c1', name: 'Cliente', attributes: [], position: { x: 0, y: 0 } }],
    relationships: [],
  };

  beforeEach(() => {
    prisma = {
      diagram: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new DiagramsService(prisma as unknown as PrismaService);
  });

  describe('getById', () => {
    it('lanza NotFoundException si el diagrama no existe', async () => {
      prisma.diagram.findUnique.mockResolvedValue(null);

      await expect(service.getById('d1')).rejects.toThrow(NotFoundException);
    });

    it('devuelve el diagrama a cualquier usuario autenticado (se comparte por link, sin dueño exclusivo)', async () => {
      const diagram = { id: 'd1', model: validModel, version: 1 };
      prisma.diagram.findUnique.mockResolvedValue(diagram);

      await expect(service.getById('d1')).resolves.toBe(diagram);
    });
  });

  describe('save', () => {
    it('rechaza un modelo con relaciones colgantes sin llegar a tocar la base', async () => {
      const invalidModel: UMLModel = {
        classes: [],
        relationships: [
          {
            id: 'r1',
            type: 'ASSOCIATION',
            sourceClassId: 'no-existe',
            targetClassId: 'tampoco',
            sourceMultiplicity: { lower: 1, upper: 1 },
            targetMultiplicity: { lower: 0, upper: '*' },
          },
        ],
      };

      await expect(service.save('d1', invalidModel)).rejects.toThrow(BadRequestException);
      expect(prisma.diagram.findUnique).not.toHaveBeenCalled();
      expect(prisma.diagram.update).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException si el diagrama no existe', async () => {
      prisma.diagram.findUnique.mockResolvedValue(null);

      await expect(service.save('d1', validModel)).rejects.toThrow(NotFoundException);
      expect(prisma.diagram.update).not.toHaveBeenCalled();
    });

    it('guarda un modelo válido e incrementa la versión', async () => {
      prisma.diagram.findUnique.mockResolvedValue({ id: 'd1', model: validModel, version: 1 });
      prisma.diagram.update.mockResolvedValue({ id: 'd1', model: validModel, version: 2 });

      await service.save('d1', validModel);

      expect(prisma.diagram.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: {
          model: validModel,
          version: { increment: 1 },
        },
      });
    });
  });

  describe('applyCommandToDiagram', () => {
    const moveCommand: Command = { type: 'MOVE_CLASS', classId: 'c1', position: { x: 50, y: 50 } };

    it('rechaza un comando inválido sin escribir en la base', async () => {
      prisma.diagram.findUnique.mockResolvedValue({ id: 'd1', version: 1, model: validModel });

      const result = await service.applyCommandToDiagram('d1', {
        type: 'MOVE_CLASS',
        classId: 'no-existe',
        position: { x: 0, y: 0 },
      });

      expect(result).toEqual({ ok: false, reason: 'invalid', error: expect.any(Object) });
      expect(prisma.diagram.updateMany).not.toHaveBeenCalled();
    });

    it('aplica un comando válido y persiste con el update condicionado a la versión leída', async () => {
      prisma.diagram.findUnique.mockResolvedValue({ id: 'd1', version: 3, model: validModel });
      prisma.diagram.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.applyCommandToDiagram('d1', moveCommand);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.version).toBe(4);
        expect(result.model.classes[0].position).toEqual({ x: 50, y: 50 });
      }
      expect(prisma.diagram.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1', version: 3 } }),
      );
    });

    it('reintenta contra el estado más nuevo si otro comando escribió primero', async () => {
      prisma.diagram.findUnique
        .mockResolvedValueOnce({ id: 'd1', version: 3, model: validModel })
        .mockResolvedValueOnce({ id: 'd1', version: 4, model: validModel });
      prisma.diagram.updateMany
        .mockResolvedValueOnce({ count: 0 }) // alguien más escribió entre el read y el write
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.applyCommandToDiagram('d1', moveCommand);

      expect(result).toEqual(expect.objectContaining({ ok: true, version: 5 }));
      expect(prisma.diagram.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.diagram.updateMany).toHaveBeenCalledTimes(2);
    });

    it('devuelve conflicto si se agotan los reintentos', async () => {
      prisma.diagram.findUnique.mockResolvedValue({ id: 'd1', version: 3, model: validModel });
      prisma.diagram.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.applyCommandToDiagram('d1', moveCommand);

      expect(result).toEqual({ ok: false, reason: 'conflict' });
    });
  });
});
