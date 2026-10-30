import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ItemInfo } from '../shared/types.ts';
import { buildDemoData } from './demo.ts';
import { getItem, hasCredentials, syncFromPluggy } from './pluggy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const itemsFile = path.join(root, 'data', 'items.json');

function envItemIds(): string[] {
  return (process.env.PLUGGY_ITEM_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function appItemIds(): string[] {
  try {
    return JSON.parse(fs.readFileSync(itemsFile, 'utf8')) as string[];
  } catch {
    return [];
  }
}

function saveAppItemIds(ids: string[]) {
  fs.mkdirSync(path.dirname(itemsFile), { recursive: true });
  fs.writeFileSync(itemsFile, JSON.stringify(ids, null, 2));
}

const allItemIds = () => [...new Set([...envItemIds(), ...appItemIds()])];
const isDemo = () => process.env.PLUGGY_DEMO === 'true' || !hasCredentials() || allItemIds().length === 0;

const app = express();
app.use(express.json());

app.get('/api/status', (_req, res) => {
  res.json({ credentials: hasCredentials(), items: allItemIds().length, demo: isDemo() });
});

app.get('/api/sync', async (_req, res) => {
  try {
    res.json(isDemo() ? buildDemoData() : await syncFromPluggy(allItemIds()));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

app.get('/api/items', async (_req, res) => {
  if (!hasCredentials()) return res.json([]);
  const envIds = envItemIds();
  const items: ItemInfo[] = await Promise.all(
    allItemIds().map(async (id) => {
      const source = envIds.includes(id) ? 'env' : 'app';
      try {
        const item = await getItem(id);
        return { id, institution: item.connector.name, status: item.status, source };
      } catch (e) {
        return { id, institution: '—', status: `Erro: ${(e as Error).message}`, source };
      }
    }),
  );
  res.json(items);
});

app.post('/api/items', async (req, res) => {
  const id = String(req.body?.id ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID de item inválido (esperado UUID).' });
  if (!hasCredentials()) return res.status(400).json({ error: 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env.' });
  try {
    await getItem(id);
  } catch (e) {
    return res.status(400).json({ error: `Item não encontrado no Pluggy: ${(e as Error).message}` });
  }
  saveAppItemIds([...new Set([...appItemIds(), id])]);
  res.status(201).json({ ok: true });
});

app.delete('/api/items/:id', (req, res) => {
  saveAppItemIds(appItemIds().filter((x) => x !== req.params.id));
  res.json({ ok: true });
});

// Em produção (npm run build && npm start) o próprio servidor entrega o frontend.
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, () => {
  console.log(`API em http://localhost:${port} — modo ${isDemo() ? 'DEMONSTRAÇÃO' : 'Pluggy'}`);
});
