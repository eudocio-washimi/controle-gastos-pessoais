import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import {
  buildOccurrences, cardInfo, categorySlots, creditAccounts, enrich, forecast, slotKey, type CardInfo, type Forecast,
} from '../lib/calc.ts';
import { OTHER_COLOR, OTHERS_KEY, SERIES_DARK, SERIES_LIGHT, type CategoryKey } from '../lib/categories.ts';
import { addDaysISO, addMonthsISO, addMonthsYM, currentMonth, lastMonths, monthOf, todayISO } from '../lib/dates.ts';
import { load, save, uid } from '../lib/storage.ts';
import type { CategoryLimits, Occurrence, OccurrenceOverride, PlannedEntry, SyncPayload, Tx } from '../lib/types.ts';

interface AppState {
  payload: SyncPayload | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  sync: () => Promise<void>;
  txs: Tx[];
  cards: CardInfo[];
  planned: PlannedEntry[];
  savePlanned: (e: PlannedEntry) => void;
  removePlanned: (id: string) => void;
  overrides: Record<string, OccurrenceOverride>;
  setOverride: (key: string, ov: OccurrenceOverride | null) => void;
  occurrences: Occurrence[];
  forecast: Forecast | null;
  limits: CategoryLimits;
  setLimit: (c: CategoryKey, v: number | null) => void;
  setTxCategory: (txId: string, c: CategoryKey) => void;
  month: string;
  setMonth: (ym: string) => void;
  hidden: boolean;
  toggleHidden: () => void;
  dark: boolean;
  toggleTheme: () => void;
  /** Cor estável da categoria (ou de "Outros") no tema atual. */
  colorFor: (c: CategoryKey | typeof OTHERS_KEY) => string;
  /** Chave de série: a própria categoria, ou "Outros" se estiver fora dos 7 slots. */
  seriesOf: (c: CategoryKey) => CategoryKey | typeof OTHERS_KEY;
}

const Ctx = createContext<AppState | null>(null);

function demoPlanned(): PlannedEntry[] {
  const ym = currentMonth();
  const start = addMonthsYM(ym, -5);
  const tomorrow = addDaysISO(todayISO(), 1);
  const soon = monthOf(tomorrow) === ym ? tomorrow : todayISO();
  return [
    { id: uid(), type: 'income', description: 'Salário', amount: 8500, date: `${start}-05`, category: 'salario', recurrence: 'monthly' },
    { id: uid(), type: 'expense', description: 'Aluguel', amount: 2200, date: `${start}-10`, category: 'moradia', recurrence: 'monthly' },
    { id: uid(), type: 'expense', description: 'Plano de saúde', amount: 489.9, date: `${start}-12`, category: 'saude', recurrence: 'monthly' },
    { id: uid(), type: 'expense', description: 'Condomínio', amount: 650, date: `${start}-15`, category: 'moradia', recurrence: 'monthly' },
    { id: uid(), type: 'expense', description: 'IPVA (parcela)', amount: 320, date: soon, category: 'impostos', recurrence: 'once' },
    { id: uid(), type: 'income', description: 'Venda bicicleta usada', amount: 900, date: soon, category: 'outras_receitas', recurrence: 'once' },
  ];
}

const DEMO_LIMITS: CategoryLimits = { alimentacao: 1000, transporte: 1100, lazer: 300, compras: 900, mercado: 2200 };
const DEMO_SIGNATURES = new Set(demoPlanned().map((e) => `${e.description}|${e.amount}`));
const isDemoEntry = (e: PlannedEntry) => DEMO_SIGNATURES.has(`${e.description}|${e.amount}`);

export function AppProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<SyncPayload | null>(() => load<SyncPayload | null>('payload', null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [planned, setPlanned] = useState<PlannedEntry[]>(() => load<PlannedEntry[]>('planned', []));
  const [overrides, setOverrides] = useState<Record<string, OccurrenceOverride>>(() => load('overrides', {}));
  const [limits, setLimits] = useState<CategoryLimits>(() => load('limits', {}));
  const [catOverrides, setCatOverrides] = useState<Record<string, CategoryKey>>(() => load('categoryOverrides', {}));
  const [month, setMonth] = useState(currentMonth);
  const [hidden, setHidden] = useState(() => load('hidden', false));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => save('planned', planned), [planned]);
  useEffect(() => save('overrides', overrides), [overrides]);
  useEffect(() => save('limits', limits), [limits]);
  useEffect(() => save('categoryOverrides', catOverrides), [catOverrides]);
  useEffect(() => save('hidden', hidden), [hidden]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('cg:theme', dark ? 'dark' : 'light');
    } catch {
      /* sem armazenamento */
    }
  }, [dark]);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.sync();
      setPayload(data);
      setOffline(false);
      save('payload', data);
      if (data.demo && !load('demoSeeded', false)) {
        save('demoSeeded', true);
        setPlanned((p) => (p.length ? p : demoPlanned()));
        setLimits((l) => (Object.keys(l).length ? l : DEMO_LIMITS));
      }
      // Ao trocar do modo demonstração para dados reais, remove os exemplos criados pela demo.
      if (!data.demo && load('demoSeeded', false) && !load('demoCleaned', false)) {
        save('demoCleaned', true);
        setPlanned((p) => p.filter((e) => !isDemoEntry(e)));
        setLimits((l) => {
          const next = { ...l };
          for (const [k, v] of Object.entries(DEMO_LIMITS)) if (next[k as CategoryKey] === v) delete next[k as CategoryKey];
          return next;
        });
      }
    } catch (e) {
      setOffline(true);
      setError(`Não foi possível sincronizar: ${(e as Error).message}. Exibindo dados salvos.`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sincroniza ao abrir o app.
  useEffect(() => {
    void sync();
  }, [sync]);

  const txs = useMemo(() => (payload ? enrich(payload, catOverrides) : []), [payload, catOverrides]);
  const cards = useMemo(
    () => (payload ? creditAccounts(payload.accounts).map((a) => cardInfo(a, txs, payload.bills)) : []),
    [payload, txs],
  );

  const occurrences = useMemo(() => {
    const today = todayISO();
    return buildOccurrences(planned, overrides, txs, addMonthsISO(today, -6), addMonthsISO(today, 12));
  }, [planned, overrides, txs]);

  const fc = useMemo(() => (payload ? forecast(payload.accounts, txs, cards, occurrences) : null), [payload, txs, cards, occurrences]);

  const slots = useMemo(() => categorySlots(txs, lastMonths(currentMonth(), 6)), [txs]);
  const seriesOf = useCallback((c: CategoryKey) => slotKey(slots, c), [slots]);
  const colorFor = useCallback(
    (c: CategoryKey | typeof OTHERS_KEY) => {
      const i = c === OTHERS_KEY ? undefined : slots.get(c);
      if (i === undefined) return dark ? OTHER_COLOR.dark : OTHER_COLOR.light;
      return (dark ? SERIES_DARK : SERIES_LIGHT)[i];
    },
    [slots, dark],
  );

  const value: AppState = {
    payload,
    loading,
    error,
    offline,
    sync,
    txs,
    cards,
    planned,
    savePlanned: (e) => setPlanned((p) => (p.some((x) => x.id === e.id) ? p.map((x) => (x.id === e.id ? e : x)) : [...p, e])),
    removePlanned: (id) => setPlanned((p) => p.filter((x) => x.id !== id)),
    overrides,
    setOverride: (key, ov) =>
      setOverrides((o) => {
        const next = { ...o };
        if (ov) next[key] = ov;
        else delete next[key];
        return next;
      }),
    occurrences,
    forecast: fc,
    limits,
    setLimit: (c, v) =>
      setLimits((l) => {
        const next = { ...l };
        if (v && v > 0) next[c] = v;
        else delete next[c];
        return next;
      }),
    setTxCategory: (txId, c) => setCatOverrides((o) => ({ ...o, [txId]: c })),
    month,
    setMonth,
    hidden,
    toggleHidden: () => setHidden((h) => !h),
    dark,
    toggleTheme: () => setDark((d) => !d),
    colorFor,
    seriesOf,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppProvider');
  return v;
}
