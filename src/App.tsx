import { App as CapApp } from '@capacitor/app';
import {
  CalendarClock, CreditCard, Eye, EyeOff, FileText, Home, Landmark, Moon, PieChart, RefreshCw, Settings, Sun, WifiOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context/AppContext.tsx';
import { isDevice } from './lib/api.ts';
import { relativeTime } from './lib/format.ts';
import AccountsPage from './pages/AccountsPage.tsx';
import CardsPage from './pages/CardsPage.tsx';
import CategoriesPage from './pages/CategoriesPage.tsx';
import HomePage from './pages/HomePage.tsx';
import LoginPage from './pages/LoginPage.tsx';
import PlanningPage from './pages/PlanningPage.tsx';
import ReportPage from './pages/ReportPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';

const PAGES = [
  { id: 'inicio', label: 'Início', icon: Home, el: HomePage },
  { id: 'contas', label: 'Contas', icon: Landmark, el: AccountsPage },
  { id: 'cartoes', label: 'Cartões', icon: CreditCard, el: CardsPage },
  { id: 'categorias', label: 'Categorias', icon: PieChart, el: CategoriesPage },
  { id: 'planejamento', label: 'Planejamento', icon: CalendarClock, el: PlanningPage },
  { id: 'relatorio', label: 'Relatório', icon: FileText, el: ReportPage },
] as const;

const RESUME_SYNC_MS = 15 * 60 * 1000;

type PageId = (typeof PAGES)[number]['id'] | 'config';

const readHash = (): PageId => {
  const h = location.hash.replace('#/', '') as PageId;
  return h === 'config' || PAGES.some((p) => p.id === h) ? h : 'inicio';
};

export default function App() {
  const { payload, loading, error, offline, needsLogin, sync, hidden, toggleHidden, dark, toggleTheme } = useApp();
  const [page, setPage] = useState<PageId>(readHash);
  const syncedAt = useRef(payload?.syncedAt);
  syncedAt.current = payload?.syncedAt;

  // Botão "voltar" do Android: fecha o modal aberto, depois volta ao Início, depois sai do app.
  useEffect(() => {
    if (!isDevice) return;
    const sub = CapApp.addListener('backButton', () => {
      if (document.querySelector('[role="dialog"]')) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else if (readHash() !== 'inicio') go('inicio');
      else void CapApp.exitApp();
    });
    // Ao voltar para o app depois de um tempo, busca dados novos.
    const resume = CapApp.addListener('resume', () => {
      const last = syncedAt.current ? Date.parse(syncedAt.current) : 0;
      if (Date.now() - last > RESUME_SYNC_MS) void sync();
    });
    return () => {
      void sub.then((s) => s.remove());
      void resume.then((s) => s.remove());
    };
  }, [sync]);

  useEffect(() => {
    const onHash = () => setPage(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: PageId) => {
    location.hash = `/${id}`;
    window.scrollTo({ top: 0 });
  };

  if (needsLogin) return <LoginPage />;

  const current = PAGES.find((p) => p.id === page);
  const Page = page === 'config' ? SettingsPage : current!.el;

  return (
    <div className="min-h-screen md:flex">
      {/* Navegação lateral (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-black/5 bg-[var(--surface)] p-4 dark:border-white/10 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight">Meus Gastos</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {PAGES.map((p) => (
            <NavItem key={p.id} active={page === p.id} onClick={() => go(p.id)} icon={p.icon} label={p.label} />
          ))}
        </nav>
        <NavItem active={page === 'config'} onClick={() => go('config')} icon={Settings} label="Configurações" />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] border-black/5 bg-[var(--page)]/85 backdrop-blur dark:border-white/10">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">{page === 'config' ? 'Configurações' : current!.label}</h1>
              <p className="truncate text-xs text-[var(--muted)]">
                {payload ? `Sincronizado ${relativeTime(payload.syncedAt)}` : loading ? 'Sincronizando…' : 'Sem dados'}
                {payload?.demo && ' · modo demonstração'}
              </p>
            </div>
            <IconBtn onClick={toggleHidden} label={hidden ? 'Mostrar valores' : 'Ocultar valores'}>
              {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </IconBtn>
            <IconBtn onClick={toggleTheme} label={dark ? 'Tema claro' : 'Tema escuro'}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </IconBtn>
            <IconBtn onClick={() => void sync()} label="Sincronizar" disabled={loading}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </IconBtn>
            <span className="md:hidden">
              <IconBtn onClick={() => go('config')} label="Configurações">
                <Settings size={18} />
              </IconBtn>
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:pb-10">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {offline && <WifiOff size={16} className="mt-0.5 shrink-0" />}
              {error}
            </div>
          )}
          {payload ? <Page /> : <Loading loading={loading} />}
        </main>
      </div>

      {/* Navegação inferior (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-black/5 bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] dark:border-white/10 md:hidden">
        {PAGES.map((p) => {
          const Icon = p.icon;
          const active = page === p.id;
          return (
            <button key={p.id} onClick={() => go(p.id)} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--muted)]'}`}>
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {p.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function NavItem({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Home; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' : 'text-[var(--ink-2)] hover:bg-black/5 dark:hover:bg-white/5'
      }`}
    >
      <Icon size={18} /> {label}
    </button>
  );
}

function IconBtn({ children, onClick, label, disabled }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className="btn-ghost !p-2">
      {children}
    </button>
  );
}

function Loading({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-sm text-[var(--muted)]">
      <RefreshCw className={`mb-3 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Buscando seus dados no Pluggy…' : isDevice ? 'Nenhum dado sincronizado ainda. Verifique sua conexão com a internet.' : 'Nenhum dado sincronizado ainda. Verifique se o servidor está rodando.'}
    </div>
  );
}
