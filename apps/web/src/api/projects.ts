import { apiFetch } from './client';
import type { ProjectSummary } from './types';

export function listProjects(token: string): Promise<ProjectSummary[]> {
  return apiFetch<ProjectSummary[]>('/projects', { token });
}

export function createProject(token: string, name: string): Promise<ProjectSummary> {
  return apiFetch<ProjectSummary>('/projects', { method: 'POST', token, body: { name } });
}

export function deleteProject(token: string, projectId: string): Promise<void> {
  return apiFetch<void>(`/projects/${projectId}`, { method: 'DELETE', token });
}
