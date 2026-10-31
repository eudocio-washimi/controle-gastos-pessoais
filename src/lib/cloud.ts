// Sincronização dos cadastros entre aparelhos, pelo servidor (que guarda no banco de dados gratuito do Neon).
// O localStorage continua sendo a cópia de trabalho e o cache offline. Regra de conflito: vence a alteração mais
// recente de cada chave (a chave inteira, ex.: a lista toda de lançamentos previstos). Na primeira sincronização
// de um aparelho, o que já existe nele é juntado ao que está no servidor, sem perder nada.
import { request, serverUrl, isDevice } from './api.ts';
import { load, onSave, save } from './storage.ts';

export const SYNCED_KEYS = ['planned', 'overrides', 'limits', 'categoryOverrides', 'pluggyItemIds', 'projectionEstimates'];
const SYNCED = new Set(SYNCED_KEYS);

/** Horário (ms) da última alteração de cada chave neste aparelho. */
const META = 'syncMeta';
/** Este aparelho já juntou seus cadastros antigos aos do servidor. */
const MIGRATED = 'cloudMigrated';

interface Entry {
  value: unknown;
  updatedAt: number;
}
type Entries = Record<string, Entry>;

export interface CloudState {
  /** off: servidor sem banco de dados (ou, no Android, sem servidor configurado). */
  status: 'off' | 'syncing' | 'ok' | 'error';
  /** Última sincronização bem-sucedida. */
  at: number | null;
  message?: string;
}

interface Options {
  /** Chaves alteradas por dados que vieram do servidor (o app recarrega o estado delas). */
  onApplied: (keys: string[]) => void;
  onState: (s: CloudState) => void;
  /** Limpa o valor antigo do aparelho antes de juntá-lo ao servidor (ex.: tira os exemplos do modo demonstração). */
  clean: (key: string, value: unknown) => unknown;
}

let opts: Options | null = null;
let state: CloudState = { status: 'off', at: load<number | null>('cloudSyncedAt', null) };
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

const configured = () => !isDevice || Boolean(serverUrl());
const loadMeta = () => load<Record<string, number>>(META, {});

function setState(s: CloudState) {
  state = s;
  opts?.onState(s);
}

/** Valor da chave neste aparelho, ou `undefined` se nunca foi gravado. */
function local(key: string): unknown {
  return load<unknown>(key, undefined);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Junta o valor antigo do aparelho com o do servidor; em conflito vale o do servidor. */
function union(mine: unknown, theirs: unknown): unknown {
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const id = (x: unknown) => (isObj(x) && typeof x.id === 'string' ? x.id : JSON.stringify(x));
    const out = new Map(mine.map((x) => [id(x), x]));
    for (const x of theirs) out.set(id(x), x);
    return [...out.values()];
  }
  if (isObj(mine) && isObj(theirs)) return { ...mine, ...theirs };
  return theirs;
}

async function run() {
  const migrating = !load(MIGRATED, false);
  const meta = loadMeta();
  const outgoing = (keys: string[]): Entries =>
    Object.fromEntries(
      keys.filter((k) => meta[k] && local(k) !== undefined).map((k) => [k, { value: local(k), updatedAt: meta[k] }]),
    );

  // Já migrado: envia o que mudou aqui (o servidor guarda só se for mais novo). Migrando: primeiro só lê.
  let res = await request<{ enabled: boolean; entries: Entries }>('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ entries: migrating ? {} : outgoing(SYNCED_KEYS) }),
  });
  if (!res.enabled) return setState({ status: 'off', at: state.at });

  const applied: string[] = [];
  const adopt = (key: string, e: Entry) => {
    if (!same(local(key), e.value)) applied.push(key);
    save(key, e.value, true);
    meta[key] = e.updatedAt;
  };

  if (migrating) {
    const push: string[] = [];
    for (const key of SYNCED_KEYS) {
      const theirs = res.entries[key];
      const raw = local(key);
      const mine = raw === undefined ? undefined : opts?.clean(key, raw) ?? raw;
      if (mine === undefined) {
        if (theirs) adopt(key, theirs);
        continue;
      }
      const merged = theirs ? union(mine, theirs.value) : mine;
      if (theirs && same(merged, theirs.value)) {
        adopt(key, theirs);
        continue;
      }
      if (!same(merged, raw)) applied.push(key);
      save(key, merged, true);
      meta[key] = Date.now();
      push.push(key);
    }
    save(META, meta, true);
    if (push.length) {
      res = await request('/api/settings', { method: 'POST', body: JSON.stringify({ entries: outgoing(push) }) });
    }
    save(MIGRATED, true, true);
  } else {
    for (const [key, theirs] of Object.entries(res.entries)) {
      if (SYNCED.has(key) && theirs.updatedAt > (meta[key] ?? 0)) adopt(key, theirs);
    }
    save(META, meta, true);
  }

  const at = Date.now();
  save('cloudSyncedAt', at, true);
  setState({ status: 'ok', at });
  if (applied.length) opts?.onApplied(applied);
}

/** Sincroniza agora (ou logo depois da sincronização em andamento). Erros ficam no estado, não são lançados. */
export function syncCloud(): Promise<void> {
  if (!configured()) {
    setState({ status: 'off', at: state.at });
    return Promise.resolve();
  }
  if (running) {
    again = true;
    return running;
  }
  setState({ ...state, status: 'syncing' });
  running = run()
    .catch((e) => setState({ status: 'error', at: state.at, message: (e as Error).message }))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncCloud();
      }
    });
  return running;
}

/** Liga a sincronização: cada cadastro alterado neste aparelho é enviado ao servidor em seguida. */
export function startCloud(o: Options) {
  opts = o;
  o.onState(state);
  const off = onSave((key) => {
    if (!SYNCED.has(key)) return;
    save(META, { ...loadMeta(), [key]: Date.now() }, true);
    clearTimeout(timer);
    timer = setTimeout(() => void syncCloud(), 1500);
  });
  return () => {
    off();
    clearTimeout(timer);
    opts = null;
  };
}

/** Troca de servidor (Android): os cadastros do aparelho são juntados de novo aos do servidor. */
export function resetCloudMigration() {
  save(MIGRATED, false, true);
}
