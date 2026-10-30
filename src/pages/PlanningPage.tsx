import { Check, CheckCircle2, Clock, EyeOff, Pencil, Plus, Repeat, RotateCcw, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { ForecastCard } from '../components/ForecastCard.tsx';
import { CategoryIcon, Empty, Modal, Money, Tabs } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { CATEGORIES, CATEGORY_MAP, type CategoryKey } from '../lib/categories.ts';
import { addMonthsYM, currentMonth, monthOf, todayISO } from '../lib/dates.ts';
import { formatBRL, formatDate, monthLabelLong, parseBRL } from '../lib/format.ts';
import { uid } from '../lib/storage.ts';
import type { Occurrence, OccurrenceStatus, PlannedEntry, Recurrence } from '../lib/types.ts';

const RECURRENCE_LABEL: Record<Recurrence, string> = { once: 'Único', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' };

const STATUS: Record<OccurrenceStatus, { label: string; color: string; icon: typeof Check }> = {
  confirmado: { label: 'Confirmado', color: 'var(--good)', icon: CheckCircle2 },
  pendente: { label: 'Pendente', color: 'var(--muted)', icon: Clock },
  atrasado: { label: 'Pendente · atrasado', color: 'var(--warning)', icon: TriangleAlert },
  ignorado: { label: 'Ignorado', color: 'var(--muted)', icon: EyeOff },
};

export default function PlanningPage() {
  const { occurrences, planned } = useApp();
  const [view, setView] = useState<'mes' | 'proximos' | 'cadastros'>('mes');
  const [editing, setEditing] = useState<PlannedEntry | 'new' | null>(null);

  const ym = currentMonth();
  const thisMonth = occurrences.filter((o) => monthOf(o.date) === ym);
  const upcoming = occurrences.filter((o) => o.date > `${ym}-31` && o.date <= `${addMonthsYM(ym, 3)}-31`);
  const confirmed = thisMonth.filter((o) => o.status === 'confirmado').length;

  return (
    <div className="space-y-4">
      <ForecastCard detailed />

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="card-title">Lançamentos previstos</div>
            <div className="card-sub">
              {confirmed} de {thisMonth.length} confirmados em {monthLabelLong(ym)} · confirmação automática quando o valor fica a até 5% e a data a até 2 dias
            </div>
          </div>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> Novo lançamento
          </button>
        </div>
        <div className="mt-3">
          <Tabs
            value={view}
            onChange={setView}
            options={[
              { value: 'mes', label: 'Este mês' },
              { value: 'proximos', label: 'Próximos 3 meses' },
              { value: 'cadastros', label: `Cadastros (${planned.length})` },
            ]}
          />
        </div>
        <div className="mt-2 divide-y divide-black/5 dark:divide-white/10">
          {view === 'cadastros'
            ? planned.map((e) => <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e)} />)
            : (view === 'mes' ? thisMonth : upcoming).map((o) => <OccurrenceRow key={o.key} occ={o} onEdit={() => setEditing(o.entry)} />)}
          {view === 'cadastros' && !planned.length && <Empty>Nenhum lançamento cadastrado.</Empty>}
          {view === 'mes' && !thisMonth.length && <Empty>Nenhum lançamento previsto para este mês.</Empty>}
          {view === 'proximos' && !upcoming.length && <Empty>Nada previsto para os próximos meses.</Empty>}
        </div>
      </div>

      {editing && <EntryForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function confirmDelete(entry: PlannedEntry, remove: (id: string) => void): boolean {
  const what = entry.recurrence === 'once' ? `"${entry.description}"` : `"${entry.description}" e todas as suas ocorrências (passadas e futuras)`;
  if (!confirm(`Excluir ${what}?`)) return false;
  remove(entry.id);
  return true;
}

function OccurrenceRow({ occ, onEdit }: { occ: Occurrence; onEdit: () => void }) {
  const { setOverride, removePlanned } = useApp();
  const s = STATUS[occ.status];
  const Icon = s.icon;
  const income = occ.entry.type === 'income';
  const open = occ.status === 'pendente' || occ.status === 'atrasado';

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <CategoryIcon category={occ.entry.category} />
      <div className="min-w-0 flex-1">
        <button className="truncate text-left text-sm font-medium hover:underline" onClick={onEdit}>{occ.entry.description}</button>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--ink-2)]">
          <span>{formatDate(occ.date)}</span>
          <span className="chip" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 14%, transparent)` }}>
            <Icon size={11} /> {s.label}
          </span>
          {occ.auto && (
            <span className="chip bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <Wand2 size={11} /> automático
            </span>
          )}
        </div>
        {occ.transaction && (
          <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
            ↳ {occ.transaction.description} · {formatDate(occ.transaction.date)} · {formatBRL(occ.transaction.amount)}
          </div>
        )}
      </div>
      <Money value={income ? occ.entry.amount : -occ.entry.amount} signed className={`text-sm font-semibold ${income ? 'text-[var(--good-text)]' : ''}`} />
      <div className="flex gap-1">
        {open && (
          <>
            <button className="btn-ghost !p-1.5" title="Marcar como confirmado" onClick={() => setOverride(occ.key, { status: 'confirmed' })}>
              <Check size={16} />
            </button>
            <button className="btn-ghost !p-1.5" title="Ignorar esta ocorrência" onClick={() => setOverride(occ.key, { status: 'ignored' })}>
              <EyeOff size={16} />
            </button>
          </>
        )}
        {occ.auto && (
          <button className="btn-ghost !p-1.5" title="Não é esta transação (desfazer confirmação)" onClick={() => setOverride(occ.key, { status: 'unmatched' })}>
            <RotateCcw size={16} />
          </button>
        )}
        {!open && !occ.auto && (
          <button className="btn-ghost !p-1.5" title="Voltar para pendente / detecção automática" onClick={() => setOverride(occ.key, null)}>
            <RotateCcw size={16} />
          </button>
        )}
        <button className="btn-ghost !p-1.5 text-[var(--critical)]" title="Excluir lançamento" aria-label="Excluir lançamento" onClick={() => confirmDelete(occ.entry, removePlanned)}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function EntryRow({ entry, onEdit }: { entry: PlannedEntry; onEdit: () => void }) {
  const { removePlanned } = useApp();
  const income = entry.type === 'income';
  return (
    <div className="flex items-center gap-3 py-3">
      <CategoryIcon category={entry.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.description}</div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-2)]">
          {entry.recurrence !== 'once' && <Repeat size={11} />}
          {RECURRENCE_LABEL[entry.recurrence]} · {entry.recurrence === 'once' ? formatDate(entry.date) : `desde ${formatDate(entry.date)}`} · {CATEGORY_MAP[entry.category].label}
        </div>
      </div>
      <Money value={income ? entry.amount : -entry.amount} signed className={`text-sm font-semibold ${income ? 'text-[var(--good-text)]' : ''}`} />
      <button className="btn-ghost !p-1.5" onClick={onEdit} aria-label="Editar">
        <Pencil size={16} />
      </button>
      <button
        className="btn-ghost !p-1.5 text-[var(--critical)]"
        aria-label="Excluir"
        onClick={() => confirmDelete(entry, removePlanned)}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function EntryForm({ initial, onClose }: { initial: PlannedEntry | null; onClose: () => void }) {
  const { savePlanned, removePlanned } = useApp();
  const [type, setType] = useState<PlannedEntry['type']>(initial?.type ?? 'expense');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [category, setCategory] = useState<CategoryKey>(initial?.category ?? 'outros');
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? 'once');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [error, setError] = useState('');

  const categories = CATEGORIES.filter((c) => (type === 'income' ? c.income : !c.income && c.key !== 'pagamento_fatura'));

  const submit = () => {
    const v = parseBRL(amount);
    if (!description.trim()) return setError('Informe uma descrição.');
    if (!(v > 0)) return setError('Informe um valor maior que zero.');
    if (!date) return setError('Informe a data prevista.');
    savePlanned({
      id: initial?.id ?? uid(),
      type,
      description: description.trim(),
      amount: Math.round(v * 100) / 100,
      date,
      category: categories.some((c) => c.key === category) ? category : categories[0].key,
      recurrence,
      endDate: recurrence !== 'once' && endDate ? endDate : null,
    });
    onClose();
  };

  return (
    <Modal title={initial ? 'Editar lançamento' : 'Novo lançamento previsto'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Tabs
          value={type}
          onChange={(t) => {
            setType(t);
            setCategory(t === 'income' ? 'salario' : 'outros');
          }}
          options={[
            { value: 'expense', label: 'Despesa' },
            { value: 'income', label: 'Receita' },
          ]}
        />
        <div>
          <label className="label" htmlFor="pl-desc">Descrição</label>
          <input id="pl-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pl-val">Valor (R$)</label>
            <input id="pl-val" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="label" htmlFor="pl-date">Data prevista</label>
            <input id="pl-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pl-cat">Categoria</label>
            <select id="pl-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)}>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pl-rec">Recorrência</label>
            <select id="pl-rec" className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>
              ))}
            </select>
          </div>
        </div>
        {recurrence !== 'once' && (
          <div>
            <label className="label" htmlFor="pl-end">Repetir até (opcional)</label>
            <input id="pl-end" type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        )}
        {error && <p className="text-sm text-[var(--critical)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          {initial && (
            <button
              type="button"
              className="btn-ghost mr-auto text-[var(--critical)]"
              onClick={() => {
                if (confirmDelete(initial, removePlanned)) onClose();
              }}
            >
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
