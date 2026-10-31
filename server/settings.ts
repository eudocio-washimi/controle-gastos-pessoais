import pg from 'pg';

// Cadastros do app (lançamentos previstos, limites, categorias, conexões...) guardados num Postgres gratuito (Neon),
// para aparecerem em todos os aparelhos. Cada chave guarda o valor inteiro e o horário da última alteração:
// vale sempre a versão mais recente de cada chave.

export interface SettingEntry {
  value: unknown;
  /** Horário (ms) em que a chave foi alterada no aparelho de origem. */
  updatedAt: number;
}

export type SettingEntries = Record<string, SettingEntry>;

const SYNCED_KEYS = new Set(['planned', 'overrides', 'limits', 'categoryOverrides', 'pluggyItemIds', 'projectionEstimates']);

const url = process.env.DATABASE_URL ?? '';
const pool = url ? new pg.Pool({ connectionString: url, max: 3 }) : null;
let ready: Promise<void> | null = null;

export const hasDatabase = () => pool !== null;

function db() {
  if (!pool) throw new Error('DATABASE_URL não configurada no servidor.');
  ready ??= pool
    .query('CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at bigint NOT NULL)')
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready.then(() => pool);
}

/** Grava as chaves recebidas que forem mais novas que as do banco e devolve tudo o que está guardado. */
export async function mergeSettings(entries: SettingEntries): Promise<SettingEntries> {
  const conn = await db();
  for (const [key, e] of Object.entries(entries)) {
    if (!SYNCED_KEYS.has(key) || !Number.isFinite(e?.updatedAt) || e.value === undefined) continue;
    await conn.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
       WHERE app_settings.updated_at < EXCLUDED.updated_at`,
      [key, JSON.stringify(e.value), Math.trunc(e.updatedAt)],
    );
  }
  const { rows } = await conn.query<{ key: string; value: unknown; updated_at: string }>('SELECT key, value, updated_at FROM app_settings');
  return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updatedAt: Number(r.updated_at) }]));
}
