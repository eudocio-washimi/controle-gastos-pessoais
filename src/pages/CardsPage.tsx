import { CheckCircle2, ChevronDown, Clock } from 'lucide-react';
import { useState } from 'react';
import { Gauge } from '../components/charts/Charts.tsx';
import { TxModal } from '../components/TxModal.tsx';
import { CategoryIcon, Empty, Money, ProgressBar, Tabs, TxRow } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import type { CardInfo } from '../lib/calc.ts';
import { CATEGORY_MAP, type CategoryKey } from '../lib/categories.ts';
import { formatDate } from '../lib/format.ts';
import type { Tx } from '../lib/types.ts';

export default function CardsPage() {
  const { cards } = useApp();
  if (!cards.length) return <Empty>Nenhum cartão de crédito vinculado.</Empty>;

  const totalLimit = cards.reduce((s, c) => s + c.limit, 0);
  const totalUsed = cards.reduce((s, c) => s + c.used, 0);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="card-sub">Limite total utilizado</div>
            <Money value={totalUsed} className="text-2xl font-semibold" /> <span className="text-sm text-[var(--ink-2)]">de <Money value={totalLimit} /></span>
          </div>
          <div className="text-sm text-[var(--ink-2)]">
            Disponível: <Money value={totalLimit - totalUsed} className="font-semibold text-[var(--ink)]" />
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar pct={totalLimit ? totalUsed / totalLimit : 0} color="var(--accent)" />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((c) => (
          <CreditCardPanel key={c.account.id} card={c} />
        ))}
      </div>
    </div>
  );
}

function CreditCardPanel({ card: c }: { card: CardInfo }) {
  const { txs } = useApp();
  const [which, setWhich] = useState<'open' | 'closed'>('open');
  const [selected, setSelected] = useState<Tx | null>(null);
  const [expanded, setExpanded] = useState<CategoryKey | null>(null);

  const invoice = which === 'open' ? c.open : c.closed;
  const items = invoice.txs.filter((t) => t.category !== 'pagamento_fatura');
  const groups = new Map<CategoryKey, Tx[]>();
  for (const t of items) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  const sorted = [...groups.entries()]
    .map(([k, list]) => ({ k, list, total: list.reduce((s, t) => s + (t.kind === 'expense' ? t.amount : -t.amount), 0) }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: c.account.institutionColor }} />
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">{c.account.institution}</span>
          </div>
          <div className="mt-1 truncate font-semibold">{c.account.name}</div>
          <div className="text-xs text-[var(--muted)]">
            {[c.account.creditData?.brand, c.account.creditData?.level, c.account.number].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div className="mt-3 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
        <Gauge pct={c.usedPct} />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-[var(--ink-2)]">Limite total</dt>
            <dd><Money value={c.limit} className="font-semibold" /></dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-2)]">Disponível</dt>
            <dd><Money value={c.available} className="font-semibold text-[var(--good-text)]" /></dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-2)]">Fechamento</dt>
            <dd className="num font-medium">{formatDate(c.nextClose)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-2)]">Vencimento</dt>
            <dd className="num font-medium">{formatDate(c.open.dueDate)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <InvoiceSummary
          title="Fatura aberta"
          amount={c.open.amount}
          note={`Fecha em ${formatDate(c.nextClose)}`}
          active={which === 'open'}
          onClick={() => setWhich('open')}
        />
        <InvoiceSummary
          title="Fatura fechada"
          amount={c.closed.amount}
          note={`${c.closed.paid ? 'Paga · vencimento' : c.closed.overdue ? 'Vencida em' : 'Vence em'} ${formatDate(c.closed.dueDate)}`}
          paid={c.closed.paid}
          active={which === 'closed'}
          onClick={() => setWhich('closed')}
        />
      </div>

      <div className="mt-4">
        <Tabs
          value={which}
          onChange={setWhich}
          options={[
            { value: 'open', label: 'Aberta' },
            { value: 'closed', label: 'Fechada' },
          ]}
        />
        <div className="mt-2 divide-y divide-black/5 dark:divide-white/10">
          {sorted.map(({ k, list, total }) => (
            <div key={k}>
              <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => setExpanded(expanded === k ? null : k)}>
                <CategoryIcon category={k} size={32} />
                <span className="flex-1 text-sm font-medium">
                  {CATEGORY_MAP[k].label} <span className="text-xs font-normal text-[var(--muted)]">({list.length})</span>
                </span>
                <Money value={total} className="text-sm font-semibold" />
                <ChevronDown size={16} className={`text-[var(--muted)] transition ${expanded === k ? 'rotate-180' : ''}`} />
              </button>
              {expanded === k && (
                <div className="pb-2 pl-4">
                  {list.map((t) => (
                    <TxRow key={t.id} tx={t} onClick={() => setSelected(t)} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {!sorted.length && <Empty>Nenhuma compra nesta fatura.</Empty>}
        </div>
      </div>
      {selected && <TxModal tx={txs.find((t) => t.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function InvoiceSummary(props: { title: string; amount: number; note: string; active: boolean; onClick: () => void; paid?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-xl border p-3 text-left transition ${props.active ? 'border-emerald-500 bg-emerald-500/5' : 'border-black/10 hover:bg-black/[0.02] dark:border-white/10'}`}
    >
      <div className="text-xs text-[var(--ink-2)]">{props.title}</div>
      <Money value={props.amount} className="block text-lg font-semibold" />
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
        {props.paid === undefined ? <Clock size={11} /> : props.paid ? <CheckCircle2 size={11} className="text-[var(--good)]" /> : <Clock size={11} className="text-[var(--warning)]" />}
        {props.note}
      </div>
    </button>
  );
}
