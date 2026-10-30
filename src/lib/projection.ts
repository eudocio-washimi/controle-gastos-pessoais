import { buildOccurrences, totalIncome, type CardInfo, type Forecast } from './calc.ts';
import { addDaysISO, addMonthsYM, currentMonth, daysInMonth, diffDays, lastMonths, monthOf, todayISO } from './dates.ts';
import type { OccurrenceOverride, PlannedEntry, Tx } from './types.ts';

// Projeção dos próximos meses: faturas já comprometidas (parcelas e compras lançadas), estimativa de novos
// gastos, receitas e despesas previstas, e o saldo que deve sobrar mês a mês.

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const maxMonth = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Até onde projetar: 12 meses, ou até a última parcela (no máximo 24 meses). */
const MIN_HORIZON = 12;
const MAX_HORIZON = 24;

export interface CardMonth {
  /** Parcelas de compras parceladas cobradas nesta fatura. */
  installments: number;
  /** Compras à vista (e estornos) já lançadas nesta fatura. */
  purchases: number;
  /** Estimativa de compras à vista que ainda devem entrar nesta fatura. */
  estimated: number;
  total: number;
  /** Fatura do mês corrente já paga. */
  paid: boolean;
}

export interface InstallmentPlan {
  key: string;
  description: string;
  /** Valor de cada parcela. */
  amount: number;
  total: number;
  /** Próxima parcela a pagar. */
  nextNumber: number;
  remaining: number;
  remainingAmount: number;
  /** Mês da fatura com a última parcela. */
  endMonth: string;
  /** Alguma parcela futura não veio do banco e foi deduzida pelo app. */
  projected: boolean;
}

export interface CardOutlook {
  card: CardInfo;
  /** Fatura que está recebendo as compras de hoje. */
  openMonth: string;
  /** Média mensal de compras à vista (últimas 3 faturas fechadas). */
  avgPurchases: number;
  byMonth: Record<string, CardMonth>;
  plans: InstallmentPlan[];
  remainingInstallments: number;
  lastInstallmentMonth: string | null;
  /** Se parar de usar o cartão, primeira fatura zerada. */
  zeroFrom: string | null;
}

export interface ProjectionMonth {
  month: string;
  income: number;
  fixed: number;
  installments: number;
  purchases: number;
  cardEstimated: number;
  cardsTotal: number;
  variable: number;
  /** Receitas menos todas as saídas do mês: quanto sobra (ou falta). */
  leftover: number;
  /** Saldo projetado no fim do mês. */
  balance: number;
}

export interface Projection {
  /** Saldo previsto no fim do mês corrente (ponto de partida, igual ao da tela Início). */
  startBalance: number;
  months: ProjectionMonth[];
  cards: CardOutlook[];
  incomeSource: 'planned' | 'average';
  avgIncome3m: number;
  avgVariable: number;
  lastInstallmentMonth: string | null;
  remainingInstallments: number;
  /** Primeiro mês em que o saldo projetado fica negativo. */
  negativeFrom: string | null;
}

/** Mês da fatura de um lançamento: o informado pelo banco ou, se faltar, deduzido do ciclo do cartão. */
function billMonthOf(t: Tx, card: CardInfo): string {
  if (t.billMonth) return t.billMonth;
  const closeDay = Number(card.nextClose.slice(8, 10));
  const offset = Math.max(1, diffDays(card.open.dueDate, card.nextClose));
  const base = Number(t.date.slice(8, 10)) <= closeDay ? monthOf(t.date) : addMonthsYM(monthOf(t.date), 1);
  const close = `${base}-${String(Math.min(closeDay, daysInMonth(base))).padStart(2, '0')}`;
  return monthOf(addDaysISO(close, offset));
}

/** "LOJA X 3/10" → "LOJA X" */
const baseDescription = (d: string) => d.replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, '').trim();

function cardOutlook(card: CardInfo, txs: Tx[]): CardOutlook {
  const today = todayISO();
  const ym = currentMonth();
  const id = card.account.id;
  const all = txs.filter((t) => t.accountId === id);
  const items = all.filter((t) => t.category !== 'pagamento_fatura');

  const buckets = new Map<string, { installments: number; purchases: number }>();
  const bucket = (m: string) => buckets.get(m) ?? buckets.set(m, { installments: 0, purchases: 0 }).get(m)!;
  const value = (t: Tx) => (t.kind === 'expense' ? t.amount : -t.amount);

  // Parcelas agrupadas por compra; as que o banco ainda não informou são deduzidas a partir da última conhecida.
  const groups = new Map<string, { description: string; total: number; parts: Map<number, { month: string; amount: number }> }>();
  for (const t of items) {
    const m = billMonthOf(t, card);
    if (t.installment) {
      bucket(m).installments += value(t);
      const desc = baseDescription(t.description);
      const key = `${desc}|${t.installment.purchaseDate ?? ''}|${t.installment.total}`;
      const g = groups.get(key) ?? groups.set(key, { description: desc, total: t.installment.total, parts: new Map() }).get(key)!;
      g.parts.set(t.installment.number, { month: m, amount: t.amount });
    } else {
      bucket(m).purchases += value(t);
    }
  }

  // Fatura do mês corrente: paga quando os pagamentos do mês cobrem a maior parte do valor calculado
  // (tolerância para estornos, tarifas e arredondamentos que o banco não detalha).
  const current = buckets.get(ym);
  const currentBill = current ? current.installments + current.purchases : 0;
  const paidThisMonth = sum(all.filter((t) => t.category === 'pagamento_fatura' && t.kind === 'income' && monthOf(t.date) === ym).map((t) => t.amount));
  const paid = currentBill <= 0 || paidThisMonth >= currentBill * 0.8;
  const firstOpen = paid ? addMonthsYM(ym, 1) : ym;

  const plans: InstallmentPlan[] = [];
  for (const [key, g] of groups) {
    const numbers = [...g.parts.keys()].sort((a, b) => a - b);
    const last = numbers[numbers.length - 1];
    const lastPart = g.parts.get(last)!;
    let projected = false;
    for (let k = last + 1; k <= g.total; k++) {
      const m = addMonthsYM(lastPart.month, k - last);
      g.parts.set(k, { month: m, amount: lastPart.amount });
      bucket(m).installments += lastPart.amount;
      projected = true;
    }
    const pending = [...g.parts.entries()].filter(([, p]) => p.month >= firstOpen).sort((a, b) => a[0] - b[0]);
    if (!pending.length) continue;
    plans.push({
      key,
      description: g.description,
      amount: lastPart.amount,
      total: g.total,
      nextNumber: pending[0][0],
      remaining: pending.length,
      remainingAmount: round2(sum(pending.map(([, p]) => p.amount))),
      endMonth: pending[pending.length - 1][1].month,
      projected,
    });
  }
  plans.sort((a, b) => b.endMonth.localeCompare(a.endMonth) || b.remainingAmount - a.remainingAmount);

  // Fatura aberta = a da compra à vista mais recente; sem compras recentes, deduzida do ciclo.
  const recent = items
    .filter((t) => !t.installment && t.kind === 'expense' && t.date <= today && diffDays(today, t.date) <= 40)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const openMonth = recent ? billMonthOf(recent, card) : billMonthOf({ date: today } as Tx, card);
  const avgPurchases = round2(sum(lastMonths(addMonthsYM(openMonth, -1), 3).map((m) => Math.max(0, buckets.get(m)?.purchases ?? 0))) / 3);

  const months = [...buckets.keys()].filter((m) => m >= ym);
  const byMonth: Record<string, CardMonth> = {};
  const end = maxMonth(months.sort().at(-1) ?? null, addMonthsYM(ym, MAX_HORIZON))!;
  for (let m = ym; m <= end; m = addMonthsYM(m, 1)) {
    const b = buckets.get(m) ?? { installments: 0, purchases: 0 };
    const installments = round2(b.installments);
    const purchases = round2(b.purchases);
    const estimated = m < openMonth ? 0 : round2(Math.max(0, avgPurchases - Math.max(0, purchases)));
    byMonth[m] = { installments, purchases, estimated, total: round2(installments + purchases + estimated), paid: m === ym && paid };
  }

  const futureInstallments = Object.entries(byMonth).filter(([m, c]) => m >= firstOpen && c.installments > 0.005);
  const lastInstallmentMonth = futureInstallments.length ? futureInstallments[futureInstallments.length - 1][0] : null;
  let zeroFrom: string | null = null;
  for (let m = firstOpen; m <= end; m = addMonthsYM(m, 1)) {
    const c = byMonth[m];
    if (c.installments + c.purchases <= 0.005) {
      zeroFrom = m;
      break;
    }
  }

  return {
    card,
    openMonth,
    avgPurchases,
    byMonth,
    plans,
    remainingInstallments: round2(sum(futureInstallments.map(([, c]) => c.installments))),
    lastInstallmentMonth,
    zeroFrom,
  };
}

export function project(
  txs: Tx[],
  cards: CardInfo[],
  planned: PlannedEntry[],
  overrides: Record<string, OccurrenceOverride>,
  fc: Forecast,
  includeEstimates: boolean,
): Projection {
  const ym = currentMonth();
  const outlooks = cards.map((c) => cardOutlook(c, txs));
  const lastInstallmentMonth = outlooks.reduce<string | null>((acc, o) => maxMonth(acc, o.lastInstallmentMonth), null);

  let horizonEnd = addMonthsYM(ym, MIN_HORIZON);
  if (lastInstallmentMonth && lastInstallmentMonth > horizonEnd) horizonEnd = lastInstallmentMonth;
  if (horizonEnd > addMonthsYM(ym, MAX_HORIZON)) horizonEnd = addMonthsYM(ym, MAX_HORIZON);

  const first = addMonthsYM(ym, 1);
  const occurrences = buildOccurrences(planned, overrides, txs, `${first}-01`, `${horizonEnd}-31`).filter((o) => o.status !== 'ignorado');
  const plannedIn = (m: string, type: 'income' | 'expense') =>
    round2(sum(occurrences.filter((o) => o.entry.type === type && monthOf(o.date) === m).map((o) => o.entry.amount)));

  // Sem salário cadastrado em Planejamento, usa a média das receitas reais dos últimos 3 meses.
  const incomeSource = planned.some((e) => e.type === 'income') ? 'planned' : 'average';
  const avgIncome3m = round2(sum(lastMonths(addMonthsYM(ym, -1), 3).map((m) => totalIncome(txs, m))) / 3);
  const avgVariable = includeEstimates ? fc.avgVariable3m : 0;

  const months: ProjectionMonth[] = [];
  let balance = fc.finalBalance;
  for (let m = first; m <= horizonEnd; m = addMonthsYM(m, 1)) {
    const income = incomeSource === 'planned' ? plannedIn(m, 'income') : avgIncome3m;
    const fixed = plannedIn(m, 'expense');
    const cm = outlooks.map((o) => o.byMonth[m]);
    const installments = round2(sum(cm.map((c) => c.installments)));
    const purchases = round2(sum(cm.map((c) => c.purchases)));
    const cardEstimated = includeEstimates ? round2(sum(cm.map((c) => c.estimated))) : 0;
    const cardsTotal = round2(installments + purchases + cardEstimated);
    const leftover = round2(income - fixed - cardsTotal - avgVariable);
    balance = round2(balance + leftover);
    months.push({ month: m, income, fixed, installments, purchases, cardEstimated, cardsTotal, variable: avgVariable, leftover, balance });
  }

  return {
    startBalance: fc.finalBalance,
    months,
    cards: outlooks,
    incomeSource,
    avgIncome3m,
    avgVariable: fc.avgVariable3m,
    lastInstallmentMonth,
    remainingInstallments: round2(sum(outlooks.map((o) => o.remainingInstallments))),
    negativeFrom: months.find((m) => m.balance < 0)?.month ?? null,
  };
}
