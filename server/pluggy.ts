import type { Account, Bill, SyncPayload, Transaction } from '../shared/types.ts';

const BASE_URL = 'https://api.pluggy.ai';
// A API Key do Pluggy expira em 2h; renovamos com folga.
const API_KEY_TTL_MS = 100 * 60 * 1000;

let cachedKey: { value: string; expiresAt: number } | null = null;

export function hasCredentials(): boolean {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

async function getApiKey(): Promise<string> {
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey.value;
  const res = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Falha na autenticação com o Pluggy (${res.status})`);
  const { apiKey } = (await res.json()) as { apiKey: string };
  cachedKey = { value: apiKey, expiresAt: Date.now() + API_KEY_TTL_MS };
  return apiKey;
}

async function pluggyGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const doFetch = async () => fetch(url, { headers: { 'X-API-KEY': await getApiKey() } });
  let res = await doFetch();
  if (res.status === 401 || res.status === 403) {
    cachedKey = null;
    res = await doFetch();
  }
  if (!res.ok) throw new Error(`Pluggy GET ${url.pathname} → ${res.status}`);
  return (await res.json()) as T;
}

interface Paged<T> {
  results: T[];
}

/** GET /v2/transactions: paginação por cursor (`next`), filtro por `dateFrom`/`dateTo`. */
async function getAllByCursor<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 200; guard++) {
    const data: Paged<T> & { next?: string | null } = cursor?.startsWith('http') || cursor?.startsWith('/')
      ? await pluggyGet(cursor)
      : await pluggyGet(path, cursor ? { ...params, cursor } : params);
    all.push(...data.results);
    if (!data.next) break;
    cursor = data.next;
  }
  return all;
}

// Pelo MeuPluggy todo item vem com o conector "MeuPluggy"; o nome do banco sai do código COMPE da conta.
const BANKS: Record<string, { name: string; color: string }> = {
  '001': { name: 'Banco do Brasil', color: '#f8d117' },
  '033': { name: 'Santander', color: '#ec0000' },
  '041': { name: 'Banrisul', color: '#0d3f8f' },
  '077': { name: 'Inter', color: '#ff7a00' },
  '104': { name: 'Caixa', color: '#005ca9' },
  '197': { name: 'Stone', color: '#00a868' },
  '208': { name: 'BTG Pactual', color: '#0b2346' },
  '212': { name: 'Original', color: '#00a651' },
  '237': { name: 'Bradesco', color: '#cc092f' },
  '260': { name: 'Nubank', color: '#820ad1' },
  '290': { name: 'PagBank', color: '#00a868' },
  '323': { name: 'Mercado Pago', color: '#00b1ea' },
  '336': { name: 'C6 Bank', color: '#242424' },
  '341': { name: 'Itaú', color: '#ec7000' },
  '380': { name: 'PicPay', color: '#21c25e' },
  '403': { name: 'Cora', color: '#fe3e6d' },
  '422': { name: 'Safra', color: '#0b2c5a' },
  '655': { name: 'Neon', color: '#00a5f0' },
  '748': { name: 'Sicredi', color: '#3fa110' },
  '756': { name: 'Sicoob', color: '#003641' },
};

function institutionFor(item: PluggyItem, accounts: PluggyAccount[]): { name: string; color: string } {
  const fallbackColor = item.connector.primaryColor ? `#${item.connector.primaryColor.replace('#', '')}` : '#64748b';
  if (item.connector.name !== 'MeuPluggy') return { name: item.connector.name, color: fallbackColor };
  for (const a of accounts) {
    const code = a.bankData?.transferNumber?.split('/')[0]?.padStart(3, '0');
    if (code && BANKS[code]) return BANKS[code];
  }
  const bank = accounts.find((a) => a.type !== 'CREDIT') ?? accounts[0];
  const name = (bank?.name ?? 'Banco').replace(/\s*\(.*\)$/, '').split(/ - | S\.A\./)[0].trim();
  return { name: name.charAt(0).toUpperCase() + name.slice(1), color: fallbackColor };
}

// --- Tipos brutos do Pluggy (apenas os campos usados) ---

interface PluggyItem {
  id: string;
  status: string;
  connector: { name: string; primaryColor?: string };
}

interface PluggyAccount {
  id: string;
  itemId: string;
  type: 'BANK' | 'CREDIT' | string;
  subtype: string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  bankData?: { transferNumber?: string | null } | null;
  creditData?: {
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
    brand?: string | null;
    level?: string | null;
  } | null;
}

interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category?: string | null;
}

interface PluggyBill {
  id: string;
  dueDate: string;
  totalAmount: number;
  minimumPaymentAmount?: number | null;
}

export async function getItem(itemId: string): Promise<PluggyItem> {
  return pluggyGet<PluggyItem>(`/items/${itemId}`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function normalizeTransaction(t: PluggyTransaction, accountType: string): Transaction {
  // Em contas BANK, débitos vêm negativos; em cartões, compras vêm positivas.
  let kind: Transaction['kind'];
  if (t.amount === 0) kind = t.type === 'CREDIT' ? 'income' : 'expense';
  else if (accountType === 'CREDIT') kind = t.amount > 0 ? 'expense' : 'income';
  else kind = t.amount < 0 ? 'expense' : 'income';
  return {
    id: t.id,
    accountId: t.accountId,
    date: t.date.slice(0, 10),
    description: t.description || t.descriptionRaw || 'Sem descrição',
    amount: Math.abs(t.amount),
    kind,
    rawCategory: t.category ?? null,
  };
}

/** Busca contas, transações (últimos ~7 meses) e faturas de todos os items. */
export async function syncFromPluggy(itemIds: string[]): Promise<SyncPayload> {
  const errors: string[] = [];
  const accounts: Account[] = [];
  const transactions: Transaction[] = [];
  const bills: Bill[] = [];

  const from = new Date();
  from.setMonth(from.getMonth() - 7, 1);

  await Promise.all(
    itemIds.map(async (itemId) => {
      try {
        const item = await getItem(itemId);
        const { results } = await pluggyGet<Paged<PluggyAccount>>('/accounts', { itemId });
        const inst = institutionFor(item, results);
        await Promise.all(
          results.map(async (a) => {
            const type = a.type === 'CREDIT' ? 'CREDIT' : 'BANK';
            let name = a.marketingName || a.name;
            if (type === 'CREDIT' && !name.toLowerCase().includes(inst.name.toLowerCase()))
              name = `${inst.name} ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
            const dueDate = a.creditData?.balanceDueDate?.slice(0, 10) ?? null;
            // Sem data de fechamento (comum via Open Finance): estimamos 7 dias antes do vencimento.
            const closeDate = a.creditData?.balanceCloseDate?.slice(0, 10) ?? (dueDate ? addDays(dueDate, -7) : null);
            accounts.push({
              id: a.id,
              itemId,
              institution: inst.name,
              institutionColor: inst.color,
              name,
              number: a.number ?? null,
              type,
              subtype: a.subtype,
              balance: a.balance,
              creditData:
                type === 'CREDIT'
                  ? {
                      creditLimit: a.creditData?.creditLimit ?? 0,
                      availableCreditLimit: a.creditData?.availableCreditLimit ?? 0,
                      balanceCloseDate: closeDate,
                      balanceDueDate: dueDate,
                      brand: a.creditData?.brand ?? null,
                      level: a.creditData?.level ?? null,
                    }
                  : null,
            });

            // Inclui parcelas futuras de cartão (vêm com a data da fatura em que serão cobradas).
            const txs = await getAllByCursor<PluggyTransaction>('/v2/transactions', {
              accountId: a.id,
              dateFrom: isoDate(from),
            });
            transactions.push(...txs.map((t) => normalizeTransaction(t, type)));

            if (type === 'CREDIT') {
              try {
                const b = await pluggyGet<Paged<PluggyBill>>('/bills', { accountId: a.id });
                bills.push(
                  ...b.results.map((x) => ({
                    id: x.id,
                    accountId: a.id,
                    dueDate: x.dueDate.slice(0, 10),
                    totalAmount: x.totalAmount,
                    minimumPaymentAmount: x.minimumPaymentAmount ?? null,
                  })),
                );
              } catch (e) {
                // Nem todo conector oferece faturas; o app calcula a partir das transações.
                errors.push(`Faturas indisponíveis para ${a.name}: ${(e as Error).message}`);
              }
            }
          }),
        );
      } catch (e) {
        errors.push(`Item ${itemId}: ${(e as Error).message}`);
      }
    }),
  );

  return { accounts, transactions, bills, syncedAt: new Date().toISOString(), demo: false, errors };
}
