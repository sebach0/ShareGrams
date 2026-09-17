import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import type { Command, UMLModel } from '@sharegrams/uml-core';
import type { JwtPayload } from '../auth/auth.service';
import { DiagramsService } from '../diagrams/diagrams.service';
import type { ApplyCommandResult } from '../diagrams/diagrams.service';
import type { AccessLevel } from '../projects/projects.service';
import { PROJECT_MEMBER_REMOVED, PROJECT_MEMBER_ROLE_CHANGED } from '../projects/project-events';
import type { ProjectMemberRemovedEvent, ProjectMemberRoleChangedEvent } from '../projects/project-events';
import { AssistantService } from '../assistant/assistant.service';

interface SocketData {
  user: JwtPayload;
  diagramId?: string;
  projectId?: string;
}

interface JoinDiagramPayload {
  diagramId: string;
}

interface CommandPayload {
  diagramId: string;
  command: Command;
}

interface AssistantInstructionPayload {
  diagramId: string;
  instruction: string;
}

type JoinDiagramResponse =
  | { ok: true; model: unknown; version: number; role: AccessLevel }
  | { ok: false; reason: 'not_found' };

type CommandResponse = ApplyCommandResult | { ok: false; reason: 'not_joined' } | { ok: false; reason: 'not_found' };

type AssistantInstructionResponse =
  // commands va acá porque el emisor -- a diferencia de un comando manual -- no los conoce
  // de antemano (los arma el LLM server-side): los necesita para aplicarlos en su propio canvas.
  | { ok: true; message: string; version: number; commands: Command[] }
  | {
      ok: false;
      reason:
        | 'not_joined'
        | 'not_found'
        | 'read_only'
        | 'clarification_needed'
        | 'unsupported'
        | 'not_configured'
        | 'invalid'
        | 'conflict'
        | 'error';
      message: string;
    };

function roomFor(diagramId: string): string {
  return `diagram:${diagramId}`;
}

/**
 * Un socket = una sesión de colaboración sobre UN diagrama a la vez. El
 * servidor nunca confía en el modelo que trae el cliente: cada comando se
 * revalida contra la base (ver DiagramsService.applyCommandToDiagram) antes
 * de retransmitirlo. La autorización (dueño / EDITOR / VIEWER del proyecto)
 * la resuelve siempre DiagramsService vía ProjectsService.
 *
 * Además mantiene un registro socketsByUser para poder actuar en caliente
 * (expulsar / cambiar el rol) sobre una sesión ya conectada cuando
 * ProjectsService emite un evento de membresía, sin que ese módulo sepa
 * nada de sockets.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class DiagramGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(DiagramGateway.name);
  private readonly socketsByUser = new Map<string, Set<Socket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly diagramsService: DiagramsService,
    private readonly assistantService: AssistantService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (client.data as SocketData).user = payload;
      this.registerSocket(payload.sub, client);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData;
    if (data.user) {
      this.unregisterSocket(data.user.sub, client);
    }
    this.logger.debug(`Socket desconectado (usuario: ${data.user?.email ?? 'sin autenticar'})`);
  }

  private registerSocket(userId: string, client: Socket): void {
    const sockets = this.socketsByUser.get(userId) ?? new Set<Socket>();
    sockets.add(client);
    this.socketsByUser.set(userId, sockets);
  }

  private unregisterSocket(userId: string, client: Socket): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;
    sockets.delete(client);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
    }
  }

  /** Sockets de ese usuario actualmente parados en un diagrama del proyecto afectado. */
  private socketsInProject(userId: string, projectId: string): Socket[] {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return [];
    return [...sockets].filter((socket) => (socket.data as SocketData).projectId === projectId);
  }

  @OnEvent(PROJECT_MEMBER_REMOVED)
  handleMemberRemoved(event: ProjectMemberRemovedEvent): void {
    for (const socket of this.socketsInProject(event.userId, event.projectId)) {
      socket.emit('access_revoked', { reason: 'removed' });
      socket.disconnect(true);
    }
  }

  @OnEvent(PROJECT_MEMBER_ROLE_CHANGED)
  handleMemberRoleChanged(event: ProjectMemberRoleChangedEvent): void {
    for (const socket of this.socketsInProject(event.userId, event.projectId)) {
      socket.emit('role_changed', { role: event.role });
    }
  }

  @SubscribeMessage('join_diagram')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinDiagramPayload,
  ): Promise<JoinDiagramResponse> {
    const data = client.data as SocketData;

    try {
      const { diagram, access } = await this.diagramsService.getByIdWithAccess(payload.diagramId, data.user.sub);

      if (data.diagramId && data.diagramId !== payload.diagramId) {
        await client.leave(roomFor(data.diagramId));
      }
      data.diagramId = payload.diagramId;
      data.projectId = diagram.projectId;
      await client.join(roomFor(payload.diagramId));

      return { ok: true, model: diagram.model, version: diagram.version, role: access };
    } catch {
      return { ok: false, reason: 'not_found' };
    }
  }

  @SubscribeMessage('command')
  async handleCommand(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CommandPayload,
  ): Promise<CommandResponse> {
    const data = client.data as SocketData;

    if (data.diagramId !== payload.diagramId) {
      return { ok: false, reason: 'not_joined' };
    }

    try {
      return await this.applyAndBroadcast(client, payload.diagramId, data.user.sub, payload.command);
    } catch {
      return { ok: false, reason: 'not_found' };
    }
  }

  /**
   * El asistente de IA no es un camino de escritura aparte: interpreta la
   * instrucción a Command(s) (AssistantService, sin acceso a Prisma ni al
   * socket) y después cada Command pasa exactamente por el mismo
   * applyAndBroadcast que un comando manual -- mismo control de rol, mismo
   * optimistic locking, misma retransmisión a la sala.
   */
  @SubscribeMessage('assistant_instruction')
  async handleAssistantInstruction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AssistantInstructionPayload,
  ): Promise<AssistantInstructionResponse> {
    const data = client.data as SocketData;

    if (data.diagramId !== payload.diagramId) {
      return { ok: false, reason: 'not_joined', message: 'No estás conectado a ese diagrama.' };
    }

    let diagram: Awaited<ReturnType<DiagramsService['getByIdWithAccess']>>['diagram'];
    let access: AccessLevel;
    try {
      ({ diagram, access } = await this.diagramsService.getByIdWithAccess(payload.diagramId, data.user.sub));
    } catch {
      return { ok: false, reason: 'not_found', message: 'No se encontró el diagrama.' };
    }

    if (access === 'VIEWER') {
      return { ok: false, reason: 'read_only', message: 'Tu rol en este proyecto es de solo lectura.' };
    }

    const interpretation = await this.assistantService.interpret(payload.instruction, {
      model: diagram.model as unknown as UMLModel,
    });

    if (!interpretation.ok) {
      return { ok: false, reason: interpretation.reason, message: interpretation.message };
    }

    let lastVersion = diagram.version;
    for (const command of interpretation.commands) {
      const result = await this.applyAndBroadcast(client, payload.diagramId, data.user.sub, command);
      if (!result.ok) {
        return { ok: false, reason: result.reason, message: describeApplyFailure(result) };
      }
      lastVersion = result.version;
    }

    return { ok: true, message: interpretation.message, version: lastVersion, commands: interpretation.commands };
  }

  private async applyAndBroadcast(
    client: Socket,
    diagramId: string,
    userId: string,
    command: Command,
  ): Promise<ApplyCommandResult> {
    const result = await this.diagramsService.applyCommandToDiagram(diagramId, userId, command);

    if (result.ok) {
      // Al resto de la sala (no al emisor: ya aplicó el comando localmente de forma optimista,
      // o -- si vino del asistente -- se lo mandamos en el ack de assistant_instruction).
      client.to(roomFor(diagramId)).emit('remote_command', { command, version: result.version });
    }

    return result;
  }
}

function describeApplyFailure(result: Extract<ApplyCommandResult, { ok: false }>): string {
  switch (result.reason) {
    case 'invalid':
      return result.error.message;
    case 'conflict':
      return 'Otro cambio se aplicó al mismo tiempo, reintentá la instrucción.';
    case 'read_only':
      return 'Tu rol en este proyecto es de solo lectura.';
  }
}
