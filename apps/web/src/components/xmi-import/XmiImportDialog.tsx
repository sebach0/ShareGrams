import { useEffect, useState } from 'react';
import { importFromXmi } from '@sharegrams/uml-core';
import type { Command } from '@sharegrams/uml-core';
import { useCollabDispatch } from '../../realtime/collabContext';

interface XmiImportDialogProps {
  file: File;
  onClose: () => void;
}

type Status = 'parsing' | 'ready' | 'empty' | 'error';

/**
 * A diferencia de la importación por imagen, esto no toca el backend para
 * nada: parsear XMI es determinista y local (packages/uml-core). Mismo
 * criterio de vista previa igual: recién al confirmar se despachan los
 * comandos con el dispatch normal del editor.
 */
export function XmiImportDialog({ file, onClose }: XmiImportDialogProps) {
  const dispatch = useCollabDispatch();

  const [status, setStatus] = useState<Status>('parsing');
  const [message, setMessage] = useState('');
  const [commands, setCommands] = useState<Command[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

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

  const handleConfirm = () => {
    setApplying(true);
    for (const command of commands) {
      dispatch(command);
    }
    setApplying(false);
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
