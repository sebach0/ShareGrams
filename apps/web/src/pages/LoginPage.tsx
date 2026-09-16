import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await login(email, password);
    if (ok) navigate('/projects');
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Iniciar sesión</h1>
        <label className="auth-form__field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="auth-form__field">
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="auth-form__error">{error}</p>}
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p className="auth-form__hint">
          ¿No tenés cuenta? <Link to="/register">Registrate</Link>
        </p>
      </form>
    </div>
  );
}
