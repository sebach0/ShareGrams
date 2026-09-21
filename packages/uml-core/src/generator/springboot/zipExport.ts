import JSZip from 'jszip';
import type { GeneratedProject } from './types';

/**
 * Separado a propósito de la generación (regla 39 de la Fase 10): esto es
 * "empaquetar", no "generar" -- `generateSpringBootProject` sigue sin saber
 * nada de ZIP ni de filesystem. Cualquier otro consumidor de
 * `GeneratedProject` (escribirlo a disco para los tests de Fase 11, o esto)
 * es un componente aparte.
 */
export async function zipGeneratedProject(project: GeneratedProject): Promise<Blob> {
  const zip = new JSZip();
  for (const file of project.files) {
    zip.file(file.path, file.content);
  }
  return zip.generateAsync({ type: 'blob' });
}
