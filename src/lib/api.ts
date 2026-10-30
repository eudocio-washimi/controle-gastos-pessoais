import type { ItemInfo, SyncPayload } from './types.ts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`);
  return body as T;
}

export const api = {
  status: () => request<{ credentials: boolean; items: number; demo: boolean }>('/api/status'),
  sync: () => request<SyncPayload>('/api/sync'),
  items: () => request<ItemInfo[]>('/api/items'),
  addItem: (id: string) => request<{ ok: true }>('/api/items', { method: 'POST', body: JSON.stringify({ id }) }),
  removeItem: (id: string) => request<{ ok: true }>(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
