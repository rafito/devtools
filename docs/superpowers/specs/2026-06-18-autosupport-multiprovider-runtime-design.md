# Autosupport — Runtime Multi-Provider e Stack-Agnóstico — Design

**Data:** 2026-06-18
**Pacote alvo:** `@devorama/autosupport`
**Estado:** Spec de evolução (sobre a base 2026-05-20, em produção desde 2026-05-19)
**Predecessora:** [2026-05-20-autonomous-support-design.md](./2026-05-20-autonomous-support-design.md)

---

## Motivação

A lib hoje resolve o loop suporte→fix, mas está **casada com um único trio**: GitHub + Sentry + Anthropic, e só pluga em apps **Node/Express** (peer deps `express`, `drizzle-orm`, `pg-boss`). O objetivo desta evolução é torná-la utilizável em **qualquer projeto, com qualquer stack**, e **multi-provider** em cada eixo:

- **VCS:** GitHub **e** GitLab
- **Error tracking:** Sentry **e** Bugsnag
- **LLM:** Anthropic **e** OpenAI

Isso é uso **interno** (produtos Devorama/Hoop), não produto comercial.

### Não-objetivos (explicitamente fora de escopo)

Avaliamos transformar isso num SaaS e **abortamos**: GitHub Agentic Workflows (public preview, jun/2026) e Copilot Coding Agent (GA mar/2026) comoditizaram os Tiers 2–4 (issue→investiga→fix→PR). Portanto **fora de escopo**: multi-tenancy, billing, control plane, dashboard SaaS, onboarding self-serve. Foco exclusivo: a lib excelente para consumo próprio.

---

## Estado atual (auditoria 2026-06-18)

- ~2.250 LOC, modular (`clients · tiers · tools · webhooks · schema · queue · notifications`)
- Test parity ~1:1 (21 arquivos de teste), zero TODO/FIXME
- `factory.ts` (295 LOC) é o ponto de montagem — maior arquivo, candidato a divisão ao introduzir ports
- v0.3.2; hard-wired em `clients/github.ts`, `clients/sentry-api.ts`, `@anthropic-ai/sdk`

---

## Arquitetura: Ports & Adapters

Três contratos (ports). O pipeline (tiers) **nunca** referencia um provider concreto — só os ports.

```
VcsProvider     clone · branch · commit/push · openIssue · openPR (PR|MR)
                comment · merge · ciStatus · verifyWebhook · parseEvent
                adapters: github | gitlab

ErrorSource     verifyWebhook · parseEvent → ErrorEvent canônico · fetchDetail
                adapters: sentry | bugsnag

LlmProvider     runWithTools(messages, tools, model) · stream · modelMap(tier→model)
                adapters: anthropic | openai   (via Vercel AI SDK)
```

- **Evento canônico:** webhooks de qualquer provider são traduzidos para um `CanonicalEvent` interno antes de virar ticket. Os tiers veem só o canônico.
- **LLM via Vercel AI SDK** (`ai`): unifica tool-calling/streaming entre Anthropic e OpenAI. Substitui o uso direto de `@anthropic-ai/sdk`. `modelMap` mapeia papel do tier (`fast` p/ Tier 1, `heavy` p/ Tiers 2–4) → modelo concreto do provider selecionado.

---

## Modos de integração

### Modo A — Embedded (Node), mantido
Projetos Node continuam fazendo `import { createSupportPipeline }`. Atalho de menor fricção; é o que já existe.

### Modo B — Serviço standalone (qualquer stack), novo
Um app FastAPI/Python não importa uma lib Node. A lib passa a rodar também como **serviço deployável** (Docker + Postgres), integrando **sem código na aplicação**:

- **Webhooks:** GitHub/GitLab/Sentry/Bugsnag apontam para o serviço (config no provider, zero código no app).
- **Chat API:** endpoint HTTP/SSE para o Tier 1 — qualquer linguagem consome.
- **Domain tools via MCP:** o app expõe um **MCP server** com suas ferramentas de domínio; o serviço conecta como MCP client e o Tier 1 as usa. É o mecanismo cross-stack — hoje as domain tools são funções TS (só Node); MCP destrava Python, Go, qualquer coisa.

O serviço empacota internamente o Express + pg-boss + schema; o consumidor só fornece config (providers, secrets, MCP endpoint) e aponta os webhooks.

---

## Autonomia e segurança (inalterado da base, reafirmado)

- **Política de autonomia por repo:** `chat-only | até-PR | até-merge`. Gate aplicado antes de cada escalada de tier.
- **Tier 3 isolado:** worker clona em diretório temporário, credencial de escopo mínimo e curta duração, cleanup garantido. **Não roda os testes do consumidor** — o CI dele valida o PR/MR. (Sem execução de código não-confiável no runtime.)
- Webhook signature obrigatório por provider + idempotência (dedupe). Cap de custo por execução. Falha após retries → ticket "needs human".

---

## Dados e fila

Postgres + Drizzle (estende `createSupportSchema`). Fila via pg-boss sobre o mesmo Postgres. Tabelas: `tickets · conversations · actions(timeline) · usage(tokens/custo)` + `connections(provider,kind=vcs|error|llm)` para o modo serviço.

---

## Faseamento

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **F1** | 3 ports definidos; adapters atuais (github/sentry/anthropic) refatorados para trás deles; LLM migrado p/ AI SDK (**ganha OpenAI**). Modo embedded intacto. | Suíte atual verde + OpenAI selecionável; nenhum tier referencia provider concreto. |
| **F2** | Adapters **GitLab** e **Bugsnag**. Contract tests por port (mesma suíte roda em ambos os adapters de cada eixo). | GitLab+Bugsnag passam o contract test; evento canônico cobre os 4. |
| **F3** | **Modo serviço standalone**: server deployável, webhooks multi-provider, chat API HTTP/SSE. | Subir via Docker; webhook→ticket→fix ponta a ponta sem importar a lib. |
| **F4** | **Domain tools via MCP** (Tier 1 conecta a um MCP server do app). | Tier 1 usa tool exposta por um MCP server externo (sample em Python). |

Cada fase é independentemente entregável e não quebra a anterior. F1 é a fundação e já agrega OpenAI sem mexer no modo de consumo atual.

---

## Testing

- **Contract tests por port:** uma suíte por port roda contra todos os seus adapters (github↔gitlab, sentry↔bugsnag, anthropic↔openai). Garante paridade de comportamento.
- Unit por adapter (APIs externas mockadas) · integração webhook→ticket→tier · E2E "golden ticket" num repo sandbox.
- Mantém vitest + supertest.

---

## Questões em aberto

- **MCP transport** no modo serviço: stdio (subprocess) vs HTTP/SSE (remoto) — provável HTTP p/ desacoplar deploy.
- **GitLab self-managed** vs gitlab.com: scoping de token e URL base configuráveis.
- **OpenAI tool-calling** paridade fina com Anthropic (prompt caching, formato) — validar no contract test do `LlmProvider`.
