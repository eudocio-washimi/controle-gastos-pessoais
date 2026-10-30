export type AccountType = 'BANK' | 'CREDIT';

export interface CreditData {
  creditLimit: number;
  availableCreditLimit: number;
  /** Próxima data de fechamento da fatura (ISO). */
  balanceCloseDate: string | null;
  /** Próxima data de vencimento da fatura (ISO). */
  balanceDueDate: string | null;
  brand: string | null;
  level: string | null;
}

export interface Account {
  id: string;
  itemId: string;
  institution: string;
  institutionColor: string;
  name: string;
  number: string | null;
  type: AccountType;
  subtype: string;
  /** BANK: saldo disponível. CREDIT: valor utilizado da fatura atual. */
  balance: number;
  creditData: CreditData | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  description: string;
  /** Sempre positivo; o sentido vem de `kind`. */
  amount: number;
  kind: 'expense' | 'income';
  /** Categoria original do Pluggy (em inglês). */
  rawCategory: string | null;
  /** Cartão: mês (YYYY-MM) da fatura em que o lançamento é cobrado. */
  billMonth?: string | null;
  /** Cartão: parcela de uma compra parcelada (ex.: 3 de 10). */
  installment?: Installment | null;
}

export interface Installment {
  number: number;
  total: number;
  /** Data da compra original (YYYY-MM-DD), quando o banco informa. */
  purchaseDate: string | null;
}

export interface Bill {
  id: string;
  accountId: string;
  dueDate: string;
  totalAmount: number;
  minimumPaymentAmount: number | null;
}

export interface SyncPayload {
  accounts: Account[];
  transactions: Transaction[];
  bills: Bill[];
  syncedAt: string;
  demo: boolean;
  errors: string[];
}

export interface ItemInfo {
  id: string;
  institution: string;
  status: string;
  source: 'env' | 'app';
}
