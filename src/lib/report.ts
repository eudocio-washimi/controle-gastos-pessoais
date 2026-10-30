import { averageSpending, balanceHistory, isIncome, isSpending, limitRows, spendingByCategory, totalIncome, totalSpending } from './calc.ts';
import { CATEGORY_MAP, type CategoryKey } from './categories.ts';
import { addMonthsYM, monthOf } from './dates.ts';
import { formatBRL, formatDate, monthLabelLong } from './format.ts';
import type { Account, CategoryLimits, Occurrence, Tx } from './types.ts';

const pct = (cur: number, base: number) => {
  if (base === 0) return cur === 0 ? '0%' : 'novo';
  const v = ((cur - base) / base) * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
};

export const AI_PROMPT = 'Analise minhas finanças deste mês e me diga o que posso melhorar.';

export function buildReport(ym: string, accounts: Account[], txs: Tx[], limits: CategoryLimits, occurrences: Occurrence[]): string {
  const prev = addMonthsYM(ym, -1);
  const income = totalIncome(txs, ym);
  const spending = totalSpending(txs, ym);
  const [start, end] = balanceHistory(accounts, txs, [prev, ym]);

  const cur = spendingByCategory(txs, ym);
  const before = spendingByCategory(txs, prev);
  const cats = [...new Set([...Object.keys(cur), ...Object.keys(before)])] as CategoryKey[];
  cats.sort((a, b) => (cur[b] ?? 0) - (cur[a] ?? 0));

  const L: string[] = [];
  L.push(`RELATÓRIO FINANCEIRO MENSAL — ${monthLabelLong(ym).toUpperCase()}`);
  L.push('='.repeat(60));
  L.push('');
  L.push('1. RESUMO');
  L.push(`- Saldo inicial do mês (contas): ${formatBRL(start.balance)}`);
  L.push(`- Saldo final do mês (contas): ${formatBRL(end.balance)}`);
  L.push(`- Receitas: ${formatBRL(income)}`);
  L.push(`- Despesas (consumo, inclui cartão): ${formatBRL(spending)}`);
  L.push(`- Resultado (receitas − despesas): ${formatBRL(income - spending)}`);
  L.push(`- Taxa de poupança: ${income > 0 ? (((income - spending) / income) * 100).toFixed(1).replace('.', ',') + '%' : 'n/d'}`);
  L.push(`- Despesas no mês anterior: ${formatBRL(totalSpending(txs, prev))} (${pct(spending, totalSpending(txs, prev))})`);
  L.push(`- Média de despesas dos 3 meses anteriores: ${formatBRL(averageSpending(txs, ym, 3))}`);
  L.push('');

  L.push('2. GASTOS POR CATEGORIA');
  L.push('Categoria | Este mês | Mês anterior | Var. | Média 3 meses | Var. média');
  for (const c of cats) {
    const v = cur[c] ?? 0;
    const p = before[c] ?? 0;
    const avg = averageSpending(txs, ym, 3, c);
    L.push(`${CATEGORY_MAP[c].label} | ${formatBRL(v)} | ${formatBRL(p)} | ${pct(v, p)} | ${formatBRL(avg)} | ${pct(v, avg)}`);
  }
  L.push('');

  L.push('3. LIMITES POR CATEGORIA');
  const rows = limitRows(txs, ym, limits);
  if (!rows.length) L.push('- Nenhum limite cadastrado.');
  const over = rows.filter((r) => r.status === 'estourado');
  const near = rows.filter((r) => r.status === 'alerta');
  if (rows.length) {
    L.push(over.length ? 'Ultrapassados:' : '- Nenhuma categoria ultrapassou o limite.');
    for (const r of over) L.push(`- ${CATEGORY_MAP[r.category].label}: gasto ${formatBRL(r.spent)} de ${formatBRL(r.limit)} (${(r.pct * 100).toFixed(0)}%)`);
    if (near.length) L.push('Próximos do limite (≥ 80%):');
    for (const r of near) L.push(`- ${CATEGORY_MAP[r.category].label}: ${formatBRL(r.spent)} de ${formatBRL(r.limit)} (${(r.pct * 100).toFixed(0)}%)`);
  }
  L.push('');

  L.push('4. LANÇAMENTOS PREVISTOS NÃO CONFIRMADOS');
  const pending = occurrences.filter((o) => monthOf(o.date) === ym && (o.status === 'pendente' || o.status === 'atrasado'));
  if (!pending.length) L.push('- Todos os lançamentos previstos do mês foram confirmados.');
  for (const o of pending)
    L.push(`- ${formatDate(o.date)} · ${o.entry.type === 'income' ? 'Receita' : 'Despesa'} · ${o.entry.description} · ${formatBRL(o.entry.amount)} (${o.status})`);
  L.push('');

  L.push('5. MAIORES GASTOS INDIVIDUAIS');
  const top = txs.filter((t) => isSpending(t) && monthOf(t.date) === ym).sort((a, b) => b.amount - a.amount).slice(0, 10);
  top.forEach((t, i) =>
    L.push(`${i + 1}. ${formatDate(t.date)} · ${t.description} · ${CATEGORY_MAP[t.category].label} · ${formatBRL(t.amount)} (${t.account.name})`),
  );
  L.push('');

  L.push('6. RECEITAS DO MÊS');
  for (const t of txs.filter((t) => isIncome(t) && monthOf(t.date) === ym))
    L.push(`- ${formatDate(t.date)} · ${t.description} · ${formatBRL(t.amount)}`);
  L.push('');
  L.push('-'.repeat(60));
  L.push(AI_PROMPT);
  return L.join('\n');
}
