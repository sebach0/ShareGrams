import { JwtService } from '@nestjs/jwt';
import type { UMLModel } from '@sharegrams/uml-core';
import { DiagramGateway } from './diagram.gateway';
import { DiagramsService } from '../diagrams/diagrams.service';
import { AssistantService } from '../assistant/assistant.service';

function createFakeSocket(overrides: Partial<{ data: Record<string, unknown> }> = {}) {
  const emittedToRoom: Array<{ room: string; event: string; payload: unknown }> = [];
  const joined: string[] = [];
  const left: string[] = [];

  const socket = {
    data: overrides.data ?? {},
    handshake: { auth: {} as { token?: string } },
    disconnect: jest.fn(),
    join: jest.fn(async (room: string) => {
      joined.push(room);
    }),
    leave: jest.fn(async (room: string) => {
      left.push(room);
    }),
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => emittedToRoom.push({ room, event, payload }),
    })),
    emit: jest.fn(),
    _joined: joined,
    _left: left,
    _emittedToRoom: emittedToRoom,
  };

  return socket;
}

const emptyModel: UMLModel = { classes: [], relationships: [] };

describe('DiagramGateway', () => {
  let jwtService: jest.Mocked<JwtService>;
  let diagramsService: jest.Mocked<DiagramsService>;
  let assistantService: jest.Mocked<AssistantService>;
  let gateway: DiagramGateway;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() } as unknown as jest.Mocked<JwtService>;
    diagramsService = {
      getByIdWithAccess: jest.fn(),
      applyCommandToDiagram: jest.fn(),
    } as unknown as jest.Mocked<DiagramsService>;
    assistantService = { interpret: jest.fn() } as unknown as jest.Mocked<AssistantService>;
    gateway = new DiagramGateway(jwtService, diagramsService, assistantService);
  });

  describe('handleConnection / handleDisconnect', () => {
    it('desconecta si no hay token', async () => {
      const socket = createFakeSocket();
      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('desconecta si el token es inválido', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));
      const socket = createFakeSocket();
      socket.handshake.auth.token = 'x';

      await gateway.handleConnection(socket as never);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('registra el socket con el usuario autenticado', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@a.com' });
      const socket = createFakeSocket();
      socket.handshake.auth.token = 'x';

      await gateway.handleConnection(socket as never);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect((socket.data as { user: { sub: string } }).user.sub).toBe('u1');
    });
  });

  describe('eventos de membresía -> sockets en caliente', () => {
    it('handleMemberRemoved expulsa solo a los sockets del usuario parados en ese proyecto', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@a.com' });
      const socketInProject = createFakeSocket();
      socketInProject.handshake.auth.token = 'x';
      await gateway.handleConnection(socketInProject as never);
      (socketInProject.data as { projectId?: string }).projectId = 'p1';

      const socketInOtherProject = createFakeSocket();
      socketInOtherProject.handshake.auth.token = 'x';
      await gateway.handleConnection(socketInOtherProject as never);
      (socketInOtherProject.data as { projectId?: string }).projectId = 'p2';

      gateway.handleMemberRemoved({ projectId: 'p1', userId: 'u1' });

      expect(socketInProject.emit).toHaveBeenCalledWith('access_revoked', { reason: 'removed' });
      expect(socketInProject.disconnect).toHaveBeenCalledWith(true);
      expect(socketInOtherProject.emit).not.toHaveBeenCalled();
    });

    it('handleMemberRoleChanged avisa el nuevo rol sin desconectar', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', email: 'a@a.com' });
      const socket = createFakeSocket();
      socket.handshake.auth.token = 'x';
      await gateway.handleConnection(socket as never);
      (socket.data as { projectId?: string }).projectId = 'p1';

      gateway.handleMemberRoleChanged({ projectId: 'p1', userId: 'u1', role: 'VIEWER' });

      expect(socket.emit).toHaveBeenCalledWith('role_changed', { role: 'VIEWER' });
      expect(socket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleJoin', () => {
    it('devuelve not_found si el diagrama no existe o no hay acceso', async () => {
      diagramsService.getByIdWithAccess.mockRejectedValue(new Error('nope'));
      const socket = createFakeSocket();

      const result = await gateway.handleJoin(socket as never, { diagramId: 'd1' });

      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('une el socket a la sala y devuelve el modelo, versión y rol', async () => {
      diagramsService.getByIdWithAccess.mockResolvedValue({
        diagram: { id: 'd1', projectId: 'p1', model: emptyModel, version: 3 },
        access: 'EDITOR',
      } as never);
      const socket = createFakeSocket({ data: { user: { sub: 'u1' } } });

      const result = await gateway.handleJoin(socket as never, { diagramId: 'd1' });

      expect(result).toEqual({ ok: true, model: emptyModel, version: 3, role: 'EDITOR' });
      expect(socket._joined).toEqual(['diagram:d1']);
      expect((socket.data as { diagramId?: string }).diagramId).toBe('d1');
    });
  });

  describe('handleCommand', () => {
    it('rechaza si el socket no está unido a ese diagrama', async () => {
      const socket = createFakeSocket({ data: { user: { sub: 'u1' } } });

      const result = await gateway.handleCommand(socket as never, {
        diagramId: 'd1',
        command: { type: 'CREATE_CLASS', classId: 'c1', name: 'Cliente', position: { x: 0, y: 0 } },
      });

      expect(result).toEqual({ ok: false, reason: 'not_joined' });
      expect(diagramsService.applyCommandToDiagram).not.toHaveBeenCalled();
    });

    it('retransmite al resto de la sala cuando el comando se aplica', async () => {
      const socket = createFakeSocket({ data: { user: { sub: 'u1' }, diagramId: 'd1' } });
      const command = { type: 'CREATE_CLASS' as const, classId: 'c1', name: 'Cliente', position: { x: 0, y: 0 } };
      diagramsService.applyCommandToDiagram.mockResolvedValue({ ok: true, model: emptyModel, version: 2 });

      const result = await gateway.handleCommand(socket as never, { diagramId: 'd1', command });

      expect(result).toEqual({ ok: true, model: emptyModel, version: 2 });
      expect(socket._emittedToRoom).toEqual([{ room: 'diagram:d1', event: 'remote_command', payload: { command, version: 2 } }]);
    });

    it('no retransmite cuando el comando es rechazado', async () => {
      const socket = createFakeSocket({ data: { user: { sub: 'u1' }, diagramId: 'd1' } });
      const command = { type: 'DELETE_CLASS' as const, classId: 'nope' };
      diagramsService.applyCommandToDiagram.mockResolvedValue({
        ok: false,
        reason: 'invalid',
        error: { code: 'CLASS_NOT_FOUND', message: 'No existe.' },
      });

      const result = await gateway.handleCommand(socket as never, { diagramId: 'd1', command });

      expect(result.ok).toBe(false);
      expect(socket._emittedToRoom).toEqual([]);
    });
  });

  describe('handleAssistantInstruction', () => {
    const joinedSocketData = { user: { sub: 'u1' }, diagramId: 'd1' };

    it('rechaza si el socket no está unido a ese diagrama', async () => {
      const socket = createFakeSocket({ data: { user: { sub: 'u1' } } });

      const result = await gateway.handleAssistantInstruction(socket as never, {
        diagramId: 'd1',
        instruction: 'creá la clase Cliente',
      });

      expect(result).toEqual({ ok: false, reason: 'not_joined', message: expect.any(String) });
      expect(assistantService.interpret).not.toHaveBeenCalled();
    });

    it('rechaza sin llamar al asistente si el rol es VIEWER (ahorra el costo de la llamada al LLM)', async () => {
      diagramsService.getByIdWithAccess.mockResolvedValue({
        diagram: { id: 'd1', projectId: 'p1', model: emptyModel, version: 1 },
        access: 'VIEWER',
      } as never);
      const socket = createFakeSocket({ data: joinedSocketData });

      const result = await gateway.handleAssistantInstruction(socket as never, {
        diagramId: 'd1',
        instruction: 'creá la clase Cliente',
      });

      expect(result).toEqual({ ok: false, reason: 'read_only', message: expect.any(String) });
      expect(assistantService.interpret).not.toHaveBeenCalled();
    });

    it('propaga una interpretación fallida (ej. clarification_needed) sin aplicar nada', async () => {
      diagramsService.getByIdWithAccess.mockResolvedValue({
        diagram: { id: 'd1', projectId: 'p1', model: emptyModel, version: 1 },
        access: 'EDITOR',
      } as never);
      assistantService.interpret.mockResolvedValue({
        ok: false,
        reason: 'clarification_needed',
        message: '¿A qué posición la muevo?',
      });
      const socket = createFakeSocket({ data: joinedSocketData });

      const result = await gateway.handleAssistantInstruction(socket as never, {
        diagramId: 'd1',
        instruction: 'mové la clase Cliente',
      });

      expect(result).toEqual({ ok: false, reason: 'clarification_needed', message: '¿A qué posición la muevo?' });
      expect(diagramsService.applyCommandToDiagram).not.toHaveBeenCalled();
    });

    it('aplica y retransmite cada comando resultante, en orden, y devuelve el mensaje del asistente', async () => {
      diagramsService.getByIdWithAccess.mockResolvedValue({
        diagram: { id: 'd1', projectId: 'p1', model: emptyModel, version: 1 },
        access: 'EDITOR',
      } as never);
      const commandA = { type: 'CREATE_CLASS' as const, classId: 'c1', name: 'Cliente', position: { x: 0, y: 0 } };
      const commandB = { type: 'CREATE_CLASS' as const, classId: 'c2', name: 'Pedido', position: { x: 200, y: 0 } };
      assistantService.interpret.mockResolvedValue({
        ok: true,
        commands: [commandA, commandB],
        message: 'Creé las clases Cliente y Pedido.',
      });
      diagramsService.applyCommandToDiagram
        .mockResolvedValueOnce({ ok: true, model: emptyModel, version: 2 })
        .mockResolvedValueOnce({ ok: true, model: emptyModel, version: 3 });
      const socket = createFakeSocket({ data: joinedSocketData });

      const result = await gateway.handleAssistantInstruction(socket as never, {
        diagramId: 'd1',
        instruction: 'creá Cliente y Pedido',
      });

      expect(result).toEqual({
        ok: true,
        message: 'Creé las clases Cliente y Pedido.',
        version: 3,
        commands: [commandA, commandB],
      });
      expect(diagramsService.applyCommandToDiagram.mock.calls.map((call) => call[2])).toEqual([commandA, commandB]);
      expect(socket._emittedToRoom).toHaveLength(2);
    });

    it('corta en el primer comando que el CommandHandler rechaza y no sigue con los siguientes', async () => {
      diagramsService.getByIdWithAccess.mockResolvedValue({
        diagram: { id: 'd1', projectId: 'p1', model: emptyModel, version: 5 },
        access: 'EDITOR',
      } as never);
      const commandA = { type: 'DELETE_CLASS' as const, classId: 'ya-no-existe' };
      const commandB = { type: 'CREATE_CLASS' as const, classId: 'c2', name: 'Pedido', position: { x: 0, y: 0 } };
      assistantService.interpret.mockResolvedValue({ ok: true, commands: [commandA, commandB], message: 'listo' });
      diagramsService.applyCommandToDiagram.mockResolvedValueOnce({
        ok: false,
        reason: 'invalid',
        error: { code: 'CLASS_NOT_FOUND', message: 'No existe esa clase.' },
      });
      const socket = createFakeSocket({ data: joinedSocketData });

      const result = await gateway.handleAssistantInstruction(socket as never, {
        diagramId: 'd1',
        instruction: 'eliminá una clase que ya no está y creá Pedido',
      });

      expect(result).toEqual({ ok: false, reason: 'invalid', message: 'No existe esa clase.' });
      expect(diagramsService.applyCommandToDiagram).toHaveBeenCalledTimes(1);
    });
  });
});
