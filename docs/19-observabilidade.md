# 19 — Observabilidade

> PARTE 19 do briefing. Hoje não existe nada: `console.log` como logger, nenhum middleware de log de requisição, **nenhum middleware de erro** (cada controller devolve 400 por conta própria), nenhuma métrica, nenhum tracing, nenhum APM. A única superfície de saúde é `GET /healthcheck`, que dá um `sequelize.authenticate()`.

---

## 1. Logging

`pino` + `pino-http`, JSON no stdout.

- `requestId` vindo de `X-Request-Id` ou gerado como ULID, carregado em `AsyncLocalStorage` de modo que **toda** linha de log — inclusive dentro dos workers, via a coluna `request_id` do outbox — o carregue.
- Caminhos de redação configurados para `req.headers.authorization`, `req.body.password`, `req.body.token` e `*.document`.
- Substituição mecânica de `console.log`, com regra de ESLint `no-console` para impedir regressão.

O `requestId` é o que costura uma linha de log da API, a linha de auditoria correspondente, o evento no outbox, o job no worker e o breadcrumb no Sentry — é a peça de maior retorno de todo este capítulo.

## 2. Tratamento de erro

Hierarquia `AppError`: `ValidationError` 422 · `UnauthorizedError` 401 · `ForbiddenError` 403 · `NotFoundError` 404 · `ConflictError` 409 · `RateLimitError` 429 · `UpstreamError` 502.

Um `errorHandler` terminal mapeia essas classes para o envelope v1. Qualquer coisa não reconhecida é logada em `error` com stack, reportada ao Sentry, e devolve um `500` genérico **com o `requestId`** — nunca um stack trace, que os caminhos de código atuais podem vazar.

Um wrapper `asyncHandler(fn)` é obrigatório em todo controller: **o Express 4 não captura promises rejeitadas**, e o código atual tem vários `await` desguarnecidos — uma rejeição não tratada derruba o processo.

## 3. Saúde

| Endpoint | Semântica |
|---|---|
| `GET /healthz` | **Liveness**: o processo está de pé. Sem banco. **Nunca falha por dependência** |
| `GET /readyz` | **Readiness**: `SELECT 1`, `PING` no Redis, contagem de migrations pendentes = 0. `503` em falha → o balanceador retira a instância |
| `GET /internal/status` | Autenticado: profundidade das filas, **idade da linha mais antiga não publicada do outbox**, sockets por loja, SHA do build, versão de migration |

O `GET /healthcheck` atual permanece como alias.

## 4. Métricas que se pagam

| Métrica | Por quê | Alerta |
|---|---|---|
| **SLA de aceite** (p50/p95 de `placed_at → accepted_at`, por loja) | É o KPI operacional central do Hub | p95 > 5 min |
| **Pedidos não aceitos há mais de N min** | Impacto direto no cliente | qualquer um > 8 min |
| **Conexões de socket por loja** | Detecta a loja cujo Hub está fechado ou offline | **0 durante o horário de funcionamento** |
| Profundidade e idade do job mais antigo por fila | Detecção de worker travado | `notifications` > 500, ou idade > 5 min |
| **Idade da linha mais antiga não publicada do outbox** | **A métrica interna mais importante do sistema** — se o relay trava, nada downstream acontece e nada mais parece quebrado | > 60 s |
| Atraso de webhook (`timestamp do provedor → processed_at`) | Saúde da conciliação de pagamento | p95 > 30 s |
| Taxa de 5xx e p95 de latência por rota | Linha de base | 5xx > 1% em 5 min |
| Utilização do pool de conexões e `pg_stat_activity` em espera | Precede a queda total | > 80% |
| Taxa de falha de notificação por canal | Detecção de queda de provedor | > 10% em 10 min |
| **Deriva de conciliação da carteira** | Deriva num ledger financeiro é sempre defeito de código | qualquer valor diferente de zero |
| Taxa de falha de impressão por unidade | É assim que se descobre que a impressora de uma loja está quebrada há uma semana | > 20% em 1 h |

## 5. A pilha mínima porém real

**Dia 1:** pino → o agregador de logs da plataforma (Render) + **Sentry** (erros, releases, source maps, tags de `requestId`/`userId`/`unitId`) + a página `/internal/status` + **UptimeRobot** no `/readyz` + um job noturno de digest publicando a tabela de KPIs no WhatsApp ou Slack.

**Rejeitados explicitamente no dia 1:** Prometheus + Grafana + Loki + OpenTelemetry. Essa pilha são 3 a 5 dias de setup e uma superfície de manutenção contínua, e para um monolito de processo único responde perguntas que o Sentry e um endpoint de status já respondem. **Tracing distribuído em particular tem valor próximo de zero quando existe exatamente um serviço** — o "trace" é um único stack frame.

**Adicionar Prometheus + Grafana quando** qualquer um destes ocorrer: (a) mais de 2 instâncias de API; (b) mais de 25 lojas; (c) o primeiro incidente em que "quando isso começou / é uma loja ou todas" não puder ser respondido pelos logs em 10 minutos.

O custo de implementação nesse momento é pequeno, porque contadores do `prom-client` podem ser espalhados depois. **O que importa fixar agora são as definições de métrica acima** — e elas estão fixadas.

Adicionar tracing com OTel apenas se o monolito for algum dia dividido.

## 6. Alertas e escalonamento

| Nível | Exemplos | Canal |
|---|---|---|
| **Página** (acorda alguém) | Outbox parado > 60 s · deriva na carteira · `/readyz` falhando · 5xx > 5% · banco inacessível | Ligação/push ao plantão |
| **Alto** | SLA p95 estourado · loja sem socket em horário de funcionamento · falha de notificação > 10% · webhook atrasado | WhatsApp/Slack do time |
| **Operacional** (vai ao Corporate, não à engenharia) | Excesso de cancelamentos numa unidade · impressora offline · conciliação divergente · NPS abaixo do limite | `network:alerts` + central de notificações (C-36) |
| **Digest** | Resumo diário de KPIs, breakage do dia, ajustes manuais de cashback | E-mail 06:00 BRT |

A separação entre "alto" e "operacional" é deliberada: **anomalia de negócio não deve acordar engenheiro**, e falha de infraestrutura não deve virar item de painel de diretoria.
