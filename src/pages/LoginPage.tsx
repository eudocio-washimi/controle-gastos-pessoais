import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { login } from '../lib/api.ts';

/** Mostrada quando o servidor está protegido por APP_PASSWORD e este navegador ainda não entrou. */
export default function LoginPage() {
  const { sync } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(password);
      await sync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        className="card w-full max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-bold tracking-tight">Meus Gastos</span>
        </div>
        <label className="text-sm font-medium" htmlFor="password">Senha de acesso</label>
        <input
          id="password"
          className="input mt-1 w-full"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-[var(--critical)]">{error}</p>}
        <button className="btn-primary mt-4 w-full justify-center" disabled={busy || !password}>
          <LogIn size={16} /> {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
