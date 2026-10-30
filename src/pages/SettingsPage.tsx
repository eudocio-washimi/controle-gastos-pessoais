import { Link2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { api } from '../lib/api.ts';
import type { ItemInfo } from '../lib/types.ts';

export default function SettingsPage() {
  const { sync, payload } = useApp();
  const [status, setStatus] = useState<{ credentials: boolean; items: number; demo: boolean } | null>(null);
  const [items, setItems] = useState<ItemInfo[]>([]);
  const [newId, setNewId] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await api.status());
      setItems(await api.items());
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.addItem(newId.trim());
      setNewId('');
      setMsg({ ok: true, text: 'Conexão adicionada. Sincronizando…' });
      await refresh();
      await sync();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remover esta conexão do app? (Ela continua existindo no Pluggy.)')) return;
    await api.removeItem(id);
    await refresh();
    await sync();
  };

  const resetLocal = () => {
    if (!confirm('Apagar lançamentos previstos, limites e categorias personalizadas deste dispositivo?')) return;
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('cg:') && k !== 'cg:theme').forEach((k) => localStorage.removeItem(k));
    } catch {
      /* sem armazenamento */
    }
    location.reload();
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-title">Status da integração com o Pluggy</div>
        {status ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>Credenciais (PLUGGY_CLIENT_ID / SECRET): <b>{status.credentials ? 'configuradas' : 'não configuradas'}</b></li>
            <li>Conexões bancárias (items): <b>{status.items}</b></li>
            <li>Modo: <b>{status.demo ? 'demonstração (dados fictícios)' : 'dados reais do Pluggy'}</b></li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">Servidor indisponível — o app está usando os dados salvos.</p>
        )}
        {payload?.errors?.length ? (
          <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            {payload.errors.map((e) => <div key={e}>{e}</div>)}
          </div>
        ) : null}
        {status && !status.credentials && (
          <p className="mt-3 text-sm text-[var(--ink-2)]">
            Para usar seus dados reais, crie um arquivo <code>.env</code> na raiz do projeto com <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code> (obtidos em dashboard.pluggy.ai) e reinicie o servidor.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-title">Conexões bancárias</div>
        <p className="card-sub mt-1">
          Cada banco conectado no Pluggy gera um <i>item</i>. Cole aqui o ID do item (UUID) criado pelo Pluggy Connect ou pelo dashboard.
        </p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input className="input flex-1 font-mono" placeholder="00000000-0000-0000-0000-000000000000" value={newId} onChange={(e) => setNewId(e.target.value)} />
          <button className="btn-primary" disabled={busy || !newId.trim() || !status?.credentials}>
            <Link2 size={16} /> Adicionar
          </button>
        </form>
        {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-[var(--good-text)]' : 'text-[var(--critical)]'}`}>{msg.text}</p>}
        <div className="mt-3 divide-y divide-black/5 dark:divide-white/10">
          {items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{i.institution}</div>
                <div className="truncate font-mono text-xs text-[var(--muted)]">{i.id} · {i.status}</div>
              </div>
              {i.source === 'env' ? (
                <span className="chip bg-black/5 text-[var(--ink-2)] dark:bg-white/10">via .env</span>
              ) : (
                <button className="btn-ghost !p-1.5 text-[var(--critical)]" onClick={() => void remove(i.id)} aria-label="Remover">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          {!items.length && <Empty>Nenhuma conexão cadastrada.</Empty>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Dados locais</div>
        <p className="card-sub mt-1">
          Lançamentos previstos, limites, categorias personalizadas e o último sincronismo ficam salvos neste navegador, permitindo usar o app offline.
        </p>
        <button className="btn-outline mt-3 text-[var(--critical)]" onClick={resetLocal}>
          <Trash2 size={16} /> Limpar dados locais
        </button>
      </div>
    </div>
  );
}
