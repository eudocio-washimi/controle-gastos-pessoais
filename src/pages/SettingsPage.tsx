import { Cloud, Download, KeyRound, Link2, LogOut, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { api, connectServer, downloadAndroidApk, isDevice, logout, saveDeviceCredentials, serverUrl, type Status } from '../lib/api.ts';
import { resetCloudMigration } from '../lib/cloud.ts';
import type { ItemInfo } from '../lib/types.ts';

// Tema, conexão com o Pluggy e com o servidor sobrevivem à limpeza dos dados locais.
const KEEP_ON_RESET = ['cg:theme', 'cg:token', 'cg:pluggyCredentials', 'cg:pluggyItemIds', 'cg:serverUrl'];

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
    if (!confirm('Apagar lançamentos previstos, limites e categorias personalizadas deste dispositivo? (Os guardados no servidor voltam na próxima sincronização.)')) return;
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

      <CloudSync />

      {status?.androidApk && <AndroidDownload />}

      <div className="card">
        <div className="card-title">Dados locais</div>
        <p className="card-sub mt-1">
          Lançamentos previstos, limites, categorias personalizadas e o último sincronismo ficam salvos {isDevice ? 'neste aparelho' : 'neste navegador'}, permitindo usar o app offline. Com a sincronização entre aparelhos ligada, eles também ficam no servidor.
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
            Secret do Pluggy e, em “Sincronização entre aparelhos”, o endereço deste site e a senha: os cadastros feitos aqui aparecem no celular.
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

function CloudSync() {
  const { cloud, sync } = useApp();
  const [url, setUrl] = useState(serverUrl);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = isDevice ? Boolean(serverUrl()) : true;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setPassword('');
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      await connectServer(url, password);
      setUrl(serverUrl());
      // Os cadastros deste aparelho são juntados aos do servidor.
      resetCloudMigration();
      await sync();
    }, 'Conectado. Os cadastros deste aparelho foram juntados aos do servidor.');

  const disconnect = () =>
    confirm('Parar de sincronizar este aparelho? Os cadastros continuam salvos aqui e no servidor.') &&
    void run(async () => {
      await connectServer(null);
      setUrl('');
      await sync();
    }, 'Sincronização desligada neste aparelho.');

  const when = cloud.at ? new Date(cloud.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const statusText =
    cloud.status === 'syncing'
      ? 'sincronizando…'
      : cloud.status === 'ok'
        ? `em dia (${when})`
        : cloud.status === 'error'
          ? `erro: ${cloud.message}${when ? ` — última vez em ${when}` : ''}`
          : 'desligada';

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-sky-500/10 p-2 text-sky-600 dark:text-sky-400">
          <Cloud size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="card-title">Sincronização entre aparelhos</div>
          <p className="card-sub mt-1">
            Lançamentos previstos, limites, categorias e conexões bancárias ficam guardados no servidor e aparecem no PC e no celular. Se o
            mesmo cadastro for alterado em dois aparelhos, vale a alteração mais recente.
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm">
        Situação: <b>{statusText}</b>
      </p>
      {!isDevice && cloud.status === 'off' && (
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Para ligar, crie um banco gratuito em neon.tech e defina <code>DATABASE_URL</code> nas variáveis de ambiente do servidor (veja o README).
        </p>
      )}
      {isDevice && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <input
            className="input font-mono"
            placeholder="https://meus-gastos.onrender.com"
            autoComplete="off"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input className="input" placeholder="Senha do site (APP_PASSWORD)" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy || !url.trim()}>
              <Link2 size={16} /> {busy ? 'Conectando…' : connected ? 'Reconectar' : 'Conectar'}
            </button>
            {connected && (
              <button type="button" className="btn-outline text-[var(--critical)]" disabled={busy} onClick={disconnect}>
                <Trash2 size={16} /> Desconectar
              </button>
            )}
          </div>
        </form>
      )}
      {connected && (
        <button className="btn-outline mt-3" disabled={busy || cloud.status === 'syncing'} onClick={() => void run(sync, 'Sincronizado.')}>
          <RefreshCw size={16} /> Sincronizar agora
        </button>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-[var(--good-text)]' : 'text-[var(--critical)]'}`}>{msg.text}</p>}
      {isDevice && <p className="mt-2 text-xs text-[var(--muted)]">No plano gratuito do Render o servidor pode levar cerca de 1 minuto para acordar.</p>}
    </div>
  );
}
