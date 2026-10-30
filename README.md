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

## Na nuvem (Render, plano gratuito)

O arquivo `render.yaml` descreve o serviço: um único servidor Node que entrega o app e a API.

1. Crie uma conta em [render.com](https://render.com) entrando com o GitHub.
2. Em **New → Blueprint**, escolha este repositório. O Render lê o `render.yaml` e pede os segredos:
   - `APP_PASSWORD`: a senha para entrar no app (**obrigatória**: sem ela qualquer pessoa com o link veria seus dados);
   - `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e, se quiser, `PLUGGY_ITEM_IDS`.
3. Clique em **Apply**. Em alguns minutos o app fica em `https://meus-gastos-XXXX.onrender.com`. A cada `git push` na `main` o Render publica de novo.

No celular, abra o link no Chrome e use **Adicionar à tela inicial** para instalar como app.

Limitações do plano gratuito: o servidor "dorme" após 15 minutos sem uso e leva cerca de 1 minuto para acordar no primeiro acesso (o app abre com os dados salvos enquanto isso).

Como o disco do Render gratuito é apagado a cada reinício, o servidor não guarda nada: as conexões adicionadas pela tela **Configurações** ficam salvas no navegador (as de `PLUGGY_ITEM_IDS` valem para todos). Com `APP_PASSWORD` definida, o login vale por 90 dias por navegador; trocar a senha desconecta todos.

## App Android

O mesmo frontend roda como app nativo via [Capacitor](https://capacitorjs.com) (pasta `android/`). No celular não há servidor: o app fala direto com o Pluggy.

1. Instale o [Android Studio](https://developer.android.com/studio) (traz o Android SDK e o JDK 21 que o Gradle usa).
2. Gere o build web e copie para o projeto Android:
   ```bash
   npm run android:sync
   ```
3. Abra no Android Studio e rode num aparelho/emulador (▶ Run):
   ```bash
   npm run android:open
   ```
   Ou gere o APK de debug direto pela linha de comando (`android/app/build/outputs/apk/debug/app-debug.apk`):
   ```bash
   npm run android:apk
   ```
4. No app, vá em **Configurações**, informe o **Client ID** e o **Client Secret** do Pluggy e adicione os IDs dos items. Sem isso o app abre no modo demonstração.

Diferenças em relação à versão web:

- As credenciais ficam salvas só no aparelho (armazenamento local do app) e são validadas no Pluggy ao salvar. As chamadas à API passam pela camada HTTP nativa (`CapacitorHttp`), sem problemas de CORS.
- O relatório mensal ganha o botão **Compartilhar**, que manda o texto direto para o app da sua IA.
- O botão *voltar* do Android fecha o modal aberto, depois volta ao Início e, por fim, sai do app.
- Ao reabrir o app com dados de mais de 15 minutos, ele sincroniza sozinho.

Sempre que mudar o código em `src/`, rode `npm run android:sync` antes de gerar um novo APK.

## Onde está cada coisa

| Arquivo | Conteúdo |
|---|---|
| `shared/pluggy.ts` | Autenticação (`/auth`, API Key em cache), contas, transações paginadas e faturas (`/bills`) |
| `shared/demo.ts` | Gerador de dados fictícios |
| `src/lib/categories.ts` | Categorias em português e mapeamento das categorias do Pluggy |
| `src/lib/calc.ts` | Totais, saldo histórico, ciclo de fatura, confirmação automática, previsão de saldo, limites |
| `src/lib/api.ts` | Acesso aos dados: via servidor (web) ou direto do aparelho (Android) |
| `capacitor.config.ts`, `android/` | Configuração e projeto nativo Android |
| `src/lib/report.ts` | Relatório mensal em texto para colar em uma IA |
| `src/context/AppContext.tsx` | Estado global, sincronização e persistência local |

## Regras de negócio

- **Gastos** = despesas de contas e cartões, exceto pagamento de fatura, investimentos e transferências entre contas próprias (evita contar duas vezes). Dá para trocar a categoria de qualquer transação tocando nela.
- **Previsão do fim do mês** = saldo atual + receitas previstas pendentes − despesas previstas pendentes − faturas que vencem no mês − estimativa de gastos restantes (média dos gastos à vista dos últimos 3 meses menos o já gasto no mês, sem contar os lançamentos previstos).
- **Confirmação automática**: um lançamento previsto é confirmado quando existe uma movimentação real do mesmo tipo com valor até 5% diferente e data até ±2 dias. Dá para desfazer, confirmar manualmente ou ignorar uma ocorrência.
- **Offline**: o último sincronismo, os lançamentos previstos e os limites ficam no `localStorage`; em produção um service worker mantém o app abrindo sem rede.
