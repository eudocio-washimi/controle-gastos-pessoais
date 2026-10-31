import { buildOccurrences, totalIncome, type CardInfo } from './calc.ts';
import { addDaysISO, addMonthsYM, currentMonth, daysInMonth, diffDays, lastMonths, monthOf, todayISO } from './dates.ts';
import type { Occurrence, OccurrenceOverride, PlannedEntry, Tx } from './types.ts';

// Projeção mês a mês: faturas já comprometidas (parcelas e compras lançadas), estimativa de novos gastos,
// receitas e despesas previstas e quanto sobra em cada mês. Cada mês é independente: nada acumula de um para outro.

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const maxMonth = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Até onde projetar: 12 meses, ou até a última parcela (no máximo 24 meses). */
const MIN_HORIZON = 12;
const MAX_HORIZON = 24;

/** Lançamento que compõe uma fatura. */
export interface BillItem {
  description: string;
  /** Positivo = cobrança; negativo = estorno/crédito. */
  amount: number;
  date: string;
  installment: { number: number; total: number } | null;
  /** Parcela que o banco ainda não informou, deduzida pelo app. */
  projected: boolean;
}

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
  items: BillItem[];
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
  /** Receitas e despesas de Planejamento que caem neste mês. */
  occurrences: Occurrence[];
  installments: number;
  purchases: number;
  cardEstimated: number;
  cardsTotal: number;
  variable: number;
  /** Receitas menos todas as saídas do mês: quanto sobra (ou falta) só neste mês. */
  leftover: number;
}

export interface Projection {
  months: ProjectionMonth[];
  cards: CardOutlook[];
  incomeSource: 'planned' | 'average';
  avgIncome3m: number;
  avgVariable: number;
  lastInstallmentMonth: string | null;
  remainingInstallments: number;
}

/**
 * Mês em que a fatura de um lançamento é paga: o informado pelo banco (ajustado por `shift`) ou,
 * se faltar, deduzido do ciclo do cartão.
 */
function billMonthOf(t: Tx, card: CardInfo, shift: number): string {
  if (t.billMonth) return addMonthsYM(t.billMonth, shift);
  const closeDay = Number(card.nextClose.slice(8, 10));
  const offset = Math.max(1, diffDays(card.open.dueDate, card.nextClose));
  const base = Number(t.date.slice(8, 10)) <= closeDay ? monthOf(t.date) : addMonthsYM(monthOf(t.date), 1);
  const close = `${base}-${String(Math.min(closeDay, daysInMonth(base))).padStart(2, '0')}`;
  return monthOf(addDaysISO(close, offset));
}

/**
 * Em que mês, relativo ao mês informado pelo banco, a fatura costuma ser paga: 0 ou -1.
 * O banco informa o mês do vencimento; quando ele cai no comecinho do mês (Nubank vencendo dia 1º, por exemplo),
 * a fatura é paga no fim do mês anterior, com o salário daquele mês. Deduzido dos pagamentos das últimas faturas fechadas.
 */
function payShift(all: Tx[], today: string): number {
  const payments = all.filter((t) => t.category === 'pagamento_fatura' && t.kind === 'income');
  const closes = new Map<string, string>();
  for (const t of all)
    if (t.billMonth && !t.installment && t.kind === 'expense' && t.category !== 'pagamento_fatura' && t.date <= today)
      if ((closes.get(t.billMonth) ?? '') < t.date) closes.set(t.billMonth, t.date);
  const votes: number[] = [];
  for (const [bm, close] of [...closes].sort((a, b) => b[0].localeCompare(a[0])).slice(1, 4)) {
    // Maior pagamento até 25 dias depois da última compra da fatura.
    const pay = payments
      .filter((p) => p.date >= close && diffDays(p.date, close) <= 25)
      .sort((a, b) => b.amount - a.amount)[0];
    if (pay) votes.push(monthOf(pay.date) < bm ? -1 : 0);
  }
  return votes.length && votes.filter((v) => v === -1).length > votes.length / 2 ? -1 : 0;
}

/** "LOJA X 3/10" → "LOJA X" */
const baseDescription = (d: string) => d.replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, '').trim();

function cardOutlook(card: CardInfo, txs: Tx[]): CardOutlook {
  const today = todayISO();
  const ym = currentMonth();
  const id = card.account.id;
  const all = txs.filter((t) => t.accountId === id);
  const shift = payShift(all, today);

  // Compra parcelada estornada: o banco devolve a parcela já cobrada, mas o Pluggy continua mandando as seguintes.
  // Estorno do valor de uma parcela já cobrada cancela a compra: as parcelas posteriores a ele não são cobradas.
  const refunds = all.filter((t) => t.kind === 'income' && t.category !== 'pagamento_fatura' && !t.installment);
  const refundOf = (t: Tx): Tx | undefined => {
    const inst = t.installment;
    if (!inst?.purchaseDate) return undefined;
    return refunds.find(
      (r) =>
        r.date >= inst.purchaseDate! &&
        all.some(
          (p) =>
            p.installment?.purchaseDate === inst.purchaseDate &&
            p.installment.total === inst.total &&
            p.date <= r.date &&
            Math.abs(p.amount - r.amount) < 0.01 &&
            Math.abs(p.amount - t.amount) <= p.amount * 0.01,
        ),
    );
  };
  const items = all.filter((t) => {
    if (t.category === 'pagamento_fatura') return false;
    const r = refundOf(t);
    return !r || t.date <= r.date;
  });

  const buckets = new Map<string, { installments: number; purchases: number; items: BillItem[] }>();
  const bucket = (m: string) => buckets.get(m) ?? buckets.set(m, { installments: 0, purchases: 0, items: [] }).get(m)!;
  const value = (t: Tx) => (t.kind === 'expense' ? t.amount : -t.amount);

  // Parcelas agrupadas por compra; as que o banco ainda não informou são deduzidas a partir da última conhecida.
  // O banco às vezes encurta o nome da loja entre uma parcela e outra ("SHOPEE *lacrista" / "SHOPEE *lacristacomerc"):
  // mesma data de compra e mesmo número de parcelas, com um nome começando pelo outro, é a mesma compra.
  type Group = { description: string; total: number; refunded: boolean; parts: Map<number, { month: string; amount: number }> };
  const groups = new Map<string, Group>();
  const groupFor = (desc: string, purchaseDate: string | null, total: number): Group => {
    const norm = desc.toLowerCase();
    if (purchaseDate) {
      for (const [k, g] of groups) {
        const other = g.description.toLowerCase();
        if (k.startsWith(`${purchaseDate}|${total}|`) && (norm.startsWith(other) || other.startsWith(norm))) return g;
      }
    }
    const key = `${purchaseDate ?? ''}|${total}|${desc}`;
    return groups.get(key) ?? groups.set(key, { description: desc, total, refunded: false, parts: new Map() }).get(key)!;
  };
  for (const t of items) {
    const m = billMonthOf(t, card, shift);
    bucket(m).items.push({
      description: t.description,
      amount: value(t),
      date: t.date,
      installment: t.installment ? { number: t.installment.number, total: t.installment.total } : null,
      projected: false,
    });
    if (t.installment) {
      bucket(m).installments += value(t);
      const g = groupFor(baseDescription(t.description), t.installment.purchaseDate, t.installment.total);
      g.parts.set(t.installment.number, { month: m, amount: t.amount });
      if (refundOf(t)) g.refunded = true;
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
    for (let k = last + 1; !g.refunded && k <= g.total; k++) {
      const m = addMonthsYM(lastPart.month, k - last);
      // Garantia contra duplicar: a fatura já tem esta parcela (mesmo número e valor) vinda do banco.
      const known = bucket(m).items.some(
        (it) => !it.projected && it.installment?.number === k && it.installment.total === g.total && Math.abs(it.amount - lastPart.amount) < 0.01,
      );
      if (known) continue;
      g.parts.set(k, { month: m, amount: lastPart.amount });
      bucket(m).installments += lastPart.amount;
      bucket(m).items.push({
        description: `${g.description} ${k}/${g.total}`,
        amount: lastPart.amount,
        date: `${m}-01`,
        installment: { number: k, total: g.total },
        projected: true,
      });
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
  const openMonth = recent ? billMonthOf(recent, card, shift) : billMonthOf({ date: today } as Tx, card, shift);
  const avgPurchases = round2(sum(lastMonths(addMonthsYM(openMonth, -1), 3).map((m) => Math.max(0, buckets.get(m)?.purchases ?? 0))) / 3);

  const months = [...buckets.keys()].filter((m) => m >= ym);
  const byMonth: Record<string, CardMonth> = {};
  const end = maxMonth(months.sort().at(-1) ?? null, addMonthsYM(ym, MAX_HORIZON))!;
  for (let m = ym; m <= end; m = addMonthsYM(m, 1)) {
    const b = buckets.get(m) ?? { installments: 0, purchases: 0, items: [] };
    const installments = round2(b.installments);
    const purchases = round2(b.purchases);
    const estimated = m < openMonth ? 0 : round2(Math.max(0, avgPurchases - Math.max(0, purchases)));
    const items = [...b.items].sort((x, y) => Number(!!y.installment) - Number(!!x.installment) || y.amount - x.amount);
    byMonth[m] = { installments, purchases, estimated, total: round2(installments + purchases + estimated), paid: m === ym && paid, items };
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
  avgVariable3m: number,
  includeEstimates: boolean,
): Projection {
  const ym = currentMonth();
  const outlooks = cards.map((c) => cardOutlook(c, txs));
  const lastInstallmentMonth = outlooks.reduce<string | null>((acc, o) => maxMonth(acc, o.lastInstallmentMonth), null);

  let horizonEnd = addMonthsYM(ym, MIN_HORIZON);
  if (lastInstallmentMonth && lastInstallmentMonth > horizonEnd) horizonEnd = lastInstallmentMonth;
  if (horizonEnd > addMonthsYM(ym, MAX_HORIZON)) horizonEnd = addMonthsYM(ym, MAX_HORIZON);

  const occurrences = buildOccurrences(planned, overrides, txs, `${ym}-01`, `${horizonEnd}-31`).filter((o) => o.status !== 'ignorado');
  const plannedIn = (m: string, type: 'income' | 'expense') =>
    round2(sum(occurrences.filter((o) => o.entry.type === type && monthOf(o.date) === m).map((o) => o.entry.amount)));

  // Sem salário cadastrado em Planejamento, usa a média das receitas reais dos últimos 3 meses.
  const incomeSource = planned.some((e) => e.type === 'income') ? 'planned' : 'average';
  const avgIncome3m = round2(sum(lastMonths(addMonthsYM(ym, -1), 3).map((m) => totalIncome(txs, m))) / 3);
  const avgVariable = includeEstimates ? avgVariable3m : 0;

  const months: ProjectionMonth[] = [];
  for (let m = ym; m <= horizonEnd; m = addMonthsYM(m, 1)) {
    const income = incomeSource === 'planned' ? plannedIn(m, 'income') : avgIncome3m;
    const fixed = plannedIn(m, 'expense');
    const cm = outlooks.map((o) => o.byMonth[m]);
    const installments = round2(sum(cm.map((c) => c.installments)));
    const purchases = round2(sum(cm.map((c) => c.purchases)));
    const cardEstimated = includeEstimates ? round2(sum(cm.map((c) => c.estimated))) : 0;
    const cardsTotal = round2(installments + purchases + cardEstimated);
    const leftover = round2(income - fixed - cardsTotal - avgVariable);
    const monthOccurrences = occurrences.filter((o) => monthOf(o.date) === m);
    months.push({ month: m, income, fixed, occurrences: monthOccurrences, installments, purchases, cardEstimated, cardsTotal, variable: avgVariable, leftover });
  }

  return {
    months,
    cards: outlooks,
    incomeSource,
    avgIncome3m,
    avgVariable: avgVariable3m,
    lastInstallmentMonth,
    remainingInstallments: round2(sum(outlooks.map((o) => o.remainingInstallments))),
  };
}
