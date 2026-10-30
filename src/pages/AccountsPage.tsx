import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TxModal } from '../components/TxModal.tsx';
import { Empty, Money, MonthPicker, Tabs, TxRow } from '../components/ui.tsx';
import { useApp } from '../context/AppContext.tsx';
import { isIncome, isSpending } from '../lib/calc.ts';
import { formatDate } from '../lib/format.ts';
import type { Account, Tx } from '../lib/types.ts';

const ALL = '__all__';

const SUBTYPE: Record<string, string> = {
  CHECKING_ACCOUNT: 'Conta corrente',
  SAVINGS_ACCOUNT: 'Poupança',
  CREDIT_CARD: 'Cartão de crédito',
};

export default function AccountsPage() {
  const { payload, txs, month } = useApp();
  const [bank, setBank] = useState(ALL);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'expense' | 'income'>('all');
  const [selected, setSelected] = useState<Tx | null>(null);

  const institutions = useMemo(() => [...new Set(payload!.accounts.map((a) => a.institution))], [payload]);
  const accounts = payload!.accounts.filter((a) => bank === ALL || a.institution === bank);
  const ids = new Set((accountId ? accounts.filter((a) => a.id === accountId) : accounts).map((a) => a.id));

  const q = query.trim().toLowerCase();
  const list = txs.filter(
    (t) =>
      ids.has(t.accountId) &&
      t.date.startsWith(month) &&
      (kind === 'all' || t.kind === kind) &&
      (!q || t.description.toLowerCase().includes(q)),
  );
  const spent = list.filter(isSpending).reduce((s, t) => s + t.amount, 0);
  const received = list.filter(isIncome).reduce((s, t) => s + t.amount, 0);

  // Agrupa por dia para leitura de extrato.
  const byDay = new Map<string, Tx[]>();
  for (const t of list) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);

  return (
    <div className="space-y-4">
      <Tabs
        value={bank}
        onChange={(v) => {
          setBank(v);
          setAccountId(null);
        }}
        options={[{ value: ALL, label: 'Todos os bancos' }, ...institutions.map((i) => ({ value: i, label: i }))]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <AccountCard key={a.id} account={a} active={accountId === a.id} onClick={() => setAccountId(accountId === a.id ? null : a.id)} />
        ))}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="card-title">Extrato {accountId ? `· ${accounts.find((a) => a.id === accountId)?.name}` : ''}</div>
            <div className="card-sub">
              Entradas <Money value={received} className="text-[var(--good-text)]" /> · Saídas <Money value={spent} />
            </div>
          </div>
          <MonthPicker />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input className="input !pl-9" placeholder="Buscar descrição…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Tabs
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'Tudo' },
              { value: 'expense', label: 'Saídas' },
              { value: 'income', label: 'Entradas' },
            ]}
          />
        </div>
        <div className="mt-3">
          {[...byDay.entries()].map(([day, items]) => (
            <div key={day} className="mb-2">
              <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{formatDate(day)}</div>
              {items.map((t) => (
                <TxRow key={t.id} tx={t} onClick={() => setSelected(t)} />
              ))}
            </div>
          ))}
          {!list.length && <Empty>Nenhuma movimentação encontrada.</Empty>}
        </div>
      </div>

      {selected && <TxModal tx={txs.find((t) => t.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AccountCard({ account: a, active, onClick }: { account: Account; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`card text-left transition ${active ? 'ring-2 ring-emerald-500' : 'hover:shadow-md'}`}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: a.institutionColor }} />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">{a.institution}</span>
      </div>
      <div className="mt-2 truncate text-sm font-medium">{a.name}</div>
      <div className="text-xs text-[var(--muted)]">
        {SUBTYPE[a.subtype] ?? a.subtype}
        {a.number ? ` · ${a.number}` : ''}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-2)]">{a.type === 'CREDIT' ? 'Fatura atual' : 'Saldo'}</div>
      <Money value={a.balance} className="text-lg font-semibold" />
    </button>
  );
}
