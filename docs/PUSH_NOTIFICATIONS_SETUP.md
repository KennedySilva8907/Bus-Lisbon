# Setup: Push Notifications

Esta funcionalidade requer alguns passos de provisionamento que tens de fazer no Vercel **uma única vez**. Sem isto, os alertas frontend mostram um erro "VAPID public key não configurada" ao tentar agendar.

## 1. Gerar VAPID keys

VAPID = Voluntary Application Server Identification. São o par de chaves que prova que tu és o servidor autorizado a enviar pushes para os teus utilizadores.

No teu terminal:

```bash
npx web-push generate-vapid-keys
```

Vais ver algo como:

```
Public Key:  BHd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Private Key: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

Guarda os dois.

## 2. Provisionar Redis (Upstash — free tier)

> ⚠️ **NÃO escolhas "Redis" da lista** (essa é a Redis Cloud oficial, $10/mês mínimo).
> **Escolhe "Upstash"** que tem free tier (10k comandos/dia, mais que suficiente).

1. Vai a https://vercel.com/dashboard
2. Abre o teu projeto **Bus-Lisbon**
3. Tab **Storage** → **Marketplace Database Providers** → **Upstash**
4. Configuração:
   - **Plan:** Free
   - **Region:** Frankfurt (ou London)
   - **Type:** Redis
5. **Install** → liga ao projeto Bus-Lisbon
6. ✅ As env vars `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` são injetadas automaticamente.

## 3. Adicionar variáveis de ambiente

No Vercel: **Settings** → **Environment Variables**. Adiciona:

| Nome | Valor | Ambientes |
|---|---|---|
| `VAPID_PUBLIC_KEY` | (a public key do passo 1) | Production, Preview, Development |
| `VAPID_PRIVATE_KEY` | (a private key do passo 1) | Production, Preview, Development |
| `VAPID_SUBJECT` | `mailto:o-teu-email@exemplo.com` | Production, Preview, Development |
| `VITE_VAPID_PUBLIC_KEY` | (a **mesma** public key — Vite expõe ao browser) | Production, Preview, Development |
| `CRON_SECRET` | (uma string aleatória qualquer, ex: `openssl rand -hex 32`) | Production |

> ⚠️ `VITE_VAPID_PUBLIC_KEY` tem de ter o prefixo `VITE_` para o Vite expor ao código de browser. É a mesma chave que `VAPID_PUBLIC_KEY`, duplicada propositadamente.

## 4. Local development

Cria `.env.local` na raiz do projeto (já está no `.gitignore`):

```bash
VITE_VAPID_PUBLIC_KEY=<a tua public key>
VAPID_PUBLIC_KEY=<a mesma public key>
VAPID_PRIVATE_KEY=<a tua private key>
VAPID_SUBJECT=mailto:o-teu-email@exemplo.com
CRON_SECRET=<a tua string aleatória>

# Para o KV local, podes:
# (a) usar `vercel env pull .env.local` que puxa do dashboard, OU
# (b) usar `vercel dev` que injeta automaticamente
```

Recomendado: `vercel dev` em vez de `npm run dev` quando quiseres testar as functions e o cron.

## 5. Verificar que está tudo a funcionar

1. **Frontend:** abre a app, abre uma paragem, clica no sino numa chegada futura. Deve abrir o modal "Agendar notificação".
2. **Backend:** chama manualmente o cron para confirmar:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://o-teu-projeto.vercel.app/api/cron-check-alerts
   ```
   Deve devolver `{"processed":0,...}` ou similar.
3. **Cron:** após deploy, vai a **Cron Jobs** no dashboard do Vercel e confirma que `/api/cron-check-alerts` está listado e a correr a cada minuto.

## Limitações conhecidas

- **Vercel Hobby tier:** o cron schedule pode estar limitado a 1× por dia. Se for o caso, ou:
  - Atualizar para Pro (~$20/mês), OU
  - Apontar um cron externo grátis (https://cron-job.org) ao URL `/api/cron-check-alerts` com o header `Authorization: Bearer <CRON_SECRET>` a cada minuto
- **iOS:** as notificações só funcionam se o utilizador instalar a app via "Adicionar à Tela Inicial". Já está tratado no UI (mostra instrução).
- **Sem VAPID configurado:** o utilizador vê erro "VAPID public key não configurada" ao tentar agendar. Não bloqueia o resto da app.

## Custos esperados

| Recurso | Tier free | Limite mensal | Custo típico |
|---|---|---|---|
| Vercel Functions | Sim | 100 GB-h | $0 |
| Vercel KV | Sim | 30k commands/mês | $0 |
| Vercel Cron | Sim (Hobby pode estar limitado) | — | $0 ou $20 (Pro) |
| FCM / APNS push | Sempre grátis | Sem limites práticos | $0 |
