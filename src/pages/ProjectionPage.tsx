import { AlertTriangle, CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, Info, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProjectionBars } from '../components/charts/Charts.tsx';
import { CategoryIcon, Empty, Money } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { SERIES_DARK, SERIES_LIGHT } from '../lib/categories.ts';
import { currentMonth } from '../lib/dates.ts';
import { formatDate, monthLabel, monthLabelLong } from '../lib/format.ts';
import { project, type CardMonth, type CardOutlook, type Projection, type ProjectionMonth } from '../lib/projection.ts';
import { load, save } from '../lib/storage.ts';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ProjectionPage() {
  const { txs, cards, planned, overrides, forecast, dark } = useApp();
  const [estimates, setEstimates] = useState(() => load('projectionEstimates', true));
  const p = useMemo(
    () => (forecast ? project(txs, cards, planned, overrides, forecast.avgVariable3m, estimates) : null),
    [txs, cards, planned, overrides, forecast, estimates],
  );
  const [selected, setSelected] = useState<string | null>(null);
  if (!p) return null;

  // Abre no próximo mês: o atual já aparece no Início e em Planejamento.
  const months = p.months.map((m) => m.month);
  const month = selected && months.includes(selected) ? selected : months[Math.min(1, months.length - 1)];
  const idx = months.indexOf(month);
  const m = p.months[idx];

  const toggle = () => {
    save('projectionEstimates', !estimates);
    setEstimates(!estimates);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="card-title">Projeção mês a mês</div>
            <p className="card-sub mt-1">Cada mês mostra só os valores dele: as faturas que vencem no mês, as receitas e as despesas previstas.</p>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={estimates} onChange={toggle} />
            Incluir estimativa de novos gastos
          </label>
        </div>
        <div className="mt-3 flex justify-center">
          <div className="flex items-center gap-1 rounded-xl border border-black/10 px-1 dark:border-white/15">
            <button className="btn-ghost !p-1.5" disabled={idx <= 0} onClick={() => setSelected(months[idx - 1])} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="inline-block min-w-[9.5rem] text-center text-sm font-medium first-letter:uppercase">
              {monthLabelLong(month)}
              {month === currentMonth() && <span className="ml-1 text-xs font-normal text-[var(--muted)]">(atual)</span>}
            </span>
            <button className="btn-ghost !p-1.5" disabled={idx >= months.length - 1} onClick={() => setSelected(months[idx + 1])} aria-label="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {p.incomeSource === 'average' && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-800 dark:text-blue-300">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            Receitas estimadas pela média dos últimos 3 meses (<Money value={p.avgIncome3m} />). Para uma projeção mais precisa,{' '}
            <a href="#/planejamento" className="font-medium underline">cadastre seu salário em Planejamento</a>.
          </span>
        </div>
      )}

      <MonthSummary m={m} />

      <BillsOfMonth p={p} month={month} estimates={estimates} />

      <PlannedOfMonth m={m} estimates={estimates} />

      <Milestones p={p} />

      <MonthlyChart p={p} dark={dark} estimates={estimates} selected={month} onSelect={setSelected} />

      <MonthTable p={p} estimates={estimates} selected={month} onSelect={setSelected} />

      <div className="grid gap-4 xl:grid-cols-2">
        {p.cards
          .filter((o) => o.plans.length)
          .map((o) => (
            <InstallmentPlans key={o.card.account.id} o={o} />
          ))}
      </div>

      <p className="flex items-start gap-2 px-1 text-xs text-[var(--muted)]">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          A estimativa de novos gastos usa a média das compras à vista no cartão nas últimas 3 faturas e a média dos gastos no débito/Pix
          (<Money value={p.avgVariable} />/mês). Compras parceladas que você ainda vai fazer não entram. Parcelas marcadas como “deduzida”
          ainda não foram informadas pelo banco e foram calculadas a partir da última parcela conhecida.
        </span>
      </p>
    </div>
  );
}

function Tile({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card !p-4">
      <div className="text-xs font-medium text-[var(--ink-2)]">{label}</div>
      <div className="mt-1 whitespace-nowrap text-lg font-semibold xl:text-2xl">{children}</div>
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

function MonthSummary({ m }: { m: ProjectionMonth }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Receitas do mês">
          <Money value={m.income} className="text-[var(--good-text)]" />
        </Tile>
        <Tile label="Faturas do mês" hint={m.installments > 0 ? undefined : 'Sem parcelas'}>
          <Money value={m.cardsTotal} />
          {m.installments > 0 && (
            <div className="mt-1 text-xs font-normal text-[var(--muted)]">
              parcelas <Money value={m.installments} />
            </div>
          )}
        </Tile>
        <Tile label="Outras saídas" hint={m.variable > 0 ? 'Previstas + débito/Pix' : 'Despesas previstas'}>
          <Money value={m.fixed + m.variable} />
        </Tile>
        <Tile label="Sobra do mês" hint="Receitas − todas as saídas">
          <Money value={m.leftover} signed className={m.leftover < 0 ? 'text-[var(--critical)]' : 'text-[var(--good-text)]'} />
        </Tile>
      </div>
      {m.leftover < 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--critical)]/30 bg-[var(--critical)]/10 px-3 py-2 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--critical)]" />
          <span>
            Em {monthLabelLong(m.month)} as saídas superam as receitas em <b><Money value={-m.leftover} /></b>.
          </span>
        </div>
      )}
    </>
  );
}

/** Faturas que vencem no mês escolhido, com os lançamentos de cada uma. */
function BillsOfMonth({ p, month, estimates }: { p: Projection; month: string; estimates: boolean }) {
  if (!p.cards.length) return <Empty>Nenhum cartão de crédito vinculado.</Empty>;
  return (
    <div className="card">
      <div className="card-title">Faturas de {monthLabelLong(month)}</div>
      <div className="card-sub">Só o que é cobrado nas faturas deste mês. Toque num cartão para ver os lançamentos.</div>
      <div className="mt-2 divide-y divide-black/5 dark:divide-white/10">
        {p.cards.map((o) => (
          <BillRow key={`${o.card.account.id}-${month}`} o={o} c={o.byMonth[month]} estimates={estimates} />
        ))}
      </div>
    </div>
  );
}

function BillRow({ o, c, estimates }: { o: CardOutlook; c: CardMonth | undefined; estimates: boolean }) {
  const [open, setOpen] = useState(false);
  if (!c) return null;
  const total = c.installments + c.purchases + (estimates ? c.estimated : 0);
  return (
    <div className="py-3">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)} disabled={!c.items.length}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.card.account.institutionColor }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.card.account.name}</span>
        {c.paid && <span className="chip bg-[var(--good)]/10 text-[var(--good-text)]">paga</span>}
        <Money value={total} className="shrink-0 text-sm font-semibold" />
        {c.items.length > 0 && <ChevronDown size={16} className={`shrink-0 text-[var(--muted)] transition ${open ? 'rotate-180' : ''}`} />}
      </button>
      <div className="mt-1.5 space-y-0.5 pl-5 text-xs text-[var(--ink-2)]">
        <Line label={`Parcelas (${c.items.filter((i) => i.installment).length})`} value={c.installments} />
        <Line label={`Compras à vista já lançadas (${c.items.filter((i) => !i.installment).length})`} value={c.purchases} />
        {estimates && <Line label="Estimativa de novas compras" value={c.estimated} muted />}
      </div>
      {open && (
        <div className="mt-2 space-y-1.5 border-t border-black/5 pl-5 pt-2 dark:border-white/10">
          {c.items.map((it, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="truncate">{it.description}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
                  {it.projected ? (
                    <span className="chip bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      <Wand2 size={11} /> deduzida
                    </span>
                  ) : (
                    <span>{formatDate(it.date)}</span>
                  )}
                  {it.installment && <span>parcela {it.installment.number}/{it.installment.total}</span>}
                </div>
              </div>
              <Money value={it.amount} className={`shrink-0 ${it.amount < 0 ? 'text-[var(--good-text)]' : ''}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? 'text-[var(--muted)]' : ''}`}>
      <span>{label}</span>
      <Money value={value} />
    </div>
  );
}

/** Receitas e despesas de Planejamento do mês, mais a estimativa de débito/Pix. */
function PlannedOfMonth({ m, estimates }: { m: ProjectionMonth; estimates: boolean }) {
  const items = [...m.occurrences].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="card">
      <div className="card-title">Receitas e despesas de {monthLabelLong(m.month)}</div>
      <div className="card-sub">
        Cadastradas em <a href="#/planejamento" className="underline">Planejamento</a>
      </div>
      <div className="mt-2 divide-y divide-black/5 dark:divide-white/10">
        {items.map((o) => {
          const income = o.entry.type === 'income';
          return (
            <div key={o.key} className="flex items-center gap-3 py-2">
              <CategoryIcon category={o.entry.category} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{o.entry.description}</div>
                <div className="text-xs text-[var(--muted)]">{formatDate(o.date)}</div>
              </div>
              <Money value={income ? o.entry.amount : -o.entry.amount} signed className={`text-sm font-medium ${income ? 'text-[var(--good-text)]' : ''}`} />
            </div>
          );
        })}
        {!items.length && <Empty>Nada cadastrado para este mês.</Empty>}
        {estimates && m.variable > 0 && (
          <div className="flex items-center justify-between gap-3 py-2 text-sm text-[var(--ink-2)]">
            <span>Gastos no débito/Pix (estimativa)</span>
            <Money value={-m.variable} signed />
          </div>
        )}
      </div>
    </div>
  );
}

/** Quando terminam as parcelas, quando cada cartão zera e quais meses fecham no vermelho. */
function Milestones({ p }: { p: Projection }) {
  const items: React.ReactNode[] = [];
  if (p.lastInstallmentMonth)
    items.push(
      <>
        Você fica <b>livre de todas as parcelas</b> depois da fatura de <b>{monthLabelLong(p.lastInstallmentMonth)}</b>.
      </>,
    );
  for (const o of p.cards) {
    if (o.zeroFrom)
      items.push(
        <>
          <b>{o.card.account.name}</b>: se você parar de usar o cartão, a fatura <b>zera em {monthLabelLong(o.zeroFrom)}</b>
          {o.lastInstallmentMonth ? <> (última parcela em {monthLabel(o.lastInstallmentMonth)})</> : null}.
        </>,
      );
  }
  const negative = p.months.filter((m) => m.leftover < 0);
  if (negative.length)
    items.push(
      <>
        Meses em que as saídas superam as receitas: <b>{negative.map((m) => monthLabel(m.month)).join(', ')}</b>.
      </>,
    );
  if (!items.length) return null;
  return (
    <div className="card">
      <div className="card-title">Marcos</div>
      <ul className="mt-2 space-y-2">
        {items.map((text, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <CalendarCheck size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonthlyChart({
  p, dark, estimates, selected, onSelect,
}: { p: Projection; dark: boolean; estimates: boolean; selected: string; onSelect: (m: string) => void }) {
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
      <div className="card-title">Comparar meses</div>
      <div className="card-sub">Saídas de cada mês e as receitas (linha tracejada). Toque num mês para ver o detalhe.</div>
      <div className="mt-3">
        <ProjectionBars
          data={data}
          series={series}
          incomeLabel={p.incomeSource === 'planned' ? 'Receitas previstas' : 'Receitas (média)'}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function MonthTable({
  p, estimates, selected, onSelect,
}: { p: Projection; estimates: boolean; selected: string; onSelect: (m: string) => void }) {
  return (
    <div className="card">
      <div className="card-title">Tabela por mês</div>
      <div className="card-sub">Sobra = receitas − faturas − despesas previstas{estimates ? ' − débito/Pix' : ''}, cada mês isolado</div>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[560px] whitespace-nowrap text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)]">
              <th className="py-2 pr-2 font-medium">Mês</th>
              <th className="py-2 pr-2 text-right font-medium">Receitas</th>
              <th className="py-2 pr-2 text-right font-medium">Faturas</th>
              <th className="py-2 pr-2 text-right font-medium">Previstas</th>
              {estimates && <th className="py-2 pr-2 text-right font-medium">Débito/Pix</th>}
              <th className="py-2 text-right font-medium">Sobra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {p.months.map((m) => (
              <tr
                key={m.month}
                onClick={() => onSelect(m.month)}
                className={`cursor-pointer transition hover:bg-black/[0.03] dark:hover:bg-white/5 ${m.month === selected ? 'bg-emerald-600/10' : ''}`}
              >
                <td className="py-2 pr-2 font-medium">{cap(monthLabel(m.month))}</td>
                <td className="py-2 pr-2 text-right"><Money value={m.income} /></td>
                <td className="py-2 pr-2 text-right"><Money value={m.cardsTotal} /></td>
                <td className="py-2 pr-2 text-right"><Money value={m.fixed} /></td>
                {estimates && <td className="py-2 pr-2 text-right"><Money value={m.variable} /></td>}
                <td className="py-2 text-right font-semibold">
                  <Money value={m.leftover} signed className={m.leftover < 0 ? 'text-[var(--critical)]' : 'text-[var(--good-text)]'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Compras parceladas de um cartão: valor da parcela, quantas faltam e quando termina. */
function InstallmentPlans({ o }: { o: CardOutlook }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.card.account.institutionColor }} />
        <span className="min-w-0 flex-1">
          <span className="card-title block truncate">Parcelados · {o.card.account.name}</span>
          <span className="card-sub block">
            {o.plans.length} {o.plans.length === 1 ? 'compra' : 'compras'} · última parcela em {o.lastInstallmentMonth ? monthLabel(o.lastInstallmentMonth) : '—'}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[var(--muted)] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 divide-y divide-black/5 dark:divide-white/10">
          {o.plans.map((pl) => (
            <div key={pl.key} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm">{pl.description}</div>
                <div className="text-xs text-[var(--ink-2)]">
                  próxima {pl.nextNumber}/{pl.total} · faltam {pl.remaining} × <Money value={pl.amount} /> · termina em {monthLabel(pl.endMonth)}
                </div>
              </div>
              {pl.projected && (
                <span className="chip shrink-0 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                  <Wand2 size={11} /> deduzida
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
