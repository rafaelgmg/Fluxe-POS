# Perfume Passage — CRM Backend + Twilio SMS

Backend Node.js que roda junto ao POS para:
- Salvar clientes em arquivo JSON local
- Agendar SMS/WhatsApp automáticos via Twilio
- Processar mensagens agendadas a cada hora

---

## Pré-requisitos

- Node.js v18+ instalado
- Conta Twilio (gratuita para testar): https://twilio.com

---

## Setup (primeira vez)

### 1. Instalar dependências

```bash
cd server
npm install
```

### 2. Criar o arquivo .env

```bash
cp .env.example .env
```

Abra o `.env` e preencha:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=seu_auth_token_aqui
TWILIO_PHONE_NUMBER=+17025550000
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

> **Onde achar essas chaves:**
> - Acesse https://console.twilio.com
> - Account SID e Auth Token ficam na página inicial (Dashboard)
> - Phone Number: compre um número em Phone Numbers → Manage → Buy a number (~$1/mês)
> - WhatsApp Sandbox: Messaging → Try it out → Send a WhatsApp message

### 3. Iniciar o servidor

```bash
# Modo produção
npm start

# Modo desenvolvimento (reinicia automaticamente)
npm run dev
```

O servidor sobe em: `http://localhost:3001`

---

## Modo Dry-Run (sem Twilio)

Se as credenciais do Twilio não estiverem configuradas, o servidor ainda funciona:
- Clientes são salvos normalmente
- Mensagens são **agendadas** mas não enviadas
- Logs mostram `(dry-run) Would send to ...`

Útil para testar o CRM antes de ativar o SMS.

---

## Verificar se está funcionando

```bash
curl http://localhost:3001/api/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "twilio": true,
  "customers": 0,
  "scheduledPending": 0
}
```

---

## Sequência de SMS automáticos

Quando um cliente é salvo com `marketingConsent: true`:

| Quando | Tipo | Mensagem |
|--------|------|----------|
| D+1 às 11h | thank_you | Agradecimento + nome do produto comprado |
| D+7 às 11h | tip | Dica de uso baseada na preferência de fragrância |
| D+30 às 11h | comeback | Convite para retornar + novidades da preferência |
| Aniversário às 9h | birthday | Mensagem de aniversário + oferta especial |

Mensagens são processadas **a cada hora** automaticamente.

---

## WhatsApp Sandbox (teste gratuito)

Para testar WhatsApp sem aprovação:

1. Acesse Twilio Console → Messaging → Try it out → Send a WhatsApp message
2. O número sandbox padrão é: `+1 415 523 8886`
3. O cliente precisa enviar um código de ativação primeiro (ex: `join <palavra>`)
4. Depois disso, você pode enviar mensagens para o número deles

Para produção, você precisará de um número WhatsApp Business aprovado pela Meta (~2-4 semanas de processo).

---

## Rodando POS + Backend juntos

**Terminal 1 — Frontend (POS):**
```bash
cd perfume-pos
npm run dev
```

**Terminal 2 — Backend (CRM/SMS):**
```bash
cd perfume-pos/server
npm run dev
```

O POS detecta o backend automaticamente. Se offline, funciona em modo local (dados no localStorage).

---

## Arquivos de dados

```
server/data/
  customers.json          — todos os clientes
  scheduled_messages.json — fila de mensagens (pending/sent/failed)
  sms_log.json            — histórico de envios
```

Esses arquivos são criados automaticamente na primeira execução.

---

## Custo estimado (Twilio)

| Item | Custo |
|------|-------|
| Número de telefone | ~$1.15/mês |
| SMS enviado (EUA) | ~$0.0079/SMS |
| WhatsApp (após aprovação) | ~$0.005/msg |
| 100 clientes × 3 msgs/mês | ~$2.40/mês |

Total estimado para o seu volume: **$5-15/mês**.
