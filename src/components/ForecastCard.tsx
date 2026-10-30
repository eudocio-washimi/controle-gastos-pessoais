import { Info } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { formatDate } from '../lib/format.ts';
import { Waterfall, type WaterfallStep } from './charts/Charts.tsx';
import { Money } from './ui.tsx';

export function ForecastCard({ detailed = false }: { detailed?: boolean }) {
  const { forecast: f } = useApp();
  if (!f) return null;

  const steps: WaterfallStep[] = [
    { label: 'Atual', value: f.currentBalance, kind: 'total' },
    { label: 'Receitas', value: f.plannedIncome, kind: 'delta' },
    { label: 'Despesas', value: -f.plannedExpense, kind: 'delta' },
    { label: 'Faturas', value: -f.cardBills, kind: 'delta' },
    { label: 'Estimado', value: -f.estimatedRemaining, kind: 'delta' },
    { label: 'Final', value: f.finalBalance, kind: 'total' },
  ];

  const rows: { label: string; value: number; hint: string }[] = [
    { label: 'Saldo atual em conta', value: f.currentBalance, hint: 'Soma das contas corrente e poupança' },
    { label: 'Receitas previstas pendentes', value: f.plannedIncome, hint: `${f.pendingOccurrences.filter((o) => o.entry.type === 'income').length} lançamento(s) ainda não confirmados` },
    { label: 'Despesas previstas pendentes', value: -f.plannedExpense, hint: `${f.pendingOccurrences.filter((o) => o.entry.type === 'expense').length} lançamento(s) ainda não confirmados` },
    {
      label: 'Faturas de cartão a vencer no mês',
      value: -f.cardBills,
      hint: f.cardBillItems.length ? f.cardBillItems.map((b) => `${b.card.account.name} (${formatDate(b.dueDate)})`).join(', ') : 'Nenhuma fatura vence até o fim do mês',
    },
    {
      label: 'Estimativa de gastos restantes',
      value: -f.estimatedRemaining,
      hint: `Média de 3 meses dos gastos à vista (débito/Pix) menos o já gasto este mês`,
    },
  ];

  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="card-sub">Previsão para o fim do mês</div>
          <div className="mt-1 text-base sm:text-lg">
            Você deve terminar o mês com{' '}
            <Money value={f.finalBalance} className={`font-bold ${f.finalBalance < 0 ? 'text-[var(--critical)]' : 'text-[var(--good-text)]'}`} />
          </div>
        </div>
      </div>
      <div className="mt-3">
        <Waterfall steps={steps} />
      </div>
      {detailed && (
        <div className="mt-4 divide-y divide-black/5 dark:divide-white/10">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-[var(--muted)]">{r.hint}</div>
              </div>
              <Money value={r.value} signed className="shrink-0 text-sm font-semibold" />
            </div>
          ))}
          <div className="flex items-center justify-between py-2.5">
            <div className="text-sm font-semibold">Saldo final estimado</div>
            <Money value={f.finalBalance} className="text-sm font-bold" />
          </div>
          <div className="flex items-start gap-2 pt-3 text-xs text-[var(--muted)]">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              Gastos já realizados no mês: <Money value={f.spentThisMonth} /> (já descontados do saldo ou incluídos nas faturas). Média de gastos à vista nos últimos 3 meses:{' '}
              <Money value={f.avgVariable3m} />; gasto à vista este mês: <Money value={f.variableSpentThisMonth} />.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
