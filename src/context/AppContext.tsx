import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, AuthError } from '../lib/api.ts';
import { withBills } from '../lib/projection.ts';
import {
  buildOccurrences, cardInfo, categorySlots, creditAccounts, enrich, forecast, slotKey, type CardInfo, type Forecast,
} from '../lib/calc.ts';
import { OTHER_COLOR, OTHERS_KEY, SERIES_DARK, SERIES_LIGHT, type CategoryKey } from '../lib/categories.ts';
import { addDaysISO, addMonthsISO, addMonthsYM, currentMonth, lastMonths, monthOf, todayISO } from '../lib/dates.ts';
import { startCloud, syncCloud, type CloudState } from '../lib/cloud.ts';
import { load, save, uid } from '../lib/storage.ts';
import type { CategoryLimits, Occurrence, OccurrenceOverride, PlannedEntry, SyncPayload, Tx } from '../lib/types.ts';

interface AppState {
  payload: SyncPayload | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  /** O servidor pede senha: o app mostra a tela de login. */
  needsLogin: boolean;
  sync: () => Promise<void>;
  /** Sincronização dos cadastros entre aparelhos (pelo banco de dados do servidor). */
  cloud: CloudState;
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

/**
 * Com o app aberto, sincroniza a cada hora. O Pluggy coleta os dados no banco uma vez por dia (itens do MeuPluggy
 * não aceitam coleta sob demanda); assim a coleta diária aparece no app em até 1 hora, sem precisar reabri-lo.
 */
const RESYNC_MS = 60 * 60 * 1000;

/** Tempo máximo esperando os cadastros do servidor antes de buscar os dados do Pluggy (o Render gratuito demora a acordar). */
const CLOUD_WAIT_MS = 8000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<SyncPayload | null>(() => load<SyncPayload | null>('payload', null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [planned, setPlanned] = useState<PlannedEntry[]>(() => load<PlannedEntry[]>('planned', []));
  const [overrides, setOverrides] = useState<Record<string, OccurrenceOverride>>(() => load('overrides', {}));
  const [limits, setLimits] = useState<CategoryLimits>(() => load('limits', {}));
  const [catOverrides, setCatOverrides] = useState<Record<string, CategoryKey>>(() => load('categoryOverrides', {}));
  const [month, setMonth] = useState(currentMonth);
  const [hidden, setHidden] = useState(() => load('hidden', false));
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [cloud, setCloud] = useState<CloudState>({ status: 'off', at: null });

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

  // Cadastros que chegaram do servidor (feitos em outro aparelho) substituem os deste aparelho.
  useEffect(
    () =>
      startCloud({
        onState: setCloud,
        onApplied: (keys) => {
          if (keys.includes('planned')) setPlanned(load<PlannedEntry[]>('planned', []));
          if (keys.includes('overrides')) setOverrides(load('overrides', {}));
          if (keys.includes('limits')) setLimits(load('limits', {}));
          if (keys.includes('categoryOverrides')) setCatOverrides(load('categoryOverrides', {}));
        },
        // Os exemplos do modo demonstração não vão para o servidor.
        clean: (key, value) => {
          if (key === 'planned' && Array.isArray(value)) return (value as PlannedEntry[]).filter((e) => !isDemoEntry(e));
          if (key === 'limits' && value && typeof value === 'object') {
            const next = { ...(value as CategoryLimits) };
            for (const [k, v] of Object.entries(DEMO_LIMITS)) if (next[k as CategoryKey] === v) delete next[k as CategoryKey];
            return next;
          }
          return value;
        },
      }),
    [],
  );

  const lastSync = useRef(0);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(null);
    lastSync.current = Date.now();
    try {
      // Primeiro os cadastros (trazem também as conexões bancárias cadastradas em outro aparelho).
      await Promise.race([syncCloud(), new Promise((r) => setTimeout(r, CLOUD_WAIT_MS))]);
      const data = await api.sync();
      setPayload(data);
      setOffline(false);
      setNeedsLogin(false);
      save('payload', data);
      // Com os cadastros no servidor, os exemplos da demonstração não são criados (iriam para os outros aparelhos).
      if (data.demo && !load('demoSeeded', false) && !load('cloudMigrated', false)) {
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
      if (e instanceof AuthError) {
        setNeedsLogin(true);
        return;
      }
      setOffline(true);
      setError(`Não foi possível sincronizar: ${(e as Error).message}. Exibindo dados salvos.`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sincroniza ao abrir o app e, com ele aberto, a cada hora (também ao voltar para o app depois de 1 hora).
  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), RESYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSync.current >= RESYNC_MS) void sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  const txs = useMemo(() => (payload ? enrich(payload, catOverrides) : []), [payload, catOverrides]);
  const cards = useMemo(
    () => (payload ? creditAccounts(payload.accounts).map((a) => withBills(cardInfo(a, txs, payload.bills), txs)) : []),
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
    needsLogin,
    sync,
    cloud,
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
