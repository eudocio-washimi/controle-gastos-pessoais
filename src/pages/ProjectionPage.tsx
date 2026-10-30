import { AlertTriangle, CalendarCheck, ChevronDown, Info, PiggyBank, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProjectionBars, TrendLine } from '../components/charts/Charts.tsx';
import { Empty, Money } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { SERIES_DARK, SERIES_LIGHT } from '../lib/categories.ts';
import { addMonthsYM, currentMonth } from '../lib/dates.ts';
import { monthLabel, monthLabelLong } from '../lib/format.ts';
import { project, type CardOutlook, type Projection } from '../lib/projection.ts';
import { load, save } from '../lib/storage.ts';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ProjectionPage() {
  const { txs, cards, planned, overrides, forecast, dark } = useApp();
  const [estimates, setEstimates] = useState(() => load('projectionEstimates', true));
  const p = useMemo(
    () => (forecast ? project(txs, cards, planned, overrides, forecast, estimates) : null),
    [txs, cards, planned, overrides, forecast, estimates],
  );
  if (!p) return null;

  const toggle = () => {
    save('projectionEstimates', !estimates);
    setEstimates(!estimates);
  };

  const next6 = p.months.slice(0, 6);
  const avgLeftover = next6.reduce((s, m) => s + m.leftover, 0) / Math.max(1, next6.length);
  const last = p.months[p.months.length - 1];
  const nextMonth = p.months[0];

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="card-title">Projeção dos próximos meses</div>
            <p className="card-sub mt-1">
              Faturas já comprometidas (parcelas e compras lançadas), receitas e despesas de Planejamento e, se quiser, uma estimativa dos gastos que ainda vão acontecer.
            </p>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={estimates} onChange={toggle} />
            Incluir estimativa de novos gastos
          </label>
        </div>
      </div>

      {p.negativeFrom && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--critical)]/30 bg-[var(--critical)]/10 px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--critical)]" />
          <span>
            Neste ritmo, seu saldo fica <b>negativo em {monthLabelLong(p.negativeFrom)}</b>. Veja abaixo quais meses têm faturas mais pesadas.
          </span>
        </div>
      )}
      {p.incomeSource === 'average' && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-800 dark:text-blue-300">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            Usando a média das suas receitas dos últimos 3 meses (<Money value={p.avgIncome3m} />). Para uma projeção mais precisa,{' '}
            <a href="#/planejamento" className="font-medium underline">cadastre seu salário em Planejamento</a>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sobra média por mês" hint="Próximos 6 meses">
          <Money value={avgLeftover} className={avgLeftover < 0 ? 'text-[var(--critical)]' : 'text-[var(--good-text)]'} />
        </Tile>
        <Tile label={`Faturas de ${monthLabelLong(nextMonth.month).split(' ')[0]}`} hint={`${estimates ? 'Com' : 'Sem'} estimativa de novos gastos`}>
          <Money value={nextMonth.cardsTotal} />
        </Tile>
        <Tile label="Parcelas a pagar" hint={p.lastInstallmentMonth ? `Última em ${monthLabel(p.lastInstallmentMonth)}` : 'Nenhuma compra parcelada'}>
          <Money value={p.remainingInstallments} />
        </Tile>
        <Tile label={`Saldo em ${monthLabel(last.month)}`} hint={`Partindo de ${monthLabel(currentMonth())}`}>
          <Money value={last.balance} className={last.balance < 0 ? 'text-[var(--critical)]' : ''} />
        </Tile>
      </div>

      <Milestones p={p} />

      <MonthlyChart p={p} dark={dark} estimates={estimates} />

      <div className="card">
        <div className="card-title">Saldo projetado</div>
        <div className="card-sub">Saldo previsto no fim de cada mês, começando pelo fim deste mês</div>
        <div className="mt-3">
          <TrendLine data={[{ month: currentMonth(), value: p.startBalance }, ...p.months.map((m) => ({ month: m.month, value: m.balance }))]} name="Saldo projetado" />
        </div>
      </div>

      <MonthTable p={p} estimates={estimates} />

      <div className="grid gap-4 xl:grid-cols-2">
        {p.cards.map((o) => (
          <CardPanel key={o.card.account.id} o={o} estimates={estimates} />
        ))}
      </div>
      {!p.cards.length && <Empty>Nenhum cartão de crédito vinculado.</Empty>}

      <p className="flex items-start gap-2 px-1 text-xs text-[var(--muted)]">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          A estimativa de novos gastos usa a média das compras à vista no cartão nas últimas 3 faturas e a média dos gastos no débito/Pix
          (<Money value={p.avgVariable} />/mês). Compras parceladas que você ainda vai fazer não entram. Parcelas marcadas como “deduzidas”
          ainda não foram informadas pelo banco e foram calculadas a partir da última parcela conhecida.
        </span>
      </p>
    </div>
  );
}

function Tile({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="card !p-4">
      <div className="text-xs font-medium text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 whitespace-nowrap text-lg font-semibold xl:text-2xl">{children}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
    </div>
  );
}

/** Respostas diretas: quando fico livre das parcelas, quando cada cartão zera, quanto guardo. */
function Milestones({ p }: { p: Projection }) {
  const items: { icon: typeof CalendarCheck; text: React.ReactNode }[] = [];
  if (p.lastInstallmentMonth) {
    items.push({
      icon: CalendarCheck,
      text: (
        <>
          Você fica <b>livre de todas as parcelas</b> depois da fatura de <b>{monthLabelLong(p.lastInstallmentMonth)}</b>.
        </>
      ),
    });
  }
  for (const o of p.cards) {
    if (o.zeroFrom)
      items.push({
        icon: CalendarCheck,
        text: (
          <>
            <b>{o.card.account.name}</b>: se você parar de usar o cartão, a fatura <b>zera em {monthLabelLong(o.zeroFrom)}</b>
            {o.lastInstallmentMonth ? <> (última parcela em {monthLabel(o.lastInstallmentMonth)})</> : null}.
          </>
        ),
      });
  }
  const positive = p.months.filter((m) => m.leftover > 0);
  const saved = p.months[p.months.length - 1].balance - p.startBalance;
  items.push({
    icon: PiggyBank,
    text:
      saved >= 0 ? (
        <>
          Até {monthLabelLong(p.months[p.months.length - 1].month)} você deve conseguir <b>guardar <Money value={saved} /></b> ({positive.length} de {p.months.length} meses com sobra).
        </>
      ) : (
        <>
          Até {monthLabelLong(p.months[p.months.length - 1].month)} as saídas superam as entradas em <b><Money value={-saved} /></b>. Vale rever gastos ou parcelamentos.
        </>
      ),
  });
  return (
    <div className="card">
      <div className="card-title">Marcos</div>
      <ul className="mt-2 space-y-2">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Icon size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <span>{it.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MonthlyChart({ p, dark, estimates }: { p: Projection; dark: boolean; estimates: boolean }) {
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  const series = [
    { key: 'installments', label: 'Parcelas', color: palette[0] },
    { key: 'card', label: estimates ? 'Compras no cartão (lançadas + estimadas)' : 'Compras no cartão já lançadas', color: palette[1] },
    { key: 'fixed', label: 'Despesas previstas', color: palette[2] },
    ...(estimates ? [{ key: 'variable', label: 'Gastos no débito/Pix (estimados)', color: palette[3] }] : []),
  ];
  const data = p.months.map((m) => ({
    month: m.month,
    installments: m.installments,
    card: Math.max(0, m.purchases + m.cardEstimated),
    fixed: m.fixed,
    variable: m.variable,
    income: m.income,
  }));
  return (
    <div className="card">
      <div className="card-title">Para onde vai a sua renda</div>
      <div className="card-sub">Saídas previstas em cada mês comparadas com as receitas (linha tracejada)</div>
      <div className="mt-3">
        <ProjectionBars data={data} series={series} incomeLabel={p.incomeSource === 'planned' ? 'Receitas previstas' : 'Receitas (média)'} />
      </div>
    </div>
  );
}

function MonthTable({ p, estimates }: { p: Projection; estimates: boolean }) {
  return (
    <div className="card">
      <div className="card-title">Mês a mês</div>
      <div className="card-sub">Sobra = receitas − faturas − despesas previstas{estimates ? ' − gastos no débito' : ''}</div>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[640px] whitespace-nowrap text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)]">
              <th className="py-2 pr-2 font-medium">Mês</th>
              <th className="py-2 pr-2 text-right font-medium">Receitas</th>
              <th className="py-2 pr-2 text-right font-medium">Faturas</th>
              <th className="py-2 pr-2 text-right font-medium">Previstas</th>
              {estimates && <th className="py-2 pr-2 text-right font-medium">Débito/Pix</th>}
              <th className="py-2 pr-2 text-right font-medium">Sobra</th>
              <th className="py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {p.months.map((m) => (
              <tr key={m.month}>
                <td className="py-2 pr-2 font-medium">{cap(monthLabel(m.month))}</td>
                <td className="py-2 pr-2 text-right"><Money value={m.income} /></td>
                <td className="py-2 pr-2 text-right">
                  <Money value={m.cardsTotal} />
                  {m.installments > 0 && <div className="text-[11px] text-[var(--muted)]">parcelas <Money value={m.installments} /></div>}
                </td>
                <td className="py-2 pr-2 text-right"><Money value={m.fixed} /></td>
                {estimates && <td className="py-2 pr-2 text-right"><Money value={m.variable} /></td>}
                <td className="py-2 pr-2 text-right font-semibold">
                  <Money value={m.leftover} signed className={m.leftover < 0 ? 'text-[var(--critical)]' : 'text-[var(--good-text)]'} />
                </td>
                <td className="py-2 text-right"><Money value={m.balance} className={m.balance < 0 ? 'text-[var(--critical)]' : ''} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CardPanel({ o, estimates }: { o: CardOutlook; estimates: boolean }) {
  const [open, setOpen] = useState(false);
  const ym = currentMonth();
  const end = o.lastInstallmentMonth && o.lastInstallmentMonth > addMonthsYM(ym, 5) ? o.lastInstallmentMonth : addMonthsYM(ym, 5);
  const rows = Object.entries(o.byMonth).filter(([m]) => m <= end);
  const maxTotal = Math.max(1, ...rows.map(([, c]) => c.installments + Math.max(0, c.purchases) + (estimates ? c.estimated : 0)));

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.card.account.institutionColor }} />
        <div className="min-w-0 flex-1">
          <div className="card-title truncate">{o.card.account.name}</div>
          <div className="card-sub">
            {o.lastInstallmentMonth ? <>Parcelas até {monthLabel(o.lastInstallmentMonth)} · </> : null}
            compras à vista: média de <Money value={o.avgPurchases} />/fatura
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {rows.map(([m, c]) => {
          const purchases = Math.max(0, c.purchases);
          const est = estimates ? c.estimated : 0;
          const total = c.installments + purchases + est;
          return (
            <div key={m} className="flex items-center gap-2 text-sm">
              <span className="w-14 shrink-0 text-xs font-medium text-[var(--ink-2)]">{monthLabel(m)}</span>
              <div className="flex h-2.5 min-w-0 flex-1 gap-[2px] overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10" title="Parcelas · compras lançadas · estimativa">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${(c.installments / maxTotal) * 100}%` }} />
                <div className="h-full bg-[var(--accent)] opacity-60" style={{ width: `${(purchases / maxTotal) * 100}%` }} />
                <div className="h-full bg-[var(--accent)] opacity-25" style={{ width: `${(est / maxTotal) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right">
                {c.paid ? <span className="text-xs text-[var(--good-text)]">paga</span> : <Money value={total} className="text-sm font-medium" />}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> parcelas</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--accent)] opacity-60" /> compras já lançadas</span>
        {estimates && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--accent)] opacity-25" /> estimativa</span>}
      </div>

      {o.plans.length > 0 && (
        <div className="mt-4 border-t border-black/5 pt-3 dark:border-white/10">
          <button className="flex w-full items-center gap-2 text-left text-sm font-medium" onClick={() => setOpen(!open)}>
            <span className="min-w-0 flex-1">{o.plans.length} {o.plans.length === 1 ? 'compra parcelada' : 'compras parceladas'}</span>
            <span className="shrink-0 text-[var(--ink-2)]">
              <Money value={o.remainingInstallments} className="font-semibold text-[var(--ink)]" /> a pagar
            </span>
            <ChevronDown size={16} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="mt-2 divide-y divide-black/5 dark:divide-white/10">
              {o.plans.map((pl) => (
                <div key={pl.key} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{pl.description}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--ink-2)]">
                      <span>
                        parcela {pl.nextNumber}/{pl.total} · faltam {pl.remaining} × <Money value={pl.amount} /> · termina em {monthLabel(pl.endMonth)}
                      </span>
                      {pl.projected && (
                        <span className="chip bg-blue-500/10 text-blue-700 dark:text-blue-300">
                          <Wand2 size={11} /> deduzidas
                        </span>
                      )}
                    </div>
                  </div>
                  <Money value={pl.remainingAmount} className="shrink-0 text-sm font-semibold" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
