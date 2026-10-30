import type { Account, Bill, SyncPayload, Transaction } from '../shared/types.ts';

// Dados fictícios, determinísticos, usados quando não há credenciais do Pluggy.

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const round = (n: number) => Math.round(n * 100) / 100;

interface Template {
  desc: string[];
  category: string;
  min: number;
  max: number;
  perMonth: number;
}

const CARD_SPENDING: Template[] = [
  { desc: ['iFood', 'Rappi', 'Restaurante Sabor Caseiro', 'Padaria Pão Quente', 'Burger House'], category: 'Eating out', min: 25, max: 140, perMonth: 9 },
  { desc: ['Uber', '99 Táxi'], category: 'Taxi and ride-hailing', min: 12, max: 55, perMonth: 7 },
  { desc: ['Netflix', 'Spotify', 'Amazon Prime'], category: 'Video streaming', min: 19.9, max: 55.9, perMonth: 2 },
  { desc: ['Amazon', 'Mercado Livre', 'Magalu', 'Renner'], category: 'Shopping', min: 40, max: 380, perMonth: 3 },
  { desc: ['Drogasil', 'Droga Raia'], category: 'Pharmacy', min: 18, max: 160, perMonth: 2 },
  { desc: ['Cinema Cinemark', 'Ingresso.com', 'Bar do Zé'], category: 'Leisure', min: 30, max: 220, perMonth: 2 },
  { desc: ['Posto Shell', 'Posto Ipiranga'], category: 'Gas stations', min: 120, max: 260, perMonth: 2 },
];

const DEBIT_SPENDING: Template[] = [
  { desc: ['Supermercado Pão de Açúcar', 'Carrefour', 'Atacadão'], category: 'Groceries', min: 80, max: 520, perMonth: 4 },
  { desc: ['Pix - Feira', 'Hortifruti'], category: 'Groceries', min: 20, max: 90, perMonth: 2 },
  { desc: ['Academia Smart Fit'], category: 'Gyms and fitness centers', min: 119.9, max: 119.9, perMonth: 1 },
  { desc: ['Enel Energia'], category: 'Electricity', min: 140, max: 260, perMonth: 1 },
  { desc: ['Sabesp'], category: 'Water', min: 60, max: 110, perMonth: 1 },
  { desc: ['Vivo Fibra'], category: 'Internet', min: 109.9, max: 109.9, perMonth: 1 },
  { desc: ['Pix - Transferência enviada'], category: 'Transfer - PIX', min: 30, max: 300, perMonth: 2 },
];

export function buildDemoData(): SyncPayload {
  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => round(a + rand() * (b - a));

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const nextDay = (day: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), day, 12);
    if (d < today) d.setMonth(d.getMonth() + 1);
    return d;
  };
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), 12);
  // Vencimento: o da fatura já fechada, se ainda não venceu; senão o da próxima.
  const dueFor = (closeDay: number, offset: number) => {
    const lastDue = addDays(addMonths(nextDay(closeDay), -1), offset);
    return lastDue >= today ? lastDue : addDays(nextDay(closeDay), offset);
  };
  const CARD_CYCLE: Record<string, { closeDay: number; offset: number }> = {
    'demo-nu-card': { closeDay: 3, offset: 7 },
    'demo-itau-card': { closeDay: 20, offset: 8 },
  };

  const accounts: Account[] = [
    { id: 'demo-nu-cc', itemId: 'demo-nu', institution: 'Nubank', institutionColor: '#820ad1', name: 'Conta Nubank', number: '1234567-8', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 0, creditData: null },
    { id: 'demo-itau-cc', itemId: 'demo-itau', institution: 'Itaú', institutionColor: '#ec7000', name: 'Conta Corrente Itaú', number: '09876-5', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 0, creditData: null },
    { id: 'demo-itau-poup', itemId: 'demo-itau', institution: 'Itaú', institutionColor: '#ec7000', name: 'Poupança Itaú', number: '09876-5/500', type: 'BANK', subtype: 'SAVINGS_ACCOUNT', balance: 0, creditData: null },
    {
      id: 'demo-nu-card', itemId: 'demo-nu', institution: 'Nubank', institutionColor: '#820ad1', name: 'Nubank Ultravioleta', number: '•••• 4321', type: 'CREDIT', subtype: 'CREDIT_CARD', balance: 0,
      creditData: { creditLimit: 8000, availableCreditLimit: 0, balanceCloseDate: iso(nextDay(3)), balanceDueDate: iso(dueFor(3, 7)), brand: 'MASTERCARD', level: 'BLACK' },
    },
    {
      id: 'demo-itau-card', itemId: 'demo-itau', institution: 'Itaú', institutionColor: '#ec7000', name: 'Itaú Click Platinum', number: '•••• 9876', type: 'CREDIT', subtype: 'CREDIT_CARD', balance: 0,
      creditData: { creditLimit: 5000, availableCreditLimit: 0, balanceCloseDate: iso(nextDay(20)), balanceDueDate: iso(dueFor(20, 8)), brand: 'VISA', level: 'PLATINUM' },
    },
  ];

  const tx: Transaction[] = [];
  let seq = 0;
  const add = (accountId: string, date: Date, description: string, amount: number, kind: Transaction['kind'], rawCategory: string) => {
    if (date > today) return;
    tx.push({ id: `demo-tx-${++seq}`, accountId, date: iso(date), description, amount: round(amount), kind, rawCategory });
  };

  for (let m = 6; m >= 0; m--) {
    const base = new Date(today.getFullYear(), today.getMonth() - m, 1, 12);
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const day = (d: number) => new Date(base.getFullYear(), base.getMonth(), Math.min(d, daysInMonth), 12);
    const seasonal = 1 + (m % 3 === 0 ? 0.15 : m % 2 === 0 ? -0.08 : 0.04);

    // Receitas fixas
    add('demo-itau-cc', day(5), 'Salário - Empresa XYZ Ltda', 8500, 'income', 'Salary');
    if (m % 2 === 1) add('demo-nu-cc', day(18), 'Pix recebido - Freelance', between(900, 1600), 'income', 'Entrepreneurial activities');
    add('demo-itau-poup', day(28), 'Rendimento poupança', between(18, 26), 'income', 'Investments');

    // Despesas fixas
    add('demo-itau-cc', day(10), 'Aluguel - Imobiliária Lar', 2200, 'expense', 'Rent');
    add('demo-itau-cc', day(15), 'Condomínio Ed. Primavera', 650, 'expense', 'Housing');
    add('demo-itau-cc', day(12), 'Plano de Saúde Unimed', 489.9, 'expense', 'Health insurance');
    add('demo-itau-cc', day(7), 'Aplicação CDB', 800, 'expense', 'Investments');
    add('demo-itau-poup', day(7), 'Transferência da conta corrente', 300, 'income', 'Same person transfer');
    add('demo-itau-cc', day(7), 'Transferência para poupança', 300, 'expense', 'Same person transfer');

    for (const t of DEBIT_SPENDING) {
      for (let i = 0; i < t.perMonth; i++) {
        add(rand() > 0.5 ? 'demo-nu-cc' : 'demo-itau-cc', day(1 + Math.floor(rand() * daysInMonth)), pick(t.desc), between(t.min, t.max) * seasonal, 'expense', t.category);
      }
    }
    for (const t of CARD_SPENDING) {
      for (let i = 0; i < t.perMonth; i++) {
        add(rand() > 0.4 ? 'demo-nu-card' : 'demo-itau-card', day(1 + Math.floor(rand() * daysInMonth)), pick(t.desc), between(t.min, t.max) * seasonal, 'expense', t.category);
      }
    }
  }

  // Pagamentos das faturas: valor das compras do ciclo anterior.
  const bills: Bill[] = [];
  for (const card of accounts.filter((a) => a.type === 'CREDIT')) {
    const { closeDay, offset } = CARD_CYCLE[card.id];
    const close = nextDay(closeDay);
    const payFrom = card.id === 'demo-nu-card' ? 'demo-nu-cc' : 'demo-itau-cc';
    for (let k = 1; k <= 6; k++) {
      const cEnd = addMonths(close, -k);
      const cStart = addMonths(cEnd, -1);
      const dueK = addDays(cEnd, offset);
      const total = round(
        tx.filter((t) => t.accountId === card.id && t.kind === 'expense' && t.date > iso(cStart) && t.date <= iso(cEnd)).reduce((s, t) => s + t.amount, 0),
      );
      if (total <= 0) continue;
      bills.push({ id: `demo-bill-${card.id}-${k}`, accountId: card.id, dueDate: iso(dueK), totalAmount: total, minimumPaymentAmount: round(total * 0.15) });
      add(payFrom, dueK, `Pagamento fatura ${card.name}`, total, 'expense', 'Credit card payment');
      add(card.id, dueK, 'Pagamento recebido', total, 'income', 'Credit card payment');
    }
  }

  // Saldos finais coerentes com as transações.
  const startBalances: Record<string, number> = { 'demo-nu-cc': 3200, 'demo-itau-cc': 6400, 'demo-itau-poup': 12000 };
  for (const a of accounts) {
    const net = tx.filter((t) => t.accountId === a.id).reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0);
    if (a.type === 'BANK') a.balance = round((startBalances[a.id] ?? 0) + net);
    else {
      a.balance = round(Math.max(0, -net));
      a.creditData!.availableCreditLimit = round(a.creditData!.creditLimit - a.balance);
    }
  }

  tx.sort((a, b) => b.date.localeCompare(a.date));
  return { accounts, transactions: tx, bills, syncedAt: new Date().toISOString(), demo: true, errors: [] };
}
