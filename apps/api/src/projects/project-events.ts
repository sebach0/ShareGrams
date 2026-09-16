import type { ProjectRole } from '@prisma/client';

/**
 * Eventos de dominio de membresía de proyecto. ProjectsService los emite sin
 * saber quién los escucha (hoy: DiagramGateway, para expulsar/actualizar en
 * caliente a un usuario ya conectado). Mantiene a ProjectsModule sin ninguna
 * dependencia hacia RealtimeModule.
 */
export const PROJECT_MEMBER_REMOVED = 'project.member.removed';
export const PROJECT_MEMBER_ROLE_CHANGED = 'project.member.roleChanged';

export interface ProjectMemberRemovedEvent {
  projectId: string;
  userId: string;
}

export interface ProjectMemberRoleChangedEvent {
  projectId: string;
  userId: string;
  role: ProjectRole;
}
