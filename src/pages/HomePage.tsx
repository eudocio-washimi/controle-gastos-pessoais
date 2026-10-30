import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TrendLine } from '../components/charts/Charts.tsx';
import { ForecastCard } from '../components/ForecastCard.tsx';
import { TxModal } from '../components/TxModal.tsx';
import { Empty, Money, MonthPicker, StatusBadge, Stat, Tabs, TxRow } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { balanceHistory, bankAccounts, limitRows, totalBalance, totalIncome, totalSpending } from '../lib/calc.ts';
import { CATEGORY_MAP } from '../lib/categories.ts';
import { currentMonth, lastMonths } from '../lib/dates.ts';
import { monthLabelLong } from '../lib/format.ts';
import type { Tx } from '../lib/types.ts';

const ALL = '__all__';

export default function HomePage() {
  const { payload, txs, month, limits } = useApp();
  const [bank, setBank] = useState(ALL);
  const [selected, setSelected] = useState<Tx | null>(null);

  const institutions = useMemo(() => [...new Set(payload!.accounts.map((a) => a.institution))], [payload]);
  const accounts = bank === ALL ? payload!.accounts : payload!.accounts.filter((a) => a.institution === bank);
  const ids = new Set(accounts.map((a) => a.id));
  const scoped = bank === ALL ? txs : txs.filter((t) => ids.has(t.accountId));

  const history = balanceHistory(accounts, scoped, lastMonths(currentMonth(), 6)).map((h) => ({ month: h.month, value: h.balance }));
  const alerts = limitRows(txs, currentMonth(), limits).filter((r) => r.status !== 'ok');
  const recent = scoped.filter((t) => t.date.startsWith(month)).slice(0, 8);
  const isCurrent = month === currentMonth();

  return (
    <div className="space-y-4">
      <Tabs
        value={bank}
        onChange={setBank}
        options={[{ value: ALL, label: 'Todos os bancos' }, ...institutions.map((i) => ({ value: i, label: i }))]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink-2)]">
          {bank === ALL ? 'Visão consolidada' : bank} · {bankAccounts(accounts).length} conta(s)
        </p>
        <MonthPicker />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo disponível" value={totalBalance(accounts)} hint="Corrente + poupança" />
        <Stat label={`Gastos em ${monthLabelLong(month).split(' ')[0]}`} value={totalSpending(scoped, month)} tone="bad" hint="Inclui cartão de crédito" />
        <Stat label={`Receitas em ${monthLabelLong(month).split(' ')[0]}`} value={totalIncome(scoped, month)} tone="good" />
        <ForecastStat />
      </div>

      {alerts.length > 0 && (
        <a href="#/categorias" className="card flex items-center gap-3 !py-3 transition hover:bg-black/[0.02]">
          <AlertTriangle className="shrink-0 text-[var(--warning)]" size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{alerts.length} categoria(s) perto ou acima do limite</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {alerts.map((a) => (
                <span key={a.category} className="flex items-center gap-1 text-xs text-[var(--ink-2)]">
                  {CATEGORY_MAP[a.category].label} <StatusBadge status={a.status} />
                </span>
              ))}
            </div>
          </div>
          <ChevronRight size={18} className="text-[var(--muted)]" />
        </a>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {bank === ALL ? <ForecastCard /> : null}
        <div className="card">
          <div className="card-title">Evolução do saldo</div>
          <div className="card-sub">Saldo total no fim de cada mês · últimos 6 meses</div>
          <div className="mt-3">
            <TrendLine data={history} name="Saldo" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <div className="card-title">{isCurrent ? 'Últimas movimentações' : `Movimentações de ${monthLabelLong(month)}`}</div>
            <div className="card-sub">Toque para ver detalhes ou trocar a categoria</div>
          </div>
          <a href="#/contas" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">Ver todas</a>
        </div>
        <div className="mt-2">
          {recent.length ? recent.map((t) => <TxRow key={t.id} tx={t} onClick={() => setSelected(t)} />) : <Empty>Nenhuma movimentação neste mês.</Empty>}
        </div>
      </div>

      {selected && <TxModal tx={txs.find((t) => t.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ForecastStat() {
  const { forecast } = useApp();
  if (!forecast) return null;
  return (
    <div className="card !p-4">
      <div className="text-xs font-medium text-[var(--ink-2)]">Saldo previsto no fim do mês</div>
      <Money value={forecast.finalBalance} className={`mt-1 block whitespace-nowrap text-lg font-semibold xl:text-2xl ${forecast.finalBalance < 0 ? 'text-[var(--critical)]' : ''}`} />
      <a href="#/planejamento" className="mt-1 block text-xs text-emerald-600 hover:underline dark:text-emerald-400">Ver cálculo</a>
    </div>
  );
}
