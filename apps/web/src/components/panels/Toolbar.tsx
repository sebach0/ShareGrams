import { useRef, useState } from 'react';
import { generateId, exportToXmi } from '@sharegrams/uml-core';
import { useUmlStore } from '../../store/useUmlStore';
import { useCollabDispatch, useIsReadOnly } from '../../realtime/collabContext';
import { ImageImportDialog } from '../image-import/ImageImportDialog';
import { XmiImportDialog } from '../xmi-import/XmiImportDialog';

function nextClassName(existingNames: string[]): string {
  const normalized = existingNames.map((n) => n.toLowerCase());
  let index = existingNames.length + 1;
  while (normalized.includes(`clase${index}`)) index += 1;
  return `Clase${index}`;
}

function downloadXmi(xml: string, fileName: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

interface ToolbarProps {
  diagramId: string;
  diagramName: string;
}

export function Toolbar({ diagramId, diagramName }: ToolbarProps) {
  const model = useUmlStore((s) => s.model);
  const selection = useUmlStore((s) => s.selection);
  const dispatch = useCollabDispatch();
  const select = useUmlStore((s) => s.select);
  const readOnly = useIsReadOnly();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const xmiInputRef = useRef<HTMLInputElement>(null);
  const [importXmiFile, setImportXmiFile] = useState<File | null>(null);

  const handleAddClass = () => {
    const name = nextClassName(model.classes.map((c) => c.name));
    dispatch({
      type: 'CREATE_CLASS',
      classId: generateId(),
      name,
      position: { x: 80 + model.classes.length * 40, y: 80 + model.classes.length * 40 },
    });
  };

  const handleDeleteSelection = () => {
    if (!selection) return;
    if (selection.kind === 'class') {
      dispatch({ type: 'DELETE_CLASS', classId: selection.id });
    } else {
      dispatch({ type: 'DELETE_RELATIONSHIP', relationshipId: selection.id });
    }
    select(null);
  };

  // Exportar es de solo lectura: no pasa por el dispatch colaborativo, así que
  // un VIEWER también puede hacerlo -- a diferencia de todo lo demás acá.
  const handleExportXmi = () => {
    const xml = exportToXmi(model, diagramName || 'ShareGrams');
    downloadXmi(xml, `${diagramName || 'diagrama'}.xmi`);
  };

  return (
    <header className="toolbar">
      <span className="toolbar__brand">ShareGrams</span>
      <button type="button" onClick={handleAddClass} disabled={readOnly}>
        + Clase
      </button>
      <button type="button" onClick={handleDeleteSelection} disabled={readOnly || !selection}>
        Eliminar seleccionado
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setImportFile(file);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={readOnly}>
        📷 Importar imagen
      </button>
      <input
        ref={xmiInputRef}
        type="file"
        accept=".xmi,.xml,application/xml,text/xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setImportXmiFile(file);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={() => xmiInputRef.current?.click()} disabled={readOnly}>
        📄 Importar XMI
      </button>
      <button type="button" onClick={handleExportXmi} disabled={model.classes.length === 0}>
        ⬇ Exportar XMI
      </button>
      {readOnly && <span className="toolbar__readonly">Solo lectura</span>}
      {importFile && (
        <ImageImportDialog diagramId={diagramId} file={importFile} onClose={() => setImportFile(null)} />
      )}
      {importXmiFile && <XmiImportDialog file={importXmiFile} onClose={() => setImportXmiFile(null)} />}
    </header>
  );
}
