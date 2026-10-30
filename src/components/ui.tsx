import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, OctagonAlert, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useApp } from '../context/AppContext.tsx';
import type { LimitStatus } from '../lib/calc.ts';
import { CATEGORY_MAP, type CategoryKey } from '../lib/categories.ts';
import { addMonthsYM, currentMonth } from '../lib/dates.ts';
import { HIDDEN, formatBRL, formatDate, monthLabelLong } from '../lib/format.ts';
import type { Tx } from '../lib/types.ts';

export function Money({ value, className = '', signed = false }: { value: number; className?: string; signed?: boolean }) {
  const { hidden } = useApp();
  if (hidden) return <span className={`num ${className}`}>{HIDDEN}</span>;
  const prefix = signed && value > 0 ? '+' : '';
  return <span className={`num ${className}`}>{prefix}{formatBRL(value)}</span>;
}

/** Formata para uso em textos de gráficos/tooltips respeitando o modo "ocultar valores". */
export function useMoney() {
  const { hidden } = useApp();
  return (v: number) => (hidden ? HIDDEN : formatBRL(v));
}

export function CategoryIcon({ category, size = 36 }: { category: CategoryKey; size?: number }) {
  const { colorFor, seriesOf } = useApp();
  const def = CATEGORY_MAP[category];
  const Icon = def.icon;
  const color = def.income ? 'var(--good)' : def.excluded ? 'var(--muted)' : colorFor(seriesOf(category));
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <Icon size={size * 0.5} strokeWidth={2} />
    </span>
  );
}

export function TxRow({ tx, onClick }: { tx: Tx; onClick?: () => void }) {
  const income = tx.kind === 'income';
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/5">
      <CategoryIcon category={tx.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{tx.description}</div>
        <div className="truncate text-xs text-[var(--ink-2)]">
          {CATEGORY_MAP[tx.category].label} · {tx.account.institution} · {formatDate(tx.date)}
        </div>
      </div>
      <Money value={income ? tx.amount : -tx.amount} signed className={`text-sm font-semibold ${income ? 'text-[var(--good-text)]' : ''}`} />
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-[var(--muted)]">{children}</div>;
}

export function MonthPicker() {
  const { month, setMonth } = useApp();
  const isCurrent = month >= currentMonth();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-black/10 px-1 dark:border-white/15">
      <button className="btn-ghost !p-1.5" onClick={() => setMonth(addMonthsYM(month, -1))} aria-label="Mês anterior">
        <ChevronLeft size={16} />
      </button>
      <span className="inline-block min-w-[8.5rem] text-center text-sm font-medium first-letter:uppercase">{monthLabelLong(month)}</span>
      <button className="btn-ghost !p-1.5" disabled={isCurrent} onClick={() => setMonth(addMonthsYM(month, 1))} aria-label="Próximo mês">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export const STATUS_STYLE: Record<LimitStatus, { color: string; label: string; icon: typeof CheckCircle2 }> = {
  ok: { color: 'var(--good)', label: 'Dentro do limite', icon: CheckCircle2 },
  alerta: { color: 'var(--warning)', label: 'Próximo do limite', icon: AlertTriangle },
  estourado: { color: 'var(--critical)', label: 'Limite ultrapassado', icon: OctagonAlert },
};

export function StatusBadge({ status }: { status: LimitStatus }) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <span className="chip" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}>
      <Icon size={12} /> {s.label}
    </span>
  );
}

export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%`, background: color }} />
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-5 shadow-xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card !p-4">
      <div className="text-xs font-medium text-[var(--ink-2)]">{label}</div>
      <Money
        value={value}
        className={`mt-1 block whitespace-nowrap text-lg font-semibold xl:text-2xl ${tone === 'good' ? 'text-[var(--good-text)]' : tone === 'bad' ? 'text-[var(--critical)]' : ''}`}
      />
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button key={o.value} className={`tab ${value === o.value ? 'tab-active' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
