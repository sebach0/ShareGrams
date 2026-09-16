import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

interface SocketData {
  user: JwtPayload;
  diagramId?: string;
}

interface JoinDiagramPayload {
  diagramId: string;
}

interface CommandPayload {
  diagramId: string;
  command: Command;
}

type JoinDiagramResponse =
  | { ok: true; model: unknown; version: number }
  | { ok: false; reason: 'not_found' };

type CommandResponse = ApplyCommandResult | { ok: false; reason: 'not_joined' } | { ok: false; reason: 'not_found' };

function roomFor(diagramId: string): string {
  return `diagram:${diagramId}`;
}

/**
 * Un socket = una sesión de colaboración sobre UN diagrama a la vez. El
 * servidor nunca confía en el modelo que trae el cliente: cada comando se
 * revalida contra la base (ver DiagramsService.applyCommandToDiagram) antes
 * de retransmitirlo. La única autorización acá es "¿tenés una sesión válida?"
 * (handleConnection) -- un diagrama en sí se comparte por link, sin dueño
 * exclusivo (ver el comentario en DiagramsService).
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class DiagramGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(DiagramGateway.name);

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
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData;
    this.logger.debug(`Socket desconectado (usuario: ${data.user?.email ?? 'sin autenticar'})`);
  }

  @SubscribeMessage('join_diagram')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinDiagramPayload,
  ): Promise<JoinDiagramResponse> {
    const data = client.data as SocketData;

    try {
      const diagram = await this.diagramsService.getById(payload.diagramId);

      if (data.diagramId && data.diagramId !== payload.diagramId) {
        await client.leave(roomFor(data.diagramId));
      }
      data.diagramId = payload.diagramId;
      await client.join(roomFor(payload.diagramId));

      return { ok: true, model: diagram.model, version: diagram.version };
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
      const result = await this.diagramsService.applyCommandToDiagram(payload.diagramId, payload.command);

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
