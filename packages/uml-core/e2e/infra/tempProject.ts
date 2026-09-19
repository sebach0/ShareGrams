import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import type { GeneratedProject } from '../../src/generator/springboot/types';

/** Escribe un GeneratedProject a un directorio temporal real (regla 39: generar y escribir son responsabilidades separadas -- esto es la escritura, vive en Fase 11 porque solo la necesita la verificación E2E). */
export function writeGeneratedProject(project: GeneratedProject): string {
  const dir = mkdtempSync(join(tmpdir(), 'sharegrams-e2e-'));
  for (const file of project.files) {
    const fullPath = join(dir, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf8');
  }
  return dir;
}

export function removeTempProject(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
