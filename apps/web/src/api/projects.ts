import { apiFetch } from './client';
import type { ProjectMember, ProjectRole, ProjectSummary } from './types';

export function listProjects(token: string): Promise<ProjectSummary[]> {
  return apiFetch<ProjectSummary[]>('/projects', { token });
}

export function createProject(token: string, name: string): Promise<ProjectSummary> {
  return apiFetch<ProjectSummary>('/projects', { method: 'POST', token, body: { name } });
}

export function getProject(token: string, projectId: string): Promise<ProjectSummary> {
  return apiFetch<ProjectSummary>(`/projects/${projectId}`, { token });
}

export function deleteProject(token: string, projectId: string): Promise<void> {
  return apiFetch<void>(`/projects/${projectId}`, { method: 'DELETE', token });
}

export function listMembers(token: string, projectId: string): Promise<ProjectMember[]> {
  return apiFetch<ProjectMember[]>(`/projects/${projectId}/members`, { token });
}

export function inviteMember(
  token: string,
  projectId: string,
  email: string,
  role: ProjectRole,
): Promise<ProjectMember> {
  return apiFetch<ProjectMember>(`/projects/${projectId}/members`, { method: 'POST', token, body: { email, role } });
}

export function updateMemberRole(
  token: string,
  projectId: string,
  memberUserId: string,
  role: ProjectRole,
): Promise<ProjectMember> {
  return apiFetch<ProjectMember>(`/projects/${projectId}/members/${memberUserId}`, {
    method: 'PATCH',
    token,
    body: { role },
  });
}

export function removeMember(token: string, projectId: string, memberUserId: string): Promise<void> {
  return apiFetch<void>(`/projects/${projectId}/members/${memberUserId}`, { method: 'DELETE', token });
}
