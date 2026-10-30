import { Download, KeyRound, Link2, LogOut, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { api, downloadAndroidApk, isDevice, logout, saveDeviceCredentials, type Status } from '../lib/api.ts';
import type { ItemInfo } from '../lib/types.ts';

// Tema e conexão com o Pluggy sobrevivem à limpeza dos dados locais.
const KEEP_ON_RESET = ['cg:theme', 'cg:token', 'cg:pluggyCredentials', 'cg:pluggyItemIds'];

export default function SettingsPage() {
  const { sync, payload } = useApp();
  const [status, setStatus] = useState<Status | null>(null);
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
      Object.keys(localStorage).filter((k) => k.startsWith('cg:') && !KEEP_ON_RESET.includes(k)).forEach((k) => localStorage.removeItem(k));
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
            <li>Credenciais{isDevice ? '' : ' (PLUGGY_CLIENT_ID / SECRET)'}: <b>{status.credentials ? 'configuradas' : 'não configuradas'}</b></li>
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
        {status && !status.credentials && status.mode === 'server' && (
          <p className="mt-3 text-sm text-[var(--ink-2)]">
            Para usar seus dados reais, defina <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code> (obtidos em dashboard.pluggy.ai) no arquivo <code>.env</code> (uso local) ou nas variáveis de ambiente da hospedagem, e reinicie o servidor.
          </p>
        )}
      </div>

      {isDevice && (
        <DeviceCredentials
          configured={!!status?.credentials}
          onSaved={async () => {
            await refresh();
            await sync();
          }}
        />
      )}

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
                <span className="chip bg-black/5 text-[var(--ink-2)] dark:bg-white/10">no servidor</span>
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

      {status?.androidApk && <AndroidDownload />}

      <div className="card">
        <div className="card-title">Dados locais</div>
        <p className="card-sub mt-1">
          Lançamentos previstos, limites, categorias personalizadas e o último sincronismo ficam salvos {isDevice ? 'neste aparelho' : 'neste navegador'}, permitindo usar o app offline.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-outline text-[var(--critical)]" onClick={resetLocal}>
            <Trash2 size={16} /> Limpar dados locais
          </button>
          {status?.auth && (
            <button
              className="btn-outline"
              onClick={() => {
                logout();
                location.reload();
              }}
            >
              <LogOut size={16} /> Sair
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceCredentials({ configured, onSaved }: { configured: boolean; onSaved: () => Promise<void> }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (creds: { clientId: string; clientSecret: string } | null, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await saveDeviceCredentials(creds);
      setClientId('');
      setClientSecret('');
      setMsg({ ok: true, text: ok });
      await onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">Credenciais do Pluggy</div>
      <p className="card-sub mt-1">
        Obtenha o Client ID e o Client Secret em dashboard.pluggy.ai. Eles ficam guardados só neste aparelho e são usados para falar direto com o Pluggy.
      </p>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }, 'Credenciais válidas e salvas.');
        }}
      >
        <input className="input font-mono" placeholder="Client ID" autoComplete="off" value={clientId} onChange={(e) => setClientId(e.target.value)} />
        <input className="input font-mono" placeholder="Client Secret" type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !clientId.trim() || !clientSecret.trim()}>
            <KeyRound size={16} /> {configured ? 'Trocar credenciais' : 'Salvar'}
          </button>
          {configured && (
            <button
              type="button"
              className="btn-outline text-[var(--critical)]"
              disabled={busy}
              onClick={() => confirm('Apagar as credenciais deste aparelho? O app volta ao modo demonstração.') && void run(null, 'Credenciais apagadas.')}
            >
              <Trash2 size={16} /> Apagar
            </button>
          )}
        </div>
      </form>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-[var(--good-text)]' : 'text-[var(--critical)]'}`}>{msg.text}</p>}
    </div>
  );
}

function AndroidDownload() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const download = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await downloadAndroidApk();
      setMsg({ ok: true, text: 'Download iniciado. Abra o arquivo meus-gastos.apk para instalar.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
          <Smartphone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="card-title">App para Android</div>
          <p className="card-sub mt-1">
            Baixe e instale no celular (o Android vai pedir para permitir “instalar apps desconhecidos”). No app, informe o Client ID e o Client
            Secret do Pluggy em Configurações e cadastre suas conexões e o salário: os dados do app ficam no celular.
          </p>
        </div>
      </div>
      <button className="btn-primary mt-3" onClick={() => void download()} disabled={busy}>
        <Download size={16} /> {busy ? 'Baixando…' : 'Baixar app Android (4 MB)'}
      </button>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-[var(--good-text)]' : 'text-[var(--critical)]'}`}>{msg.text}</p>}
    </div>
  );
}
