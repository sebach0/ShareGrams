import type { Command, UMLModel } from '@sharegrams/uml-core';

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
}

export interface DiagramSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  diagrams: DiagramSummary[];
}

export interface DiagramDetail {
  id: string;
  projectId: string;
  name: string;
  model: UMLModel;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectRole = 'EDITOR' | 'VIEWER';
export type AccessLevel = 'OWNER' | ProjectRole;

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  user: PublicUser;
}

export type ImageRecognitionResult =
  | { ok: true; commands: Command[]; summary: string; warnings: string[] }
  | { ok: false; reason: 'unreadable' | 'not_configured' | 'error'; message: string };
