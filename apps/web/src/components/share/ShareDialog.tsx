import { useEffect, useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { inviteMember, listMembers, removeMember, updateMemberRole } from '../../api/projects';
import { ApiError } from '../../api/client';
import type { ProjectMember, ProjectRole } from '../../api/types';

interface ShareDialogProps {
  projectId: string;
  onClose: () => void;
}

export function ShareDialog({ projectId, onClose }: ShareDialogProps) {
  const token = useAuthStore((s) => s.token);

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('EDITOR');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!token) return;
    listMembers(token, projectId)
      .then((data) => {
        setMembers(data);
        setLoadStatus('ready');
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los colaboradores.');
        setLoadStatus('error');
      });
  }, [token, projectId]);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !email.trim()) return;

    setInviting(true);
    setError(null);
    try {
      const member = await inviteMember(token, projectId, email.trim(), role);
      setMembers((prev) => [...prev.filter((m) => m.userId !== member.userId), member]);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo invitar a ese email.');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberUserId: string, newRole: ProjectRole) => {
    if (!token) return;
    try {
      const updated = await updateMemberRole(token, projectId, memberUserId, newRole);
      setMembers((prev) => prev.map((m) => (m.userId === memberUserId ? updated : m)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el rol.');
    }
  };

  const handleRemove = async (memberUserId: string) => {
    if (!token) return;
    try {
      await removeMember(token, projectId, memberUserId);
      setMembers((prev) => prev.filter((m) => m.userId !== memberUserId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar al colaborador.');
    }
  };

  return (
    <div className="share-dialog__overlay" onClick={onClose}>
      <div className="share-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="share-dialog__header">
          <h2>Compartir proyecto</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <form className="share-dialog__invite" onSubmit={handleInvite}>
          <input
            type="email"
            placeholder="Email de la persona a invitar"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Lector</option>
          </select>
          <button type="submit" disabled={inviting || !email.trim()}>
            {inviting ? 'Invitando…' : 'Invitar'}
          </button>
        </form>

        {error && <p className="share-dialog__error">{error}</p>}
        {loadStatus === 'loading' && <p>Cargando colaboradores…</p>}

        <ul className="share-dialog__members">
          {members.map((member) => (
            <li key={member.id} className="share-dialog__member">
              <span className="share-dialog__member-name">{member.user.name ?? member.user.email}</span>
              <select value={member.role} onChange={(e) => handleRoleChange(member.userId, e.target.value as ProjectRole)}>
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Lector</option>
              </select>
              <button type="button" onClick={() => handleRemove(member.userId)}>
                Quitar
              </button>
            </li>
          ))}
        </ul>

        {loadStatus === 'ready' && members.length === 0 && (
          <p className="share-dialog__empty">Todavía no invitaste a nadie.</p>
        )}
      </div>
    </div>
  );
}
