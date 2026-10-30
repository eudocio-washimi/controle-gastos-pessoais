const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

/** R$ 1.234,56 (o Intl usa espaço não separável; normalizamos para espaço comum). */
export const formatBRL = (v: number) => brl.format(v === 0 ? 0 : v).replace(/ /g, ' ');
export const formatBRLCompact = (v: number) => brlCompact.format(v).replace(/ /g, ' ');

export const HIDDEN = 'R$ ••••';

/** YYYY-MM-DD → DD/MM/AAAA */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** YYYY-MM → "out/26" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
}

/** YYYY-MM → "outubro de 2026" */
export function monthLabelLong(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS_LONG[Number(m) - 1]} de ${y}`;
}

export const formatPct = (v: number) => `${(v * 100).toFixed(0)}%`;

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `em ${formatDate(iso.slice(0, 10))}`;
}

/** Aceita "1.234,56", "1234,56" ou "1234.56". */
export function parseBRL(input: string): number {
  const s = input.replace(/[R$\s]/g, '');
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : NaN;
}
