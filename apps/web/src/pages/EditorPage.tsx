import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { DiagramCanvas } from '../components/canvas/DiagramCanvas';
import { Inspector } from '../components/panels/Inspector';
import { Toolbar } from '../components/panels/Toolbar';
import { ShareDialog } from '../components/share/ShareDialog';
import { AssistantChat } from '../components/assistant/AssistantChat';
import { useUmlStore } from '../store/useUmlStore';
import { useAuthStore } from '../store/useAuthStore';
import { getDiagram } from '../api/diagrams';
import { ApiError } from '../api/client';
import { CollabProvider } from '../realtime/CollabProvider';
import { useCollabRole, useCollabStatus } from '../realtime/collabContext';
import '../App.css';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * Envuelve EditorPage con key={diagramId}: al navegar entre diagramas
 * (mismo patrón de ruta, distinto param) React Router no desmonta el
 * componente por sí solo, así que forzamos el remount para que todo el
 * estado local (loadStatus, socket de colaboración, etc.) arranque limpio.
 */
export function EditorPageRoute() {
  const { diagramId } = useParams<{ diagramId: string }>();
  return <EditorPage key={diagramId} diagramId={diagramId} />;
}

function EditorPage({ diagramId }: { diagramId: string | undefined }) {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const loadModel = useUmlStore((s) => s.loadModel);
  const syncSavedModel = useUmlStore((s) => s.syncSavedModel);

  const [diagramName, setDiagramName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!diagramId || !token) return;
    let cancelled = false;

    getDiagram(token, diagramId)
      .then((diagram) => {
        if (cancelled) return;
        loadModel(diagram.model);
        setDiagramName(diagram.name);
        setProjectId(diagram.projectId);
        setLoadStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar el diagrama.');
        setLoadStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [diagramId, token, loadModel]);

  // Si el servidor rechaza un comando propio por conflicto, o llega un comando
  // remoto que ya no aplica localmente, la salida honesta es traer el estado
  // real del servidor en vez de intentar adivinar cómo reconciliar a mano.
  const resync = useCallback(() => {
    if (!diagramId || !token) return;
    getDiagram(token, diagramId)
      .then((diagram) => syncSavedModel(diagram.model))
      .catch(() => {
        /* si ni el resync funciona, el indicador de conexión ya lo refleja */
      });
  }, [diagramId, token, syncSavedModel]);

  const handleAccessRevoked = useCallback(() => {
    navigate('/projects', { state: { message: 'El dueño del proyecto te quitó el acceso a este diagrama.' } });
  }, [navigate]);

  if (loadStatus === 'loading') {
    return <p className="editor-page__status">Cargando diagrama…</p>;
  }
  if (loadStatus === 'error') {
    return <p className="editor-page__status editor-page__status--error">{loadError}</p>;
  }
  if (!diagramId || !token || !projectId) {
    return null;
  }

  return (
    <CollabProvider
      diagramId={diagramId}
      token={token}
      onOutOfSync={resync}
      onAccessRevoked={handleAccessRevoked}
    >
      <ReactFlowProvider>
        <div className="app-layout">
          <header className="editor-header">
            <button type="button" onClick={() => navigate('/projects')}>
              ← Proyectos
            </button>
            <span className="editor-header__name">{diagramName}</span>
            <RoleBadge />
            <ConnectionBadge />
            <ShareButton onOpen={() => setShareOpen(true)} />
          </header>
          <Toolbar />
          <div className="app-layout__body">
            <DiagramCanvas />
            <Inspector />
            <AssistantChat />
          </div>
        </div>
      </ReactFlowProvider>
      {shareOpen && <ShareDialog projectId={projectId} onClose={() => setShareOpen(false)} />}
    </CollabProvider>
  );
}

const STATUS_LABEL: Record<ReturnType<typeof useCollabStatus>, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
};

function ConnectionBadge() {
  const status = useCollabStatus();
  return <span className={`editor-header__status editor-header__status--${status}`}>{STATUS_LABEL[status]}</span>;
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Dueño',
  EDITOR: 'Editor',
  VIEWER: 'Solo lectura',
};

function RoleBadge() {
  const role = useCollabRole();
  if (!role || role === 'OWNER') return null;
  return <span className="editor-header__role">{ROLE_LABEL[role]}</span>;
}

function ShareButton({ onOpen }: { onOpen: () => void }) {
  const role = useCollabRole();
  if (role !== 'OWNER') return null;
  return (
    <button type="button" onClick={onOpen}>
      Compartir
    </button>
  );
}
