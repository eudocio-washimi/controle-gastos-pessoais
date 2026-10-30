import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryDonut, CompareBars, LimitBars, StackedMonthly, TrendLine } from '../components/charts/Charts.tsx';
import { TxModal } from '../components/TxModal.tsx';
import { CategoryIcon, Empty, Modal, Money, MonthPicker, ProgressBar, STATUS_STYLE, StatusBadge, TxRow } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { averageSpending, isSpending, limitRows, spendingByCategory, totalSpending } from '../lib/calc.ts';
import { CATEGORY_MAP, EXPENSE_CATEGORIES, OTHERS_KEY, type CategoryKey } from '../lib/categories.ts';
import { addMonthsYM, lastMonths } from '../lib/dates.ts';
import { formatPct, monthLabelLong, parseBRL } from '../lib/format.ts';
import type { Tx } from '../lib/types.ts';

export default function CategoriesPage() {
  const { txs, month, colorFor, seriesOf, limits } = useApp();
  const [detail, setDetail] = useState<CategoryKey | null>(null);
  const [editing, setEditing] = useState<CategoryKey | 'new' | null>(null);

  const cur = spendingByCategory(txs, month);
  const prev = spendingByCategory(txs, addMonthsYM(month, -1));
  const total = totalSpending(txs, month);
  const ranked = (Object.entries(cur) as [CategoryKey, number][]).sort((a, b) => b[1] - a[1]);

  // Rosca: categorias fora dos 7 slots de cor somam em "Outros".
  const slices = useMemo(() => {
    const m = new Map<string, { key: string; label: string; value: number; color: string }>();
    for (const [k, v] of ranked) {
      const s = seriesOf(k);
      const entry = m.get(s) ?? { key: s, label: s === OTHERS_KEY ? 'Outros' : CATEGORY_MAP[k].label, value: 0, color: colorFor(s) };
      entry.value += v;
      m.set(s, entry);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [ranked, seriesOf, colorFor]);

  const compare = [...new Set([...Object.keys(cur), ...Object.keys(prev)])]
    .map((k) => ({ label: CATEGORY_MAP[k as CategoryKey].label, atual: cur[k as CategoryKey] ?? 0, anterior: prev[k as CategoryKey] ?? 0 }))
    .sort((a, b) => b.atual - a.atual)
    .slice(0, 8);

  const months = lastMonths(month, 6);
  const trend = months.map((m) => ({ month: m, value: totalSpending(txs, m) }));

  const seriesKeys = [...new Set(EXPENSE_CATEGORIES.map((c) => seriesOf(c.key)))];
  const series = seriesKeys
    .map((k) => ({ key: k, label: k === OTHERS_KEY ? 'Outros' : CATEGORY_MAP[k as CategoryKey].label, color: colorFor(k as CategoryKey) }))
    .sort((a, b) => (a.key === OTHERS_KEY ? 1 : b.key === OTHERS_KEY ? -1 : 0));
  const stacked = months.map((m) => {
    const row: Record<string, number | string> = { month: m };
    for (const [k, v] of Object.entries(spendingByCategory(txs, m)) as [CategoryKey, number][]) {
      const s = seriesOf(k);
      row[s] = Math.round(((row[s] as number) ?? 0) * 100 + v * 100) / 100;
    }
    return row;
  });
  const usedSeries = series.filter((s) => stacked.some((r) => r[s.key]));

  const limitsData = limitRows(txs, month, limits);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink-2)]">
          Total gasto em {monthLabelLong(month)}: <Money value={total} className="font-semibold text-[var(--ink)]" />
        </p>
        <MonthPicker />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-title">Distribuição por categoria</div>
          <div className="card-sub">Toque numa categoria para ver as transações</div>
          {ranked.length ? (
            <>
              <CategoryDonut data={slices} total={total} onSelect={(k) => k !== OTHERS_KEY && setDetail(k as CategoryKey)} />
              <div className="mt-2 divide-y divide-black/5 dark:divide-white/10">
                {ranked.map(([k, v]) => {
                  const avg = averageSpending(txs, month, 3, k);
                  return (
                    <button key={k} onClick={() => setDetail(k)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                      <CategoryIcon category={k} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{CATEGORY_MAP[k].label}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {formatPct(v / total)} do total · média 3m <Money value={avg} />
                        </div>
                      </div>
                      <Money value={v} className="text-sm font-semibold" />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty>Sem gastos neste mês.</Empty>
          )}
        </div>

        <div className="card">
          <div className="card-title">Mês atual × mês anterior</div>
          <div className="card-sub">
            {monthLabelLong(month)} comparado a {monthLabelLong(addMonthsYM(month, -1))}
          </div>
          <div className="mt-3">
            <CompareBars data={compare} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="card-title">Limites por categoria</div>
            <div className="card-sub">Gasto em {monthLabelLong(month)} em relação ao limite mensal</div>
          </div>
          <button className="btn-outline" onClick={() => setEditing('new')}>
            <Plus size={16} /> Definir limite
          </button>
        </div>
        {limitsData.length ? (
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <LimitBars data={limitsData.map((r) => ({ label: CATEGORY_MAP[r.category].label, spent: r.spent, limit: r.limit, color: STATUS_STYLE[r.status].color }))} />
            <div className="space-y-3">
              {limitsData.map((r) => (
                <div key={r.category}>
                  <div className="mb-1 flex items-center gap-2">
                    <CategoryIcon category={r.category} size={28} />
                    <span className="flex-1 text-sm font-medium">{CATEGORY_MAP[r.category].label}</span>
                    <StatusBadge status={r.status} />
                    <button className="btn-ghost !p-1" onClick={() => setEditing(r.category)} aria-label="Editar limite">
                      <Pencil size={14} />
                    </button>
                  </div>
                  <ProgressBar pct={r.pct} color={STATUS_STYLE[r.status].color} />
                  <div className="mt-1 flex justify-between text-xs text-[var(--ink-2)]">
                    <span>
                      <Money value={r.spent} /> de <Money value={r.limit} />
                    </span>
                    <span>{r.spent <= r.limit ? <>Restam <Money value={r.limit - r.spent} /></> : <>Excedeu <Money value={r.spent - r.limit} /></>}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty>Nenhum limite definido. Cadastre um limite mensal para acompanhar seus gastos.</Empty>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-title">Evolução dos gastos totais</div>
          <div className="card-sub">Últimos 6 meses · linha tracejada = média do período</div>
          <div className="mt-3">
            <TrendLine data={trend} name="Gastos" average={trend.reduce((s, t) => s + t.value, 0) / trend.length} />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Composição mensal dos gastos</div>
          <div className="card-sub">Cada barra é um mês, dividida por categoria</div>
          <div className="mt-3">
            <StackedMonthly data={stacked} series={usedSeries} />
          </div>
        </div>
      </div>

      {detail && <CategoryDetail category={detail} onClose={() => setDetail(null)} />}
      {editing && <LimitEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryDetail({ category, onClose }: { category: CategoryKey; onClose: () => void }) {
  const { txs, month } = useApp();
  const [selected, setSelected] = useState<Tx | null>(null);
  const list = txs.filter((t) => t.category === category && isSpending(t) && t.date.startsWith(month));
  const total = list.reduce((s, t) => s + t.amount, 0);
  if (selected) return <TxModal tx={txs.find((t) => t.id === selected.id) ?? selected} onClose={() => setSelected(null)} />;
  return (
    <Modal title={`${CATEGORY_MAP[category].label} · ${monthLabelLong(month)}`} onClose={onClose}>
      <div className="mb-2 text-sm text-[var(--ink-2)]">
        {list.length} transação(ões) · <Money value={total} className="font-semibold text-[var(--ink)]" />
      </div>
      {list.map((t) => (
        <TxRow key={t.id} tx={t} onClick={() => setSelected(t)} />
      ))}
      {!list.length && <Empty>Nenhuma transação.</Empty>}
    </Modal>
  );
}

function LimitEditor({ initial, onClose }: { initial: CategoryKey | null; onClose: () => void }) {
  const { limits, setLimit, txs, month } = useApp();
  const [category, setCategory] = useState<CategoryKey>(initial ?? EXPENSE_CATEGORIES.find((c) => !limits[c.key])?.key ?? 'alimentacao');
  const [value, setValue] = useState(String(limits[initial ?? category] ?? ''));
  const avg = averageSpending(txs, month, 3, category);

  const submit = () => {
    const v = parseBRL(value);
    setLimit(category, Number.isFinite(v) ? v : null);
    onClose();
  };

  return (
    <Modal title={initial ? 'Editar limite' : 'Definir limite mensal'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label className="label" htmlFor="lim-cat">Categoria</label>
          <select
            id="lim-cat"
            className="input"
            value={category}
            disabled={!!initial}
            onChange={(e) => {
              const k = e.target.value as CategoryKey;
              setCategory(k);
              setValue(String(limits[k] ?? ''));
            }}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lim-val">Limite mensal (R$)</label>
          <input id="lim-val" className="input" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sua média nos últimos 3 meses nesta categoria: <Money value={avg} />
          </p>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          {initial ? (
            <button
              type="button"
              className="btn-ghost text-[var(--critical)]"
              onClick={() => {
                setLimit(category, null);
                onClose();
              }}
            >
              Remover limite
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn-primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
