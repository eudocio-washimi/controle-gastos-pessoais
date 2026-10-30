import { CATEGORY_MAP, OTHERS_KEY, categorize, type CategoryKey } from './categories.ts';
import {
  addDaysISO, addMonthsISO, addMonthsYM, diffDays, lastDayOfMonth, lastMonths, monthOf, todayISO,
} from './dates.ts';
import type {
  Account, Bill, CategoryLimits, Occurrence, OccurrenceOverride, PlannedEntry, SyncPayload, Tx,
} from './types.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- Transações

export function enrich(payload: SyncPayload, categoryOverrides: Record<string, CategoryKey>): Tx[] {
  const byId = new Map(payload.accounts.map((a) => [a.id, a]));
  return payload.transactions
    .filter((t) => byId.has(t.accountId))
    .map((t) => ({
      ...t,
      account: byId.get(t.accountId)!,
      category: categoryOverrides[t.id] ?? categorize(t.rawCategory, t.description, t.kind),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Gasto de consumo: despesa que não é pagamento de fatura, investimento ou transferência própria. */
export const isSpending = (t: Tx) => t.kind === 'expense' && !CATEGORY_MAP[t.category].excluded;

/** Receita real: entrada em conta bancária que não é movimentação interna. */
export const isIncome = (t: Tx) => t.kind === 'income' && t.account.type === 'BANK' && !CATEGORY_MAP[t.category].excluded;

export const inMonth = (t: Tx, ym: string) => monthOf(t.date) === ym;

export function totalSpending(txs: Tx[], ym: string) {
  return round2(sum(txs.filter((t) => isSpending(t) && inMonth(t, ym)).map((t) => t.amount)));
}

export function totalIncome(txs: Tx[], ym: string) {
  return round2(sum(txs.filter((t) => isIncome(t) && inMonth(t, ym)).map((t) => t.amount)));
}

export function spendingByCategory(txs: Tx[], ym: string): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const t of txs) {
    if (!isSpending(t) || !inMonth(t, ym)) continue;
    out[t.category] = round2((out[t.category] ?? 0) + t.amount);
  }
  return out;
}

/** Média mensal de gastos de uma categoria (ou total) nos `n` meses anteriores a `ym`. */
export function averageSpending(txs: Tx[], ym: string, n: number, category?: CategoryKey) {
  const months = lastMonths(addMonthsYM(ym, -1), n);
  const totals = months.map((m) =>
    category ? spendingByCategory(txs, m)[category] ?? 0 : totalSpending(txs, m),
  );
  return round2(sum(totals) / n);
}

/**
 * Cor estável por categoria: as 7 categorias com maior gasto no período recebem os slots
 * da paleta (em ordem fixa); as demais caem em "Outros". A cor segue a categoria, não o ranking do mês.
 */
export function categorySlots(txs: Tx[], months: string[]): Map<CategoryKey, number> {
  const totals = new Map<CategoryKey, number>();
  const set = new Set(months);
  for (const t of txs) {
    if (!isSpending(t) || !set.has(monthOf(t.date))) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k]) => k);
  return new Map(ranked.map((k, i) => [k, i]));
}

export const slotKey = (slots: Map<CategoryKey, number>, c: CategoryKey) => (slots.has(c) ? c : OTHERS_KEY);

// ---------------------------------------------------------------- Saldos

export const bankAccounts = (accounts: Account[]) => accounts.filter((a) => a.type === 'BANK');
export const creditAccounts = (accounts: Account[]) => accounts.filter((a) => a.type === 'CREDIT');

export function totalBalance(accounts: Account[]) {
  return round2(sum(bankAccounts(accounts).map((a) => a.balance)));
}

/**
 * Saldo no fim de cada mês, reconstruído a partir do saldo atual descontando
 * os fluxos das contas bancárias posteriores ao fim do mês.
 */
export function balanceHistory(accounts: Account[], txs: Tx[], months: string[]) {
  const ids = new Set(bankAccounts(accounts).map((a) => a.id));
  const current = totalBalance(accounts);
  const today = todayISO();
  const bankTxs = txs.filter((t) => ids.has(t.accountId));
  return months.map((ym) => {
    const end = lastDayOfMonth(ym);
    if (end >= today) return { month: ym, balance: current };
    const after = sum(bankTxs.filter((t) => t.date > end).map((t) => (t.kind === 'income' ? t.amount : -t.amount)));
    return { month: ym, balance: round2(current - after) };
  });
}

// ---------------------------------------------------------------- Cartões

export interface CardInfo {
  account: Account;
  limit: number;
  available: number;
  used: number;
  usedPct: number;
  nextClose: string;
  prevClose: string;
  open: { amount: number; dueDate: string; txs: Tx[] };
  closed: { amount: number; dueDate: string; txs: Tx[]; paid: boolean; overdue: boolean; bill?: Bill };
}

function rollForward(iso: string, minISO: string) {
  let d = iso;
  while (d < minISO) d = addMonthsISO(d, 1);
  return d;
}

export function cardInfo(account: Account, txs: Tx[], bills: Bill[]): CardInfo {
  const today = todayISO();
  const cd = account.creditData;
  const cardTxs = txs.filter((t) => t.accountId === account.id);

  const nextClose = rollForward(cd?.balanceCloseDate ?? lastDayOfMonth(monthOf(today)), today);
  const prevClose = addMonthsISO(nextClose, -1);
  const prevPrevClose = addMonthsISO(prevClose, -1);

  let dueOffset = 7;
  if (cd?.balanceCloseDate && cd.balanceDueDate) {
    const d = diffDays(cd.balanceDueDate, cd.balanceCloseDate);
    dueOffset = ((d % 30) + 30) % 30 || 7;
  }

  const between = (from: string, to: string) => cardTxs.filter((t) => t.date > from && t.date <= to);
  const invoiceTotal = (list: Tx[]) =>
    round2(sum(list.filter((t) => t.category !== 'pagamento_fatura').map((t) => (t.kind === 'expense' ? t.amount : -t.amount))));

  const openTxs = between(prevClose, nextClose);
  const closedTxs = between(prevPrevClose, prevClose);
  const bill = bills
    .filter((b) => b.accountId === account.id && b.dueDate > prevClose)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const closedAmount = bill?.totalAmount ?? invoiceTotal(closedTxs);
  const closedDue = bill?.dueDate ?? addDaysISO(prevClose, dueOffset);
  const paidSoFar = sum(cardTxs.filter((t) => t.category === 'pagamento_fatura' && t.kind === 'income' && t.date > prevClose).map((t) => t.amount));
  const paid = closedAmount <= 0 || paidSoFar >= closedAmount * 0.99;
  const overdue = !paid && closedDue < today;

  const limit = cd?.creditLimit ?? 0;
  const available = cd?.availableCreditLimit ?? Math.max(0, limit - account.balance);
  const used = Math.max(0, limit - available);

  return {
    account,
    limit,
    available,
    used,
    usedPct: limit > 0 ? Math.min(1, used / limit) : 0,
    nextClose,
    prevClose,
    open: { amount: invoiceTotal(openTxs), dueDate: addDaysISO(nextClose, dueOffset), txs: openTxs },
    closed: { amount: closedAmount, dueDate: closedDue, txs: closedTxs, paid, overdue, bill },
  };
}

/** Faturas que ainda vencem no mês corrente e não foram pagas. */
export function billsDueThisMonth(cards: CardInfo[]) {
  const today = todayISO();
  const ym = monthOf(today);
  const out: { card: CardInfo; amount: number; dueDate: string; which: 'fechada' | 'aberta' }[] = [];
  for (const c of cards) {
    if (!c.closed.paid && monthOf(c.closed.dueDate) === ym && c.closed.dueDate >= today)
      out.push({ card: c, amount: c.closed.amount, dueDate: c.closed.dueDate, which: 'fechada' });
    if (monthOf(c.open.dueDate) === ym && c.open.dueDate >= today && c.open.amount > 0)
      out.push({ card: c, amount: c.open.amount, dueDate: c.open.dueDate, which: 'aberta' });
  }
  return out;
}

// ---------------------------------------------------------------- Lançamentos previstos

export const occurrenceKey = (entryId: string, date: string) => `${entryId}@${date}`;

/** Datas das ocorrências de um lançamento dentro de [from, to]. */
export function occurrenceDates(e: PlannedEntry, from: string, to: string): string[] {
  const out: string[] = [];
  const end = e.endDate && e.endDate < to ? e.endDate : to;
  if (e.recurrence === 'once') return e.date >= from && e.date <= end ? [e.date] : [];
  let i = 0;
  for (;;) {
    const d =
      e.recurrence === 'weekly' ? addDaysISO(e.date, 7 * i)
      : e.recurrence === 'monthly' ? addMonthsISO(e.date, i)
      : addMonthsISO(e.date, 12 * i);
    if (d > end || i > 2000) break;
    if (d >= from) out.push(d);
    i++;
  }
  return out;
}

const AMOUNT_TOLERANCE = 0.05;
const DAY_TOLERANCE = 2;

/**
 * Gera as ocorrências no intervalo e confirma automaticamente as que têm uma movimentação real
 * com valor até 5% diferente e data até ±2 dias da prevista.
 */
export function buildOccurrences(
  entries: PlannedEntry[],
  overrides: Record<string, OccurrenceOverride>,
  txs: Tx[],
  from: string,
  to: string,
): Occurrence[] {
  const today = todayISO();
  const txById = new Map(txs.map((t) => [t.id, t]));
  const used = new Set<string>();
  const list: Occurrence[] = [];

  for (const ov of Object.values(overrides)) if (ov.status === 'confirmed' && ov.transactionId) used.add(ov.transactionId);

  const raw = entries
    .flatMap((entry) => occurrenceDates(entry, from, to).map((date) => ({ entry, date })))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const { entry, date } of raw) {
    const key = occurrenceKey(entry.id, date);
    const ov = overrides[key];
    if (ov?.status === 'ignored') {
      list.push({ key, entry, date, status: 'ignorado', auto: false });
      continue;
    }
    if (ov?.status === 'confirmed') {
      list.push({ key, entry, date, status: 'confirmado', auto: false, transaction: ov.transactionId ? txById.get(ov.transactionId) : undefined });
      continue;
    }
    let match: Tx | undefined;
    if (ov?.status !== 'unmatched') {
      match = txs
        .filter(
          (t) =>
            !used.has(t.id) &&
            t.kind === entry.type &&
            Math.abs(diffDays(t.date, date)) <= DAY_TOLERANCE &&
            Math.abs(t.amount - entry.amount) <= entry.amount * AMOUNT_TOLERANCE,
        )
        .sort((a, b) => Math.abs(a.amount - entry.amount) - Math.abs(b.amount - entry.amount) || Math.abs(diffDays(a.date, date)) - Math.abs(diffDays(b.date, date)))[0];
    }
    if (match) {
      used.add(match.id);
      list.push({ key, entry, date, status: 'confirmado', auto: true, transaction: match });
    } else {
      list.push({ key, entry, date, status: date < today ? 'atrasado' : 'pendente', auto: false });
    }
  }
  return list;
}

// ---------------------------------------------------------------- Previsão de saldo

export interface Forecast {
  currentBalance: number;
  spentThisMonth: number;
  plannedIncome: number;
  plannedExpense: number;
  cardBills: number;
  cardBillItems: ReturnType<typeof billsDueThisMonth>;
  avgVariable3m: number;
  variableSpentThisMonth: number;
  estimatedRemaining: number;
  finalBalance: number;
  pendingOccurrences: Occurrence[];
}

export function forecast(accounts: Account[], txs: Tx[], cards: CardInfo[], occurrences: Occurrence[]): Forecast {
  const today = todayISO();
  const ym = monthOf(today);
  const currentBalance = totalBalance(accounts);

  const pendingOccurrences = occurrences.filter((o) => monthOf(o.date) === ym && (o.status === 'pendente' || o.status === 'atrasado'));
  const plannedIncome = round2(sum(pendingOccurrences.filter((o) => o.entry.type === 'income').map((o) => o.entry.amount)));
  const plannedExpense = round2(sum(pendingOccurrences.filter((o) => o.entry.type === 'expense').map((o) => o.entry.amount)));

  const cardBillItems = billsDueThisMonth(cards);
  const cardBills = round2(sum(cardBillItems.map((b) => b.amount)));

  // Gastos variáveis = consumo pago direto da conta, sem os lançamentos previstos (já contados acima).
  const matched = new Set(occurrences.map((o) => o.transaction?.id).filter(Boolean));
  const variable = (t: Tx) => isSpending(t) && t.account.type === 'BANK' && !matched.has(t.id);
  const variableIn = (m: string) => sum(txs.filter((t) => variable(t) && inMonth(t, m)).map((t) => t.amount));
  const avgVariable3m = round2(sum(lastMonths(addMonthsYM(ym, -1), 3).map(variableIn)) / 3);
  const variableSpentThisMonth = round2(variableIn(ym));
  const estimatedRemaining = round2(Math.max(0, avgVariable3m - variableSpentThisMonth));

  return {
    currentBalance,
    spentThisMonth: totalSpending(txs, ym),
    plannedIncome,
    plannedExpense,
    cardBills,
    cardBillItems,
    avgVariable3m,
    variableSpentThisMonth,
    estimatedRemaining,
    finalBalance: round2(currentBalance + plannedIncome - plannedExpense - cardBills - estimatedRemaining),
    pendingOccurrences,
  };
}

// ---------------------------------------------------------------- Limites

export type LimitStatus = 'ok' | 'alerta' | 'estourado';

export function limitStatus(spent: number, limit: number): LimitStatus {
  if (limit <= 0) return 'ok';
  const r = spent / limit;
  return r > 1 ? 'estourado' : r >= 0.8 ? 'alerta' : 'ok';
}

export function limitRows(txs: Tx[], ym: string, limits: CategoryLimits) {
  const spent = spendingByCategory(txs, ym);
  return (Object.entries(limits) as [CategoryKey, number][])
    .filter(([, v]) => v > 0)
    .map(([category, limit]) => {
      const s = spent[category] ?? 0;
      return { category, limit, spent: s, pct: s / limit, status: limitStatus(s, limit) };
    })
    .sort((a, b) => b.pct - a.pct);
}
