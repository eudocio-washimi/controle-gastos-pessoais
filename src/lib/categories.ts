import {
  ArrowLeftRight, Banknote, Car, CircleDashed, CreditCard, GraduationCap, HeartPulse, Home, Landmark,
  PiggyBank, Plane, Receipt, ShoppingBag, ShoppingCart, Ticket, Tv, Utensils, Wallet, Zap, type LucideIcon,
} from 'lucide-react';

export type CategoryKey =
  | 'alimentacao' | 'mercado' | 'transporte' | 'moradia' | 'contas' | 'saude' | 'educacao' | 'lazer'
  | 'compras' | 'assinaturas' | 'viagem' | 'impostos' | 'tarifas' | 'investimentos' | 'transferencias'
  | 'transferencia_propria' | 'pagamento_fatura' | 'salario' | 'outras_receitas' | 'outros';

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  icon: LucideIcon;
  /** Categorias que não representam consumo (não entram no total de gastos). */
  excluded?: boolean;
  income?: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'alimentacao', label: 'Alimentação', icon: Utensils },
  { key: 'mercado', label: 'Supermercado', icon: ShoppingCart },
  { key: 'transporte', label: 'Transporte', icon: Car },
  { key: 'moradia', label: 'Moradia', icon: Home },
  { key: 'contas', label: 'Contas e serviços', icon: Zap },
  { key: 'saude', label: 'Saúde', icon: HeartPulse },
  { key: 'educacao', label: 'Educação', icon: GraduationCap },
  { key: 'lazer', label: 'Lazer', icon: Ticket },
  { key: 'compras', label: 'Compras', icon: ShoppingBag },
  { key: 'assinaturas', label: 'Assinaturas', icon: Tv },
  { key: 'viagem', label: 'Viagem', icon: Plane },
  { key: 'impostos', label: 'Impostos', icon: Landmark },
  { key: 'tarifas', label: 'Tarifas bancárias', icon: Receipt },
  { key: 'investimentos', label: 'Investimentos', icon: PiggyBank, excluded: true },
  { key: 'transferencias', label: 'Transferências', icon: ArrowLeftRight },
  { key: 'transferencia_propria', label: 'Entre minhas contas', icon: ArrowLeftRight, excluded: true },
  { key: 'pagamento_fatura', label: 'Pagamento de fatura', icon: CreditCard, excluded: true },
  { key: 'salario', label: 'Salário', icon: Wallet, income: true },
  { key: 'outras_receitas', label: 'Outras receitas', icon: Banknote, income: true },
  { key: 'outros', label: 'Outros', icon: CircleDashed },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CategoryKey, CategoryDef>;

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => !c.excluded && !c.income);

// Regras de mapeamento das categorias do Pluggy (em inglês) e, como fallback, da descrição.
const RULES: [RegExp, CategoryKey][] = [
  [/credit card payment|pagamento (de )?fatura|pagamento recebido/i, 'pagamento_fatura'],
  [/same person transfer|transfer - internal|entre contas|para poupan|da conta corrente/i, 'transferencia_propria'],
  [/salary|sal[aá]rio|retirement|pension/i, 'salario'],
  [/investment|mutual funds|fixed income|variable income|interests and dividends|aplica[cç][aã]o|cdb|tesouro|rendimento/i, 'investimentos'],
  [/streaming|digital services|gaming|netflix|spotify|prime video|disney/i, 'assinaturas'],
  [/eating out|food delivery|food and drinks|restaurant|ifood|rappi|padaria|lanchonete/i, 'alimentacao'],
  [/groceries|supermercado|mercado|atacad|hortifruti|feira/i, 'mercado'],
  [/taxi|ride-hailing|public transportation|car rental|automotive|gas station|parking|toll|vehicle|bicycle|transportation|uber|\b99\b|posto|combust/i, 'transporte'],
  [/rent|housing|aluguel|condom|urban land|iptu/i, 'moradia'],
  [/^services$|utilities|electricity|water|\bgas\b|internet|mobile|telecommunications|\btv\b|energia|sabesp|enel/i, 'contas'],
  [/health|pharmacy|dentist|hospital|optometry|wellness|gym|fitness|farm[aá]cia|drogasil|droga raia|unimed|academia/i, 'saude'],
  [/education|university|course|school|escola|faculdade|curso/i, 'educacao'],
  [/airport|airline|accomodation|accommodation|travel|mileage|bus tickets|hotel|viagem/i, 'viagem'],
  [/leisure|tickets|cinema|theater|concert|museum|stadium|sports|gambling|lottery|bet|bar\b/i, 'lazer'],
  [/shopping|electronics|clothing|kids|toys|bookstore|office supplies|sports goods|pet|amazon|mercado livre|magalu|renner/i, 'compras'],
  [/tax|imposto|iof|legal obligations/i, 'impostos'],
  [/interests charged|late payment|overdraft|bank fees|account fees|atm|wire transfer fees|credit card fees|tarifa/i, 'tarifas'],
  [/transfer|pix|ted|doc\b/i, 'transferencias'],
];

export function categorize(rawCategory: string | null, description: string, kind: 'expense' | 'income'): CategoryKey {
  const sources = [rawCategory ?? '', description];
  for (const src of sources) {
    if (!src) continue;
    for (const [re, key] of RULES) {
      if (!re.test(src)) continue;
      const def = CATEGORY_MAP[key];
      if (kind === 'income' && !def.income && !def.excluded) continue;
      if (kind === 'expense' && def.income) continue;
      return key;
    }
  }
  return kind === 'income' ? 'outras_receitas' : 'outros';
}

// Paleta categórica validada (ordem fixa = mecanismo de segurança para daltonismo).
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
export const OTHER_COLOR = { light: '#9a998f', dark: '#6b6a64' };
export const OTHERS_KEY = '__outros__';
