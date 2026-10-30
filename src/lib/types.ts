import type { Account, Transaction } from '../../shared/types.ts';
import type { CategoryKey } from './categories.ts';

export type { Account, Bill, SyncPayload, Transaction, ItemInfo } from '../../shared/types.ts';

export interface Tx extends Transaction {
  category: CategoryKey;
  account: Account;
}

export type Recurrence = 'once' | 'weekly' | 'monthly' | 'yearly';

export interface PlannedEntry {
  id: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  /** Data da primeira ocorrência (YYYY-MM-DD). */
  date: string;
  category: CategoryKey;
  recurrence: Recurrence;
  /** Última data em que a recorrência vale (opcional). */
  endDate?: string | null;
}

/** Decisões manuais sobre uma ocorrência (chave = `${entryId}@${data}`). */
export type OccurrenceOverride =
  | { status: 'confirmed'; transactionId?: string }
  | { status: 'ignored' }
  | { status: 'unmatched' };

export type OccurrenceStatus = 'confirmado' | 'pendente' | 'atrasado' | 'ignorado';

export interface Occurrence {
  key: string;
  entry: PlannedEntry;
  date: string;
  status: OccurrenceStatus;
  transaction?: Tx;
  auto: boolean;
}

export type CategoryLimits = Partial<Record<CategoryKey, number>>;
