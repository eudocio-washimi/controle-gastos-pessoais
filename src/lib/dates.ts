// Datas tratadas como strings ISO locais (YYYY-MM-DD) para evitar problemas de fuso.

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const todayISO = () => toISO(new Date());
export const monthOf = (iso: string) => iso.slice(0, 7);
export const currentMonth = () => monthOf(todayISO());

export function addMonthsYM(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return toISO(d).slice(0, 7);
}

/** Últimos `n` meses terminando em `ym` (inclusive), do mais antigo ao mais novo. */
export function lastMonths(ym: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonthsYM(ym, i - n + 1));
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export const lastDayOfMonth = (ym: string) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;

export function addDaysISO(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonthsISO(iso: string, n: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
}
