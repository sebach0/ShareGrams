import type { UMLModel } from '@sharegrams/uml-core';
import { apiFetch } from './client';
import type { DiagramDetail } from './types';

export function getDiagram(token: string, diagramId: string): Promise<DiagramDetail> {
  return apiFetch<DiagramDetail>(`/diagrams/${diagramId}`, { token });
}

export function saveDiagram(token: string, diagramId: string, model: UMLModel): Promise<DiagramDetail> {
  return apiFetch<DiagramDetail>(`/diagrams/${diagramId}`, { method: 'PUT', token, body: { model } });
}
