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

Como o disco do Render gratuito é apagado a cada reinício, o servidor não guarda nada em disco. Com `APP_PASSWORD` definida, o login vale por 90 dias por navegador; trocar a senha desconecta todos.

### Cadastros em todos os aparelhos (Neon, gratuito)

Lançamentos previstos (salário, gastos recorrentes...), limites, categorias trocadas, ocorrências confirmadas/ignoradas e conexões bancárias adicionadas pela tela **Configurações** ficam num banco Postgres gratuito do [Neon](https://neon.tech), e aparecem no PC, no site do Render e no app Android. Sem o banco, cada aparelho guarda só os próprios cadastros.

1. Crie uma conta em [neon.tech](https://neon.tech) (plano Free, sem cartão) e um projeto na região mais próxima do servidor (ex.: *AWS US East* para o Render em `virginia`).
2. Em **Connect**, copie a *connection string* (`postgresql://usuario:senha@ep-....neon.tech/neondb?sslmode=require`).
3. No Render, em **Environment**, crie a variável `DATABASE_URL` com esse valor e salve (o serviço reinicia). Para uso local, coloque a mesma linha no `.env`. A tabela `app_settings` é criada sozinha.
4. Abra o site e faça login: os cadastros deste navegador são enviados ao banco. Em **Configurações → Sincronização entre aparelhos** aparece "em dia".
5. No app Android, em **Configurações → Sincronização entre aparelhos**, informe o endereço do Render (`https://meus-gastos-XXXX.onrender.com`) e a senha (`APP_PASSWORD`) e toque em **Conectar**.

Como funciona:

- O banco só é acessado pelo servidor, protegido pela mesma senha (`APP_PASSWORD`); a senha do banco nunca vai para o celular. O Android continua falando direto com o Pluggy e usa o Render só para os cadastros.
- O `localStorage` de cada aparelho continua sendo a cópia de trabalho e o cache offline. A sincronização acontece ao abrir o app, a cada sincronismo e logo depois de cada alteração; sem rede, as alterações ficam no aparelho e sobem na próxima vez.
- **Conflito**: vale a alteração mais recente de cada cadastro (a lista de lançamentos previstos inteira, os limites inteiros etc.). Se o mesmo cadastro for alterado em dois aparelhos sem sincronizar entre uma coisa e outra, fica a última versão.
- **Primeira sincronização** de cada aparelho: o que já existia nele é juntado ao que está no banco (lançamentos pelo ID; limites e categorias chave a chave, valendo o do banco em caso de diferença). Os exemplos do modo demonstração não são enviados.
- **Limpar dados locais** apaga só o aparelho; os cadastros voltam do banco na próxima sincronização.
- Ficam só no aparelho: credenciais do Pluggy do Android, tema, "ocultar valores" e o último sincronismo com o Pluggy.

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
   Sem Android Studio e sem permissão de administrador: baixe o JDK 21 (zip da Adoptium) e as *command-line tools* do Android, descompacte numa pasta do usuário, instale com `sdkmanager platform-tools "platforms;android-36" "build-tools;36.0.0"`, crie `android/local.properties` com `sdk.dir=C\:/caminho/do/sdk` (barras normais) e rode `gradlew.bat assembleDebug` com `JAVA_HOME` apontando para o JDK.
4. No app, vá em **Configurações**, informe o **Client ID** e o **Client Secret** do Pluggy e adicione os IDs dos items. Sem isso o app abre no modo demonstração.
5. Para ver no celular os cadastros feitos no PC (e vice-versa), conecte o app ao servidor do Render em **Configurações → Sincronização entre aparelhos** (veja [Cadastros em todos os aparelhos](#cadastros-em-todos-os-aparelhos-neon-gratuito)).

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
| `src/lib/projection.ts` | Projeção mês a mês: faturas futuras, parcelas, sobra e saldo |
| `src/lib/calc.ts` | Totais, saldo histórico, ciclo de fatura, confirmação automática, previsão de saldo, limites |
| `src/lib/api.ts` | Acesso aos dados: via servidor (web) ou direto do aparelho (Android) |
| `capacitor.config.ts`, `android/` | Configuração e projeto nativo Android |
| `src/lib/report.ts` | Relatório mensal em texto para colar em uma IA |
| `src/context/AppContext.tsx` | Estado global, sincronização e persistência local |
| `src/lib/cloud.ts`, `server/settings.ts` | Cadastros compartilhados entre aparelhos (banco Neon via `POST /api/settings`) |

## Regras de negócio

- **Gastos** = despesas de contas e cartões, exceto pagamento de fatura, investimentos e transferências entre contas próprias (evita contar duas vezes). Dá para trocar a categoria de qualquer transação tocando nela.
- **Previsão do fim do mês** = saldo atual + receitas previstas pendentes − despesas previstas pendentes − faturas que vencem no mês − estimativa de gastos restantes (média dos gastos à vista dos últimos 3 meses menos o já gasto no mês, sem contar os lançamentos previstos).
- **Projeção dos próximos meses** (tela Projeção): a fatura de cada mês soma as parcelas e compras já lançadas no cartão, usando o mês da fatura informado pelo banco (`billForecastDate` do Pluggy). Parcelas futuras que o banco ainda não informou são deduzidas da última parcela conhecida. Opcionalmente soma uma estimativa de novos gastos (média das compras à vista das últimas 3 faturas e dos gastos no débito/Pix). Receitas e despesas vêm de Planejamento (sem salário cadastrado, usa a média das receitas dos últimos 3 meses). Mostra a sobra de cada mês, o saldo projetado, quando terminam as parcelas e quando cada cartão zera.
- **Confirmação automática**: um lançamento previsto é confirmado quando existe uma movimentação real do mesmo tipo com valor até 5% diferente e data até ±2 dias. Dá para desfazer, confirmar manualmente ou ignorar uma ocorrência.
- **Offline**: o último sincronismo, os lançamentos previstos e os limites ficam no `localStorage` (e, com `DATABASE_URL`, também no banco); em produção um service worker mantém o app abrindo sem rede.
