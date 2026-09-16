import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { createProject, listProjects } from '../api/projects';
import { ApiError } from '../api/client';
import type { ProjectSummary } from '../api/types';

interface LocationState {
  message?: string;
}

export function ProjectsPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice] = useState<string | null>((location.state as LocationState | null)?.message ?? null);

  // Se limpia del historial apenas se lee, para que no reaparezca al volver con el botón "atrás".
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    // Solo debe correr una vez al montar: es una limpieza puntual del state de navegación, no una sincronización continua.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    listProjects(token)
      .then((data) => {
        if (cancelled) return;
        setProjects(data);
        setLoadStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los proyectos.');
        setLoadStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name || !token) return;

    setCreating(true);
    setError(null);
    try {
      const project = await createProject(token, name);
      setProjects((prev) => [project, ...prev]);
      setNewProjectName('');
      const firstDiagram = project.diagrams[0];
      if (firstDiagram) navigate(`/diagrams/${firstDiagram.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el proyecto.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="projects-page">
      {notice && <p className="projects-page__notice">{notice}</p>}
      <header className="projects-page__header">
        <h1>Proyectos</h1>
        <div className="projects-page__user">
          <span>{user?.name ?? user?.email}</span>
          <button type="button" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <form className="projects-page__create" onSubmit={handleCreate}>
        <input
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="Nombre del nuevo proyecto"
        />
        <button type="submit" disabled={creating || !newProjectName.trim()}>
          {creating ? 'Creando…' : 'Crear proyecto'}
        </button>
      </form>

      {loadStatus === 'loading' && <p>Cargando…</p>}
      {error && <p className="projects-page__error">{error}</p>}

      {loadStatus === 'ready' && projects.length === 0 && (
        <p className="projects-page__empty">Todavía no tenés proyectos. Creá el primero arriba.</p>
      )}

      <ul className="projects-page__list">
        {projects.map((project) => (
          <li key={project.id} className="projects-page__project">
            <strong>{project.name}</strong>
            <ul className="projects-page__diagrams">
              {project.diagrams.map((diagram) => (
                <li key={diagram.id}>
                  <Link to={`/diagrams/${diagram.id}`}>{diagram.name}</Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
