import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await register(email, password, name || undefined);
    if (ok) navigate('/projects');
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Crear cuenta</h1>
        <label className="auth-form__field">
          Nombre (opcional)
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="auth-form__field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="auth-form__field">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="auth-form__error">{error}</p>}
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
        <p className="auth-form__hint">
          ¿Ya tenés cuenta? <Link to="/login">Iniciá sesión</Link>
        </p>
      </form>
    </div>
  );
}
