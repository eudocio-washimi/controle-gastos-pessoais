// Persistência local (localStorage). Tudo envolto em try/catch: em modo privado o acesso pode falhar.

const PREFIX = 'cg:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

/** Avisa quando uma chave muda de valor (usado para enviar os cadastros ao servidor). */
export function onSave(fn: Listener) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Grava o valor. Se ele não mudou, não faz nada; `silent` grava sem avisar (valor que veio do servidor). */
export function save<T>(key: string, value: T, silent = false) {
  try {
    const raw = JSON.stringify(value);
    if (localStorage.getItem(PREFIX + key) === raw) return;
    localStorage.setItem(PREFIX + key, raw);
  } catch {
    // Sem armazenamento disponível: o app segue funcionando só em memória.
    return;
  }
  if (!silent) listeners.forEach((fn) => fn(key));
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
