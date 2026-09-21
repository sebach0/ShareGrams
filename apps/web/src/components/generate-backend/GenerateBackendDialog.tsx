import { useEffect, useState } from 'react';
import {
  transformUmlToRelational,
  generateSpringBootProject,
  zipGeneratedProject,
  DEFAULT_GENERATION_OPTIONS,
} from '@sharegrams/uml-core';
import type { UMLModel, DomainManifest } from '@sharegrams/uml-core';

interface GenerateBackendDialogProps {
  model: UMLModel;
  diagramName: string;
  onClose: () => void;
}

type Status = 'generating' | 'ready' | 'error';

/**
 * Igual que "Exportar XMI": todo pasa en el navegador, con el modelo que ya
 * está en memoria (Fase 9 -> Fase 10 -> ZIP), sin tocar el backend NestJS
 * para nada -- ni siquiera un VIEWER queda bloqueado, es de solo lectura.
 * A diferencia de XMI, acá SÍ puede fallar por razones de negocio (una
 * clase sin ninguna PK marcada, una relación con multiplicidad no
 * soportada, etc.) -- esos errores se muestran tal cual, nunca un genérico
 * "algo salió mal".
 */
export function GenerateBackendDialog({ model, diagramName, onClose }: GenerateBackendDialogProps) {
  const [status, setStatus] = useState<Status>('generating');
  const [errors, setErrors] = useState<string[]>([]);
  const [manifest, setManifest] = useState<DomainManifest | null>(null);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const relationalResult = transformUmlToRelational(model);
      if (!relationalResult.ok) {
        if (!cancelled) {
          setErrors(relationalResult.errors.map((e) => `${e.code}: ${e.message}`));
          setStatus('error');
        }
        return;
      }

      const options = {
        ...DEFAULT_GENERATION_OPTIONS,
        projectName: slugify(diagramName || 'generated-backend'),
        databaseName: slugify(diagramName || 'generated_db').replace(/-/g, '_'),
      };

      const generationResult = generateSpringBootProject(relationalResult.model, options, model);
      if (!generationResult.ok) {
        if (!cancelled) {
          setErrors(generationResult.errors.map((e) => `${e.code}: ${e.message}`));
          setStatus('error');
        }
        return;
      }

      const manifestFile = generationResult.project.files.find((f) => f.path === 'src/main/resources/manifest.json');
      const blob = await zipGeneratedProject(generationResult.project);
      if (cancelled) return;
      setManifest(manifestFile ? JSON.parse(manifestFile.content) : null);
      setZipBlob(blob);
      setStatus('ready');
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [model, diagramName]);

  const handleDownload = () => {
    if (!zipBlob) return;
    setDownloading(true);
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(diagramName || 'generated-backend')}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  };

  return (
    <div className="image-import__overlay" onClick={onClose}>
      <div className="image-import" onClick={(e) => e.stopPropagation()}>
        <header className="image-import__header">
          <h2>Generar backend Spring Boot</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        {status === 'generating' && <p>Generando…</p>}

        {status === 'error' && (
          <>
            <p className="image-import__error">El diagrama no se puede generar todavía:</p>
            <ul className="image-import__warnings">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
            <button type="button" onClick={onClose}>
              Cerrar
            </button>
          </>
        )}

        {status === 'ready' && manifest && (
          <>
            <p>
              {manifest.entities.length} entidad{manifest.entities.length === 1 ? '' : 'es'} lista
              {manifest.entities.length === 1 ? '' : 's'}: {manifest.entities.map((e) => e.label).join(', ')}
            </p>
            <p>Java 17 + Spring Boot, con JPA, REST, Swagger, y el endpoint /api/meta (descubrimiento dinámico).</p>
            <div className="image-import__actions">
              <button type="button" onClick={onClose}>
                Cerrar
              </button>
              <button type="button" onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Descargando…' : '⬇ Descargar ZIP'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'generated-backend'
  );
}
