import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ItemInfo } from '../shared/types.ts';
import { buildDemoData } from '../shared/demo.ts';
import { getItem, hasCredentials, setPluggyCredentials, syncFromPluggy } from '../shared/pluggy.ts';

setPluggyCredentials({ clientId: process.env.PLUGGY_CLIENT_ID ?? '', clientSecret: process.env.PLUGGY_CLIENT_SECRET ?? '' });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

function envItemIds(): string[] {
  return (process.env.PLUGGY_ITEM_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

// O servidor não guarda estado (o disco de hospedagens gratuitas é apagado a cada reinício):
// os items adicionados pelo app ficam no navegador e chegam em `?items=id1,id2`.
function requestItemIds(req: express.Request): string[] {
  return String(req.query.items ?? '').split(',').map((s) => s.trim()).filter(isUuid);
}

const allItemIds = (req: express.Request) => [...new Set([...envItemIds(), ...requestItemIds(req)])];
const isDemo = (req: express.Request) => process.env.PLUGGY_DEMO === 'true' || !hasCredentials() || allItemIds(req).length === 0;

// --- Autenticação: com APP_PASSWORD definida, toda a API exige um token obtido em /api/login ---

const PASSWORD = process.env.APP_PASSWORD ?? '';
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// Trocar a senha invalida os tokens já emitidos.
const tokenKey = crypto.createHash('sha256').update(`meus-gastos:${PASSWORD}`).digest();

const sign = (exp: string) => crypto.createHmac('sha256', tokenKey).update(exp).digest('base64url');

function validToken(header: string | undefined): boolean {
  const [exp, sig] = (header ?? '').replace(/^Bearer /, '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Limite simples contra tentativas de adivinhar a senha: 10 erros por IP a cada 15 minutos.
const failures = new Map<string, { count: number; resetAt: number }>();

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// Verificação de saúde da hospedagem (sem dados, fora da senha).
app.get('/healthz', (_req, res) => {
  res.send('ok');
});

app.post('/api/login', (req, res) => {
  if (!PASSWORD) return res.json({ token: null });
  const ip = req.ip ?? '?';
  const f = failures.get(ip);
  if (f && f.resetAt > Date.now() && f.count >= 10) return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' });
  const given = crypto.createHash('sha256').update(String(req.body?.password ?? '')).digest();
  const expected = crypto.createHash('sha256').update(PASSWORD).digest();
  if (!crypto.timingSafeEqual(given, expected)) {
    failures.set(ip, f && f.resetAt > Date.now() ? { ...f, count: f.count + 1 } : { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  failures.delete(ip);
  const exp = String(Date.now() + TOKEN_TTL_MS);
  res.json({ token: `${exp}.${sign(exp)}` });
});

app.use('/api', (req, res, next) => {
  if (!PASSWORD || validToken(req.headers.authorization)) return next();
  res.status(401).json({ error: 'Faça login para continuar.' });
});

app.get('/api/status', (req, res) => {
  res.json({ credentials: hasCredentials(), items: allItemIds(req).length, demo: isDemo(req), auth: Boolean(PASSWORD) });
});

app.get('/api/sync', async (req, res) => {
  try {
    res.json(isDemo(req) ? buildDemoData() : await syncFromPluggy(allItemIds(req)));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

app.get('/api/items', async (req, res) => {
  if (!hasCredentials()) return res.json([]);
  const envIds = envItemIds();
  const items: ItemInfo[] = await Promise.all(
    allItemIds(req).map(async (id) => {
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

/** Confere se o item existe no Pluggy; quem guarda a lista é o app. */
app.post('/api/items/validate', async (req, res) => {
  const id = String(req.body?.id ?? '').trim();
  if (!isUuid(id)) return res.status(400).json({ error: 'ID de item inválido (esperado UUID).' });
  if (!hasCredentials()) return res.status(400).json({ error: 'Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor.' });
  try {
    await getItem(id);
  } catch (e) {
    return res.status(400).json({ error: `Item não encontrado no Pluggy: ${(e as Error).message}` });
  }
  res.json({ ok: true });
});

// Em produção (npm run build && npm start) o próprio servidor entrega o frontend.
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// PORT é definida pelas hospedagens (Render etc.); API_PORT é a configuração local.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
app.listen(port, () => {
  console.log(`API em http://localhost:${port} — ${hasCredentials() ? 'credenciais do Pluggy configuradas' : 'modo DEMONSTRAÇÃO'}${PASSWORD ? ', protegida por senha' : ''}`);
});
