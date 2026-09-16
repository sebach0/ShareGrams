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
import type { Command } from '@sharegrams/uml-core';
import type { JwtPayload } from '../auth/auth.service';
import { DiagramsService } from '../diagrams/diagrams.service';
import type { ApplyCommandResult } from '../diagrams/diagrams.service';
import type { AccessLevel } from '../projects/projects.service';
import { PROJECT_MEMBER_REMOVED, PROJECT_MEMBER_ROLE_CHANGED } from '../projects/project-events';
import type { ProjectMemberRemovedEvent, ProjectMemberRoleChangedEvent } from '../projects/project-events';

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

type JoinDiagramResponse =
  | { ok: true; model: unknown; version: number; role: AccessLevel }
  | { ok: false; reason: 'not_found' };

type CommandResponse = ApplyCommandResult | { ok: false; reason: 'not_joined' } | { ok: false; reason: 'not_found' };

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
      const result = await this.diagramsService.applyCommandToDiagram(payload.diagramId, data.user.sub, payload.command);

      if (result.ok) {
        // Al resto de la sala (no al emisor: ya aplicó el comando localmente de forma optimista).
        client.to(roomFor(payload.diagramId)).emit('remote_command', {
          command: payload.command,
          version: result.version,
        });
      }

      return result;
    } catch {
      return { ok: false, reason: 'not_found' };
    }
  }
}
