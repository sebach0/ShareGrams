import { useEffect, useState } from 'react';
import { importFromXmi } from '@sharegrams/uml-core';
import type { Command } from '@sharegrams/uml-core';
import { useCollabDispatchBatch } from '../../realtime/collabContext';

interface XmiImportDialogProps {
  file: File;
  onClose: () => void;
}

type Status = 'parsing' | 'ready' | 'empty' | 'error';

/**
 * A diferencia de la importación por imagen, leer y parsear el XMI no toca
 * el backend para nada: es determinista y local (packages/uml-core). Pero
 * aplicar el resultado sí es igual que en Fase 7: dispatchBatch manda los
 * comandos en orden, esperando la confirmación del servidor de cada uno
 * antes del siguiente (un ADD_ATTRIBUTE necesita que su CREATE_CLASS ya
 * esté confirmado -- mandarlos todos de una corría el riesgo de que el
 * servidor rechace uno por llegar antes que el comando del que depende).
 */
export function XmiImportDialog({ file, onClose }: XmiImportDialogProps) {
  const dispatchBatch = useCollabDispatchBatch();

  const [status, setStatus] = useState<Status>('parsing');
  const [message, setMessage] = useState('');
  const [commands, setCommands] = useState<Command[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    readXmiFile(file)
      .then((xmlText) => {
        if (cancelled) return;
        const result = importFromXmi(xmlText);
        setCommands(result.commands);
        setWarnings(result.warnings);
        setMessage(result.summary);
        setStatus(result.commands.some((c) => c.type === 'CREATE_CLASS') ? 'ready' : 'empty');
      })
      .catch(() => {
        if (cancelled) return;
        setMessage('No se pudo leer el archivo.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const handleConfirm = async () => {
    setApplying(true);
    const result = await dispatchBatch(commands);
    setApplying(false);
    if (result.error) {
      setApplyError(`${result.error} (se aplicaron ${result.appliedCount} de ${result.total}.)`);
      return;
    }
    onClose();
  };

  return (
    <div className="image-import__overlay" onClick={onClose}>
      <div className="image-import" onClick={(e) => e.stopPropagation()}>
        <header className="image-import__header">
          <h2>Importar diagrama desde XMI</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        {status === 'parsing' && <p>Leyendo el archivo…</p>}

        {(status === 'empty' || status === 'error') && (
          <>
            <p className="image-import__error">{message}</p>
            <button type="button" onClick={onClose}>
              Cerrar
            </button>
          </>
        )}

        {status === 'ready' && (
          <>
            <p>{message}</p>
            {warnings.length > 0 && (
              <ul className="image-import__warnings">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            )}
            {applyError && <p className="image-import__error">{applyError}</p>}
            <div className="image-import__actions">
              <button type="button" onClick={onClose} disabled={applying}>
                Descartar
              </button>
              <button type="button" onClick={handleConfirm} disabled={applying}>
                {applying ? 'Importando…' : 'Confirmar e importar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * El XMI de Enterprise Architect suele declarar encoding="windows-1252"
 * (ver la cabecera <?xml ...?>), no UTF-8. Leerlo con file.text() asumiría
 * UTF-8 y rompería acentos/ñ. La cabecera XML siempre es ASCII-segura, así
 * que se puede espiar para saber qué encoding usar antes de decodificar
 * el archivo completo.
 */
async function readXmiFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const peek = new TextDecoder('ascii').decode(buffer.slice(0, 200));
  const declaredEncoding = peek.match(/encoding=["']([^"']+)["']/i)?.[1];

  if (declaredEncoding) {
    try {
      return new TextDecoder(declaredEncoding).decode(buffer);
    } catch {
      // Encoding declarado pero no reconocido por el navegador: seguir a UTF-8 en vez de romper.
    }
  }
  return new TextDecoder('utf-8').decode(buffer);
}
