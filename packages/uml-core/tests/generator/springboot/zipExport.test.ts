import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { zipGeneratedProject } from '../../../src/generator/springboot/zipExport';
import type { GeneratedProject } from '../../../src/generator/springboot/types';

describe('zipGeneratedProject', () => {
  it('produce un zip que contiene exactamente los archivos generados, con su contenido intacto', async () => {
    const project: GeneratedProject = {
      files: [
        { path: 'pom.xml', content: '<project></project>' },
        { path: 'src/main/java/com/example/Cliente.java', content: 'public class Cliente {}' },
      ],
    };

    const blob = await zipGeneratedProject(project);
    expect(blob.size).toBeGreaterThan(0);

    const reopened = await JSZip.loadAsync(await blob.arrayBuffer());
    // JSZip agrega entradas de directorio intermedias automáticamente (comportamiento normal de zip) -- solo nos importan los archivos.
    const filePaths = Object.values(reopened.files)
      .filter((f) => !f.dir)
      .map((f) => f.name)
      .sort();
    expect(filePaths).toEqual(['pom.xml', 'src/main/java/com/example/Cliente.java']);

    const pomContent = await reopened.file('pom.xml')!.async('string');
    expect(pomContent).toBe('<project></project>');
  });
});
