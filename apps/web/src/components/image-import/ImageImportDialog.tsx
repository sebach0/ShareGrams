import { useEffect, useState } from 'react';
import type { Command } from '@sharegrams/uml-core';
import { recognizeImage } from '../../api/imageImport';
import { ApiError } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';
import { useCollabDispatch } from '../../realtime/collabContext';

interface ImageImportDialogProps {
  diagramId: string;
  file: File;
  onClose: () => void;
}

type Status = 'recognizing' | 'ready' | 'unreadable' | 'error';

/**
 * Reconoce la imagen apenas se abre (elegir el archivo ya es la acción del
 * usuario) y muestra una vista previa -- nunca aplica nada solo. Recién al
 * confirmar se despachan los comandos, uno por uno, con el mismo
 * useCollabDispatch que usa el resto del editor: mismo control de rol,
 * misma validación, misma retransmisión a la sala.
 */
export function ImageImportDialog({ diagramId, file, onClose }: ImageImportDialogProps) {
  const token = useAuthStore((s) => s.token);
  const dispatch = useCollabDispatch();

  const [status, setStatus] = useState<Status>('recognizing');
  const [message, setMessage] = useState('');
  const [commands, setCommands] = useState<Command[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    recognizeImage(token, diagramId, file)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setCommands(result.commands);
          setWarnings(result.warnings);
          setMessage(result.summary);
          setStatus(result.commands.length > 0 ? 'ready' : 'unreadable');
        } else {
          setMessage(result.message);
          setStatus(result.reason === 'unreadable' ? 'unreadable' : 'error');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(err instanceof ApiError ? err.message : 'No se pudo reconocer la imagen.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, diagramId, file]);

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
          <h2>Importar diagrama desde imagen</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        {status === 'recognizing' && <p>Reconociendo el diagrama…</p>}

        {(status === 'unreadable' || status === 'error') && (
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
