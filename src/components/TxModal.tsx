import { useApp } from '../context/AppContext.tsx';
import { CATEGORIES, CATEGORY_MAP } from '../lib/categories.ts';
import { formatDate } from '../lib/format.ts';
import type { Tx } from '../lib/types.ts';
import { CategoryIcon, Modal, Money } from './ui.tsx';

export function TxModal({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const { setTxCategory } = useApp();
  const options = CATEGORIES.filter((c) => (tx.kind === 'income' ? c.income || c.excluded : !c.income));
  return (
    <Modal title="Detalhes da transação" onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <CategoryIcon category={tx.category} size={44} />
        <div className="min-w-0">
          <div className="font-semibold">{tx.description}</div>
          <div className="text-xs text-[var(--ink-2)]">
            {tx.account.institution} · {tx.account.name} · {formatDate(tx.date)}
          </div>
        </div>
      </div>
      <Money value={tx.kind === 'income' ? tx.amount : -tx.amount} signed className="mb-4 block text-2xl font-semibold" />
      {tx.rawCategory && <p className="mb-3 text-xs text-[var(--muted)]">Categoria no Pluggy: {tx.rawCategory}</p>}
      <label className="label" htmlFor="tx-cat">Categoria</label>
      <select id="tx-cat" className="input" value={tx.category} onChange={(e) => setTxCategory(tx.id, e.target.value as Tx['category'])}>
        {options.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
            {c.excluded ? ' (não conta como gasto)' : ''}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-[var(--muted)]">A alteração vale só para esta transação e fica salva neste dispositivo.</p>
      <p className="mt-1 text-xs text-[var(--muted)]">Atual: {CATEGORY_MAP[tx.category].label}</p>
    </Modal>
  );
}
