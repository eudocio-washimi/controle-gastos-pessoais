import { Capacitor } from '@capacitor/core';
import { buildDemoData } from '../../shared/demo.ts';
import { getItem, setPluggyCredentials, syncFromPluggy, testCredentials, type PluggyCredentials } from '../../shared/pluggy.ts';
import { load, save } from './storage.ts';
import type { ItemInfo, SyncPayload } from './types.ts';

/** No app Android não há servidor: o próprio aparelho conversa com o Pluggy. */
export const isDevice = Capacitor.isNativePlatform();

export interface Status {
  credentials: boolean;
  items: number;
  demo: boolean;
  /** server: credenciais no .env do servidor; device: credenciais salvas neste aparelho. */
  mode: 'server' | 'device';
  /** Servidor protegido por senha (APP_PASSWORD). */
  auth?: boolean;
  /** O servidor tem o APK do app Android para baixar. */
  androidApk?: boolean;
}

/** O servidor está protegido por senha e o token salvo não vale (ou não existe). */
export class AuthError extends Error {}

// Nos dois modos a lista de items (conexões bancárias) adicionados pelo app fica salva aqui.
const loadItemIds = () => load<string[]>('pluggyItemIds', []);

/**
 * Endereço do servidor. No navegador é o próprio site; no Android é o servidor (Render) configurado em
 * Configurações, usado só para os cadastros compartilhados — o Pluggy continua sendo chamado direto do aparelho.
 */
export const serverUrl = () => (isDevice ? load<string>('serverUrl', '') : '');

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = load<string | null>('token', null);
  const res = await fetch(serverUrl() + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  const message = (body as { error?: string }).error ?? `Erro ${res.status}`;
  if (res.status === 401 && path !== '/api/login') throw new AuthError(message);
  if (!res.ok) throw new Error(message);
  return body as T;
}

const withItems = (path: string) => `${path}?items=${encodeURIComponent(loadItemIds().join(','))}`;

const serverApi = {
  status: async () => ({ ...(await request<Omit<Status, 'mode'>>(withItems('/api/status'))), mode: 'server' as const }),
  sync: () => request<SyncPayload>(withItems('/api/sync')),
  items: () => request<ItemInfo[]>(withItems('/api/items')),
  addItem: async (raw: string) => {
    const id = raw.trim();
    await request<{ ok: true }>('/api/items/validate', { method: 'POST', body: JSON.stringify({ id }) });
    save('pluggyItemIds', [...new Set([...loadItemIds(), id])]);
    return { ok: true as const };
  },
  removeItem: async (id: string) => {
    save('pluggyItemIds', loadItemIds().filter((x) => x !== id));
    return { ok: true as const };
  },
};

/** Entra no servidor protegido por senha (APP_PASSWORD) e guarda o token neste navegador. */
export async function login(password: string) {
  const { token } = await request<{ token: string | null }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
  save('token', token);
}

/** Baixa o APK do app Android. O token vai no cabeçalho (não na URL), por isso o download passa por um blob. */
export async function downloadAndroidApk() {
  const token = load<string | null>('token', null);
  const res = await fetch('/api/download/android', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401) throw new AuthError('Faça login para continuar.');
  if (!res.ok) throw new Error(`Erro ${res.status} ao baixar o APK`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'meus-gastos.apk';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function logout() {
  save('token', null);
}

/** Só no app Android: liga o aparelho ao servidor que guarda os cadastros (`null` desliga). */
export async function connectServer(url: string | null, password = '') {
  if (!url) {
    save('serverUrl', '');
    save('token', null);
    return;
  }
  let base = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  const previous = { url: load<string>('serverUrl', ''), token: load<string | null>('token', null) };
  save('serverUrl', base);
  try {
    await login(password);
    const s = await request<{ auth?: unknown }>('/api/status');
    if (typeof s.auth !== 'boolean') throw new Error('Esse endereço não é o servidor do Meus Gastos.');
  } catch (e) {
    save('serverUrl', previous.url);
    save('token', previous.token);
    throw e instanceof TypeError ? new Error(`Servidor não encontrado em ${base}.`) : e;
  }
}

// --- Modo aparelho (Android) ---

const loadCredentials = () => load<PluggyCredentials | null>('pluggyCredentials', null);

function withCredentials(): boolean {
  setPluggyCredentials(loadCredentials());
  return loadCredentials() !== null;
}

const deviceApi = {
  status: async (): Promise<Status> => {
    const credentials = withCredentials();
    const items = loadItemIds().length;
    return { credentials, items, demo: !credentials || items === 0, mode: 'device' };
  },
  sync: async (): Promise<SyncPayload> =>
    withCredentials() && loadItemIds().length ? syncFromPluggy(loadItemIds()) : buildDemoData(),
  items: async (): Promise<ItemInfo[]> => {
    if (!withCredentials()) return [];
    return Promise.all(
      loadItemIds().map(async (id): Promise<ItemInfo> => {
        try {
          const item = await getItem(id);
          return { id, institution: item.connector.name, status: item.status, source: 'app' };
        } catch (e) {
          return { id, institution: '—', status: `Erro: ${(e as Error).message}`, source: 'app' };
        }
      }),
    );
  },
  addItem: async (raw: string) => {
    const id = raw.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('ID de item inválido (esperado UUID).');
    if (!withCredentials()) throw new Error('Informe o Client ID e o Client Secret do Pluggy primeiro.');
    try {
      await getItem(id);
    } catch (e) {
      throw new Error(`Item não encontrado no Pluggy: ${(e as Error).message}`);
    }
    save('pluggyItemIds', [...new Set([...loadItemIds(), id])]);
    return { ok: true as const };
  },
  removeItem: async (id: string) => {
    save('pluggyItemIds', loadItemIds().filter((x) => x !== id));
    return { ok: true as const };
  },
};

export const api = isDevice ? deviceApi : serverApi;

/** Só no app Android: salva (e valida) as credenciais do Pluggy no aparelho. `null` apaga. */
export async function saveDeviceCredentials(c: PluggyCredentials | null) {
  if (c) {
    setPluggyCredentials(c);
    try {
      await testCredentials();
    } catch (e) {
      setPluggyCredentials(loadCredentials());
      throw e;
    }
  }
  save('pluggyCredentials', c);
  setPluggyCredentials(c);
}
