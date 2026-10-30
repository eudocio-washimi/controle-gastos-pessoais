# Meus Gastos — controle de gastos pessoais com Pluggy

Aplicação web (React + TypeScript + Tailwind + Recharts) com um BFF em Node/Express que conversa com a API do [Pluggy](https://pluggy.ai) (open finance).

## Como rodar

```bash
npm install
npm run dev          # API em :3001 + frontend em http://localhost:5173
```

Sem credenciais configuradas o app entra em **modo demonstração**, com 7 meses de dados fictícios (2 bancos, 3 contas, 2 cartões).

### Usando seus dados reais

1. Copie `.env.example` para `.env` e preencha `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` (dashboard.pluggy.ai).
2. Informe os IDs dos *items* (cada banco conectado no Pluggy) em `PLUGGY_ITEM_IDS` ou na tela **Configurações** do app.
3. Reinicie `npm run dev`.

As credenciais ficam só no servidor; o navegador nunca vê o `client_secret`.

### Produção

```bash
npm run build && npm start   # o Express serve o build em http://localhost:3001
```

## Onde está cada coisa

| Arquivo | Conteúdo |
|---|---|
| `server/pluggy.ts` | Autenticação (`/auth`, API Key em cache), contas, transações paginadas e faturas (`/bills`) |
| `server/demo.ts` | Gerador de dados fictícios |
| `src/lib/categories.ts` | Categorias em português e mapeamento das categorias do Pluggy |
| `src/lib/calc.ts` | Totais, saldo histórico, ciclo de fatura, confirmação automática, previsão de saldo, limites |
| `src/lib/report.ts` | Relatório mensal em texto para colar em uma IA |
| `src/context/AppContext.tsx` | Estado global, sincronização e persistência local |

## Regras de negócio

- **Gastos** = despesas de contas e cartões, exceto pagamento de fatura, investimentos e transferências entre contas próprias (evita contar duas vezes). Dá para trocar a categoria de qualquer transação tocando nela.
- **Previsão do fim do mês** = saldo atual + receitas previstas pendentes − despesas previstas pendentes − faturas que vencem no mês − estimativa de gastos restantes (média dos gastos à vista dos últimos 3 meses menos o já gasto no mês, sem contar os lançamentos previstos).
- **Confirmação automática**: um lançamento previsto é confirmado quando existe uma movimentação real do mesmo tipo com valor até 5% diferente e data até ±2 dias. Dá para desfazer, confirmar manualmente ou ignorar uma ocorrência.
- **Offline**: o último sincronismo, os lançamentos previstos e os limites ficam no `localStorage`; em produção um service worker mantém o app abrindo sem rede.
