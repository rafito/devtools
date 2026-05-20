# Sistema de Suporte Autônomo — Design

**Data:** 2026-05-20
**Pacote alvo:** `@devorama/autosupport`
**Estado:** Spec inicial (extraída do FaceFutura, produção desde 2026-05-19)

---

## Motivação

Produtos do ecossistema Devorama compartilham um mesmo loop operacional: usuário relata problema → alguém investiga → alguém corrige → alguém revisa → alguém deploya → alguém avisa o usuário. Esse loop é caro de manter por produto e é a **mesma máquina** em todos eles. O FaceFutura implementou e validou em produção um pipeline que automatiza esse ciclo ponta-a-ponta (do relato no chat até o merge do fix), incluindo entrada via Sentry. Esta spec extrai a parte reusável como contrato compartilhado para futuros pacotes (`@devorama/autosupport`) e referência para implementações por projeto.

A spec descreve **o quê**, não **como**. O package em si é assunto de plan separado.

---

## Visão Geral do Pipeline

Quatro agentes desacoplados, dois caminhos de entrada, comunicação exclusiva via banco de dados e webhooks:

```
Entrada A — Chat (usuário logado)
  └─ Tier 1 (Chat Agent) responde em streaming
       └─ se for bug técnico → cria ticket → enfileira Tier 2

Entrada B — Sentry (erro em produção)
  └─ webhook POST /api/webhooks/sentry
       └─ cria ticket (source=sentry, sem usuário) → enfileira Tier 2

Tier 2 (Investigation Agent)
  └─ lê código, logs, Sentry
  └─ cria GitHub issue com diagnóstico
  └─ enfileira Tier 3

Tier 3 (Fix Agent)
  └─ escreve fix, roda testes (até N ciclos)
  └─ git commit + push
  └─ abre PR com label "support-auto"

CI passa → webhook check_suite.completed
  └─ enfileira Tier 4

Tier 4 (Review Agent)
  └─ revisa diff vs diagnóstico
  └─ approve + merge squash  (caminho feliz)
  └─ ou posta comentário "needs human review" (caminho de bloqueio)

Issue fecha automaticamente (GitHub link "Closes #N")
  └─ webhook issues.closed → ticket="resolved" → notifica usuário no chat
```

**Princípios:**

1. **Tiers desacoplados via DB + filas.** Nenhum tier chama outro diretamente. Estado vive no ticket; transições disparam jobs.
2. **Idempotência por design.** Re-execução de qualquer tier é segura. Se o ticket já tem `githubIssueId`, Tier 2 pula. Se já tem `githubPrId`, Tier 3 pula. Etc.
3. **Webhooks autenticados sempre.** HMAC-SHA256 em todos os endpoints públicos. Sem assinatura válida → 401 imediato, log de segurança.
4. **Falha graciosa em ferramentas externas.** Sentry offline, GitHub fora do ar, LLM com timeout: tool retorna `{ error }` legível pelo agente, não throw.
5. **Humano sempre tem dois pontos de escape.** Tier 4 pode pedir revisão; lista de arquivos protegidos garante que infra-core nunca é tocada autonomamente.

---

## Modelo de Dados

Mínimo necessário. Cada projeto pode estender, mas estes campos formam o contrato.

### `support_tickets`

```sql
CREATE TABLE support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid REFERENCES tenants(id),       -- nullable: ticket via Sentry não tem tenant
  user_id           uuid REFERENCES users(id),          -- nullable: idem
  conversation_id   uuid REFERENCES support_conversations(id),  -- nullable: idem
  description       text NOT NULL,
  status            support_ticket_status NOT NULL DEFAULT 'open',
  source            support_ticket_source NOT NULL DEFAULT 'chat',
  sentry_issue_id   text,                               -- preenchido quando source='sentry'
  github_issue_id   integer,                            -- preenchido após Tier 2
  github_pr_id      integer,                            -- preenchido após Tier 3
  resolved_at       timestamptz,
  notified_at       timestamptz,                        -- preenchido quando usuário viu a notificação
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON support_tickets (github_issue_id);
CREATE INDEX ON support_tickets (sentry_issue_id);
CREATE INDEX ON support_tickets (user_id, notified_at)
  WHERE resolved_at IS NOT NULL;
```

### `support_conversations`

```sql
CREATE TABLE support_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  messages    jsonb NOT NULL DEFAULT '[]',
  -- formato: [{ role: "user" | "assistant", content: string, timestamp: ISO }]
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

### Enums

```sql
CREATE TYPE support_ticket_status AS ENUM (
  'open',           -- recém-criado (Tier 1 ou webhook Sentry)
  'investigating',  -- Tier 2 começou ou criou issue
  'fixing',         -- Tier 3 criou PR
  'pr_review',      -- (reservado: estado transitório CI)
  'resolved'        -- issue GitHub fechado após merge
);

CREATE TYPE support_ticket_source AS ENUM ('chat', 'sentry');
```

**Por que `tenant_id`/`user_id` nullable:** tickets via Sentry vêm de erros de infra que não têm dono claro. Forçar dummy values quebra a query natural "todos os tickets do usuário X".

**Por que `support_ticket_source`:** o sistema precisa saber a origem para decidir comportamentos (ex.: se `source='sentry'`, Tier 2 chama `query_sentry(issueId=...)` como primeiro passo; se `source='chat'`, chama `query_sentry(query=...)` para correlacionar).

---

## Máquina de Estados do Ticket

```
                   ┌──────────────────────────────┐
                   ▼                              │ (Tier 3 desistiu)
  open ──► investigating ──► fixing ──► resolved
                                   │
                                   └─► (Tier 4 bloqueou) → comentário no PR
                                       (estado permanece "fixing", humano assume)
```

| Status | Quem grava | Quando |
|---|---|---|
| `open` | Tier 1 (`create_ticket`) ou webhook Sentry | Ticket criado |
| `investigating` | Tier 2 | Após criar GitHub issue |
| `fixing` | Tier 3 | Após criar PR |
| `resolved` | Webhook `issues.closed` | Issue do GitHub fechado |

**Regra de re-tentativa:** Tier 3 que não consegue fix posta comentário no issue e volta o ticket para `investigating`. Reprocessamento manual ou ajuste do diagnóstico é responsabilidade humana — não há loop automático de re-fix (evita gastar tokens em loops).

---

## Tier 1 — Chat Agent

**Papel:** atendimento síncrono ao usuário logado. Responde dúvidas, navega o produto, escala bugs.

**Modelo de IA recomendado:** Claude Haiku (custo/latência); Sonnet em produtos com lógica de domínio densa.

**Comunicação:** SSE. Frontend mantém `GET /api/support/events` aberto para receber:
- Chunks de resposta do agente (durante a conversa)
- Notificações de tickets resolvidos (a qualquer momento)

**Endpoints (sugeridos, não normativos):**

| Método | Path | Função |
|---|---|---|
| `POST` | `/api/support/chat` | Envia mensagem, retorna SSE stream |
| `GET` | `/api/support/events` | SSE para notificações |
| `GET` | `/api/support/pending-notifications` | Tickets resolvidos não vistos |

**Tools obrigatórias:**

| Tool | Função |
|---|---|
| `read_data(entity, filters)` | Lê dados reais do usuário, sempre filtrado por `tenant_id` |
| `create_ticket(description, context)` | Cria ticket no banco + enfileira Tier 2 |
| `get_product_help(topic)` | Consulta seção específica do system prompt curado |

**Contexto injetado a cada chamada:**

```
Usuário atual:
- Nome: <nome>
- Tenant: <tenant_name> (id: <tenant_id>)
- Role: <role>
- Plano/billing relevante: <...>
- Página atual: <current_page>
```

Dados básicos vêm do JWT; dados detalhados via `read_data()` sob demanda. O agente é **stateless** — cada chamada reconstrói o contexto do histórico salvo em `support_conversations`.

**Regra de escalação:** se o agente determina que o comportamento relatado não é explicável pelo system prompt + dados reais, chama `create_ticket()` e responde algo no formato:

> "Identifiquei um problema técnico e já encaminhei para nossa equipe. Você será avisado aqui mesmo assim que for resolvido. Ticket #[id]."

---

## Tier 2 — Investigation Agent

**Papel:** investigar a causa raiz e gerar um GitHub issue com diagnóstico técnico completo.

**Modelo de IA recomendado:** Claude Opus.

**Disparo:** job `support-tier2-investigate` na fila (pg-boss recomendado por reusar o Postgres já existente).

**MAX_TOOL_LOOPS:** 8.

**Input:** `{ ticketId }`.

**Tools obrigatórias:**

| Tool | Assinatura | Função |
|---|---|---|
| `read_file` | `(path: string) → string` | Lê arquivo do codebase (limitado ao diretório do projeto) |
| `search_code` | `(query: string, dir?: string) → string` | Grep no codebase |
| `read_logs` | `(lines?: number, filter?: string) → string` | Lê logs do servidor |
| `query_sentry` | `(issueId?: string, query?: string) → SentryData \| { error }` | Consulta API Sentry (ver seção dedicada) |
| `create_github_issue` | `(title: string, body: string) → { issueNumber: number }` | Abre issue com label `bug` e label do produto |

**Lógica de uso do Sentry:**

- Se `ticket.sentryIssueId` está preenchido → `query_sentry(issueId)` é o **primeiro** tool call
- Caso contrário → após `read_logs` e `search_code`, chamar `query_sentry(query=<palavras-chave>)` para correlacionar com erros conhecidos
- Resultado entra na seção "Dados do Sentry" do issue criado

**Idempotência:** se `ticket.githubIssueId` já está setado, agent sai sem fazer nada.

**Saída:**
- `ticket.githubIssueId` populado
- `ticket.status = 'investigating'`
- Job `support-tier3-fix` enfileirado

---

## Tier 3 — Fix Agent

**Papel:** escrever o fix, validar com testes, abrir PR.

**Modelo de IA recomendado:** Claude Opus.

**Disparo:** job `support-tier3-fix`.

**MAX_TOOL_LOOPS:** 12 (mais que Tier 2 porque precisa iterar fix).

**Input:** `{ ticketId }`.

**Tools obrigatórias:**

| Tool | Assinatura | Função |
|---|---|---|
| `read_file` | `(path) → string` | Idem Tier 2 |
| `search_code` | `(query, dir?) → string` | Idem Tier 2 |
| `read_logs` | `(lines?, filter?) → string` | Idem Tier 2 |
| `write_file` | `(path: string, content: string) → ok \| error` | Escreve com `safeResolvePath` + lista de protegidos |
| `run_tests` | `(pattern?: string) → { passed: boolean, output: string }` | Executa runner contra DB de teste |
| `git_branch` | `(name: string) → ok` | `git checkout -b <name>` |
| `git_commit_push` | `(files: string[], message: string) → ok` | Stage + commit + push usando GITHUB_TOKEN |
| `create_pr` | `(title, body, branch) → { prNumber }` | Cria PR com label `support-auto` |

**Comportamento:**

- Lê o ticket e o issue do GitHub
- Cria branch `support/fix-{ticketId[:8]}`
- Itera `write_file → run_tests` até no máximo 3 ciclos
- Se testes passam: `git_commit_push` + `create_pr`
- Se desiste: posta comentário no issue + volta ticket para `investigating`

**Saída (caminho feliz):**
- `ticket.githubPrId` populado
- `ticket.status = 'fixing'`

**Segurança (obrigatória):**

- `safeResolvePath`: rejeita paths que escapem do diretório do projeto (path traversal)
- Lista de arquivos protegidos (configurável, mas com defaults sãos): `.env*`, `tests/e2e/**`, entry point do server, schema do banco
- `run_tests` aponta `DATABASE_URL` para banco de teste, **nunca** produção
- Git push via HTTPS com token, **nunca** SSH key do servidor
- PR sempre contra branch de feature; nunca push direto na default branch

---

## Tier 4 — Review Agent

**Papel:** revisar o PR aberto pelo Tier 3 e fazer merge se aprovado.

**Modelo de IA recomendado:** Claude Opus.

**Disparo:** webhook `check_suite.completed` onde:
- `conclusion === 'success'`
- PR associado tem label `support-auto`

**MAX_TOOL_LOOPS:** 6.

**Input:** `{ ticketId, prNumber }` (extraído do payload do webhook).

**Tools obrigatórias:**

| Tool | Assinatura | Função |
|---|---|---|
| `read_pr` | `(prNumber) → PR` | GET /pulls/{n} — título, body, branch, sha |
| `read_pr_files` | `(prNumber) → File[]` | GET /pulls/{n}/files — lista de diffs |
| `approve_pr` | `(prNumber, comment) → ok` | POST review event=APPROVE |
| `merge_pr` | `(prNumber) → ok` | PUT /pulls/{n}/merge (squash) |
| `post_review_comment` | `(prNumber, comment) → ok` | POST review event=COMMENT |

**Critérios padrão de aprovação (override por projeto):**

1. O fix endereça o diagnóstico do Tier 2 (correlação semântica entre body do issue e diff)
2. Não há alteração em arquivos de infra core (mesma lista do Tier 3)
3. Não há remoção de testes
4. Não há force changes em snapshots/fixtures sem fix correspondente

**Saída (caminho feliz):**
- PR mergeado (squash)
- GitHub fecha o issue automaticamente (se body do PR tem `Closes #N`)
- Webhook `issues.closed` → ticket `resolved`

**Saída (bloqueio):**
- `post_review_comment` com motivo
- Tier 4 não tenta de novo — humano assume

---

## Webhooks

### `POST /api/webhooks/github`

Configurado no repo com secret `GITHUB_WEBHOOK_SECRET`.

| Evento | Condição | Ação |
|---|---|---|
| `issues.closed` | qualquer issue | Busca ticket por `github_issue_id` → marca `resolved` → dispara notificação |
| `check_suite.completed` | conclusion=success **e** PR tem label `support-auto` | Enfileira Tier 4 |

**Verificação:** HMAC-SHA256 com header `x-hub-signature-256` (prefixo `sha256=`).

### `POST /api/webhooks/sentry`

Configurado no Sentry como Alert Rule. Trigger: "A new issue is created". O secret é gerado pelo Sentry no momento da criação.

**Payload esperado (subset relevante):**

```json
{
  "action": "created",
  "data": {
    "issue": {
      "id": "<sentry-issue-id>",
      "title": "<error title>",
      "culprit": "<file:line in function>",
      "permalink": "<sentry url>",
      "project": { "slug": "<project-slug>" }
    }
  }
}
```

**Verificação:** HMAC-SHA256 com header `sentry-hook-signature` (sem prefixo `sha256=`).

**Filtros aplicados:**

1. `action !== 'created'` → 200 e ignora
2. `project.slug !== SENTRY_PROJECT_SLUG` → 200 e ignora

**Quando aceita:**

```js
support_tickets.insert({
  source: 'sentry',
  sentryIssueId: data.issue.id,
  description: `[Sentry] ${title}\nCulprit: ${culprit}\n${permalink}`,
  tenantId: null,
  userId: null,
  status: 'open',
});
// enqueueSupportTier2(ticketId);
```

---

## Integração com Sentry — `query_sentry` (Tier 2)

**Endpoints REST usados:**

| Modo | URL | Quando |
|---|---|---|
| Por ID | `GET /api/0/organizations/{org}/issues/{id}/` | Ticket via Sentry: stack trace + metadados |
| Por ID (evento) | `GET /api/0/organizations/{org}/issues/{id}/events/latest/` | Stack trace detalhado |
| Por query | `GET /api/0/organizations/{org}/issues/?query={q}&project={p}&limit=3` | Ticket via chat: correlacionar com erros conhecidos |

**Autenticação:** `Authorization: Bearer ${SENTRY_API_TOKEN}`. Token com scopes `project:read`, `event:read`, `org:read`.

**Retorno (modo por ID):**

```ts
{
  title: string,
  culprit: string,
  occurrences: number,
  usersAffected: number,
  firstSeen: string,    // ISO 8601
  lastSeen: string,
  permalink: string,
  stackTrace: string,   // últimas 10 frames, capado em 4000 chars
}
```

**Retorno (modo por query):** `{ issues: Issue[] }` com `Issue` = subset dos campos acima.

**Falha graciosa:** API fora → `{ error: "Sentry API error: <status>" }`. Não throw. Agente decide se segue ou pede mais contexto.

---

## Notificações ao Usuário

### Online (SSE ativo)

`GET /api/support/events` permanece aberto pelo widget. Quando o ticket vai para `resolved`, o servidor:
1. Localiza a conexão SSE pelo `user_id`
2. Envia evento `ticket_resolved` com `ticketId`
3. Marca `notified_at = now()`

### Offline

Sem conexão SSE para o `user_id`: envia e-mail pelo sistema de e-mail do projeto. Marca `notified_at = now()`.

### Retornando depois

Ao montar o widget, o frontend chama `GET /api/support/pending-notifications` que retorna tickets onde `resolved_at IS NOT NULL AND notified_at IS NULL`. Widget exibe badge + mensagem, depois faz `POST /api/support/notifications/:id/seen` para marcar.

---

## Variáveis de Ambiente

Convenção: todas armazenadas em SSM/Parameter Store. Nomes canônicos.

| Variável | Tier consumidor | Função |
|---|---|---|
| `ANTHROPIC_API_KEY` | 1, 2, 3, 4 | Claude API |
| `DATABASE_URL` | todos | PostgreSQL principal |
| `GITHUB_TOKEN` | 2, 3, 4 | Criar issues/PRs, fazer push e merge |
| `GITHUB_REPO` | 2, 3, 4 | Ex.: `org/repo` |
| `GITHUB_WEBHOOK_SECRET` | webhook handler | HMAC do webhook GitHub |
| `SENTRY_DSN` | server | SDK `@sentry/node` |
| `VITE_SENTRY_DSN` | client | SDK `@sentry/react` (injetado no build) |
| `SENTRY_ORG_SLUG` | Tier 2 | Ex.: `monolito-wd` |
| `SENTRY_PROJECT_SLUG` | Tier 2 + webhook | Ex.: `facefutura` |
| `SENTRY_API_TOKEN` | Tier 2 | Bearer token com `project:read`, `event:read`, `org:read` |
| `SENTRY_WEBHOOK_SECRET` | webhook handler | HMAC do webhook Sentry |

DSN do client é público por design — Sentry trata isso na API deles.

---

## Segurança — Checklist Obrigatório

| Item | Onde |
|---|---|
| HMAC em todos os webhooks | webhook handlers |
| `safeResolvePath` em todo tool que toca filesystem | `write_file`, `read_file` |
| Lista de arquivos protegidos (default + customizável) | Tier 3 |
| `run_tests` aponta DB de teste, nunca produção | Tier 3 |
| Git push usa GITHUB_TOKEN via HTTPS, nunca SSH key do servidor | Tier 3 |
| Tier 4 nunca aprova sem CI verde | Tier 4 (e webhook condition) |
| Tier 4 nunca faz force push | Tier 4 |
| Logs nunca expõem secrets (DSN, token, webhook secret) | em todos os logs |
| Webhook handler usa `express.raw({ type: 'application/json' })` antes do `bodyParser.json()` (assinatura precisa do corpo bruto) | bootstrap do server |

---

## Idempotência — Regras

| Tier | Checa | Se já está setado |
|---|---|---|
| Tier 2 | `ticket.githubIssueId` | Skip (não recria issue) |
| Tier 3 | `ticket.githubPrId` | Skip (não cria outro PR) |
| Tier 4 | PR já tem `approved` review do bot | Skip |
| Webhook Sentry | já existe ticket com `sentryIssueId = data.issue.id` | Não cria duplicata |
| Webhook GitHub `issues.closed` | `ticket.status === 'resolved'` | Não dispara notificação de novo |

Essas regras tornam o sistema seguro contra retries de fila e webhooks duplicados.

---

## Pontos de Variação por Projeto

O que muda entre produtos (e portanto **não** deve estar no package, mas sim injetável):

| Aspecto | Por que varia |
|---|---|
| System prompt do Tier 1 | Mapa de rotas, features, regras de negócio são domínio do produto |
| `read_data` (Tier 1) | Schema de negócio é por projeto |
| Tabelas auxiliares (e-mails, plano, créditos…) | Mesmo motivo |
| Critérios de aprovação do Tier 4 | Cada produto tem o que considera "infra core" |
| Lista de arquivos protegidos (Tier 3) | Idem |
| Notification channels | Alguns produtos só SSE, outros SSE+email+SMS |
| Modelo padrão por tier | Time pode querer trocar Haiku↔Sonnet em Tier 1 |
| Filtros de webhook Sentry | Ex.: ignorar issues abaixo de severity X |
| Política de re-tentativa do Tier 3 | Quantos ciclos, quando desistir |

O que **deve** ser estável no package:

- Orquestrador de tiers (loop tool-use, fila, retries)
- Tipos e schemas Drizzle/Zod das tabelas-core
- Handlers de webhook (verificação de assinatura, parsing)
- Cliente GitHub e cliente Sentry
- Implementação default das tools comuns (`read_file`, `search_code`, `read_logs`, `git_*`, `run_tests`, etc.)
- Bus de notificações SSE

---

## Modelo de IA — Defaults Recomendados

| Tier | Default | Por que |
|---|---|---|
| Tier 1 | Claude Haiku | Streaming rápido, custo baixo, suficiente pra orientar usuário |
| Tier 2 | Claude Opus | Análise técnica profunda justifica o custo |
| Tier 3 | Claude Opus | Codegen + ciclos de teste requer raciocínio robusto |
| Tier 4 | Claude Opus | Decisão binária mas com nuance — não comprime bem em modelos pequenos |

Tudo deve ser **configurável por projeto** (env var ou option no init).

---

## Anatomia de Arquivos no Projeto Consumidor

Como referência (estrutura do FaceFutura — implementação alvo):

```
server/
  api/
    support.ts                  — REST do chat (Tier 1)
    webhooks-github.ts          — Webhook GitHub
    webhooks-sentry.ts          — Webhook Sentry
  lib/
    sentry.ts                   — Init @sentry/node
    github-client.ts            — Cliente GitHub API
    queue.ts                    — pg-boss: filas dos tiers
    support-agent.ts            — Tier 1
    support-sse-bus.ts          — Bus SSE
    support-system-prompt.ts    — Prompt do Tier 1 (DOMÍNIO)
    support-tier2-agent.ts      — Tier 2
    support-tier2-tools.ts      — Tools do Tier 2
    support-tier3-agent.ts      — Tier 3
    support-tier3-tools.ts      — Tools do Tier 3
    support-tier4-agent.ts      — Tier 4
    support-tier4-tools.ts      — Tools do Tier 4
  workers/
    support-tier2-worker.ts     — Wrapper pg-boss
    support-tier3-worker.ts
    support-tier4-worker.ts

client/src/
  lib/
    sentry.ts                   — Init @sentry/react
  components/support/
    support-chat-widget.tsx
    support-chat-panel.tsx
    support-message.tsx
  hooks/
    use-support-chat.ts

shared/
  schema.ts                     — tickets, conversations, enums
```

No package, a meta é que **tudo em `server/lib/*-agent.ts`, `*-tools.ts`, `queue.ts`, `github-client.ts`, `sentry.ts`, `support-sse-bus.ts`, e os handlers de webhook** seja importado de `@devorama/autosupport`. Apenas o system prompt do Tier 1, as tools de domínio (ex.: `read_data`), e a configuração de notificações ficam no projeto.

---

## Pré-requisitos Operacionais

Por projeto consumidor:

1. PostgreSQL com `pg-boss` rodando no mesmo banco
2. Repositório GitHub com:
   - Token PAT com `repo` scope
   - Webhook configurado para `issues` e `check_suite` apontando para `/api/webhooks/github`
3. Projeto Sentry com:
   - DSN gerado
   - Auth token (`project:read`, `event:read`, `org:read`)
   - Alert rule "A new issue is created" → webhook `/api/webhooks/sentry`
4. CI rodando em PRs com label `support-auto` (necessário para o gatilho do Tier 4)
5. SSM/Parameter Store ou equivalente para armazenar secrets

---

## Fora do Escopo (v1)

- Re-tentativa automática do Tier 3 após Tier 4 bloquear (risco de loop)
- Notificação por Slack/email quando Tier 3 desiste
- Análise de vulnerabilidade no diff (security review)
- Rollback automático se bug aparecer pós-merge
- Suporte a múltiplos repositórios por projeto
- Source map upload no CI
- Sentry Performance (tracing/spans)
- Agrupar múltiplos issues Sentry num único ticket de suporte
- Filtro por ambiente Sentry (staging vs production) — tudo vai para production
- SLA / fila de prioridade entre tickets
- Painel admin de tickets (issues vivem no GitHub)

---

## Próximos Passos

1. **Validar a spec com o FaceFutura** — refatorar mentalmente o código atual contra esta spec, confirmar que nada foi perdido na extração
2. **Plan de extração** — `docs/superpowers/plans/2026-05-DD-autosupport-package.md` listando: estrutura de diretórios em `packages/autosupport/`, peer deps, interface pública, plano de migração do FaceFutura para consumir o package
3. **Scaffold do package** — `pnpm create` no monorepo, esqueleto + testes
4. **Migração FaceFutura → package** — substituir imports locais por `@devorama/autosupport`, validar em produção
5. **Segundo consumidor** — exercício para validar a interface (TiStats? outro produto?)

A spec é estável; a interface pública do package é o que vai precisar de iteração.
