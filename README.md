# Matsuya — Ecossistema administrativo

Especificação arquitetural das três aplicações administrativas que ficarão por trás do app Matclub (cashback) e do delivery próprio: **Corporate**, **Portal da Unidade** e **Order Hub**.

Este repositório contém, por ora, apenas a especificação. Ele é também a raiz futura do monorepo das aplicações (`apps/` + `packages/`, conforme [04](./docs/04-arquitetura-frontend.md)).

> **Comece por aqui:** [00 — Sumário executivo](./docs/00-sumario-executivo.md) · dez minutos de leitura, sem precisar abrir mais nada.
>
> **Para apresentar:** [`RELATORIO-EXECUTIVO.html`](./RELATORIO-EXECUTIVO.html) — página autocontida (abre com duplo clique, sem servidor e sem internet), com os diagramas embutidos e folha de estilo de impressão para exportar em PDF.

---

## Índice

### Fundamentos
| # | Documento | Conteúdo |
|---|---|---|
| 00 | [Sumário executivo](./docs/00-sumario-executivo.md) | O problema, a proposta e as sete decisões que importam · PARTES 1 e 2 |
| 01 | [Premissas e lacunas](./docs/01-premissas-e-lacunas.md) | Suposições explícitas e as perguntas que precisam do negócio |
| 02 | [Estado atual](./docs/02-estado-atual.md) | Auditoria dos três repositórios, dívida técnica e riscos herdados |

### Produto e experiência
| # | Documento | Conteúdo |
|---|---|---|
| 03 | [As três aplicações](./docs/03-tres-aplicacoes.md) | Visão de conjunto, máquina de estados de UI e a **UX do Order Hub em profundidade** · PARTE 3 |
| 16 | [Inventário de telas](./docs/16-telas.md) | 36 + 18 + 12 telas, com objetivo, ações, filtros, permissões, estados e erros · PARTE 16 |
| 17 | [UX e navegação](./docs/17-ux-navegacao.md) | Arquitetura de navegação, semântica de cor, copy pt-BR e matriz de notificações · PARTE 17 |

### Front-end
| # | Documento | Conteúdo |
|---|---|---|
| 04 | [Arquitetura front-end](./docs/04-arquitetura-frontend.md) | Monorepo, framework, estado, tempo real, impressão e migração do admin atual · PARTE 4 |
| 05 | [Design System](./docs/05-design-system.md) | Tokens, dark mode, inventário de componentes e acessibilidade |

### Back-end e dados
| # | Documento | Conteúdo |
|---|---|---|
| 06 | [Arquitetura de back-end](./docs/06-arquitetura-backend.md) | Modular monolith, `/api/v1`, concorrência, auditoria e operação · PARTES 5, 6 e 10 |
| 07 | [Domínios](./docs/07-dominios.md) | Os 11 contextos delimitados e suas responsabilidades · PARTE 7 |
| 08 | [Banco de dados](./docs/08-banco-de-dados.md) | Modelo-alvo, catálogo mestre, ERD e correções de integridade · PARTE 8 |
| 09 | [Pedidos](./docs/09-pedidos.md) | Ciclo de vida e máquina de estados · PARTE 9 |
| 12 | [API](./docs/12-api.md) | Catálogo REST `/api/v1` e os seis endpoints que definem o sistema · PARTE 12 |
| 13 | [Eventos](./docs/13-eventos.md) | Catálogo de eventos, outbox transacional e filas · PARTE 13 |
| 14 | [WebSockets](./docs/14-websockets.md) | Rooms, handshake e o protocolo de re-sincronização por cursor · PARTE 14 |

### Dinheiro
| # | Documento | Conteúdo |
|---|---|---|
| 10 | [Cashback (ledger)](./docs/10-cashback-ledger.md) | Ledger com lotes FIFO, reservas, migração e invariantes · PARTE 10 |
| 11 | [Pagamentos](./docs/11-pagamentos.md) | Mercado Pago, Pix, cartão, híbrido, saga e matriz de compensação · PARTE 11 |

### Transversais
| # | Documento | Conteúdo |
|---|---|---|
| 15 | [RBAC](./docs/15-rbac.md) | Matriz de papéis × permissões × escopo e imposição na camada de query · PARTE 15 |
| 18 | [Segurança](./docs/18-seguranca.md) | Fase 0 de remediação, OWASP, LGPD e PCI DSS · PARTE 18 |
| 19 | [Observabilidade](./docs/19-observabilidade.md) | Logs, métricas, saúde e alertas · PARTE 19 |
| 20 | [Cenários de falha](./docs/20-cenarios-de-falha.md) | 31 cenários com a reação projetada · PARTE 20 |

### Planejamento
| # | Documento | Conteúdo |
|---|---|---|
| 21 | [Roadmap](./docs/21-roadmap.md) | Sete fases com portão de saída explícito · PARTE 21 |
| 22 | [Backlog](./docs/22-backlog.md) | Épico → Feature → User Story · PARTE 22 |
| 23 | [Priorização](./docs/23-priorizacao.md) | P0 / P1 / P2 / P3 com critério de corte · PARTE 23 |
| 24 | [Riscos](./docs/24-riscos.md) | Técnicos, financeiros, operacionais, de segurança, performance, UX e produto · PARTE 24 |
| 25 | [Evoluções futuras](./docs/25-evolucoes-futuras.md) | O que a arquitetura mantém possível — e o que ela inviabiliza · PARTE 25 |

### Decisões
[Registro de decisões arquiteturais (ADRs)](./docs/adr/) — 17 decisões estruturais, cada uma com contexto, alternativas consideradas e consequências.

---

## Os cinco fatos que motivaram este trabalho

1. Existem exatamente **dois** endpoints administrativos de pedido hoje: listar e mudar status. Não há tempo real, som, SLA, chat, impressão nem despacho.
2. **Nove endpoints de escrita não têm autenticação alguma** — incluindo os que criam cashback e disparam push para toda a base.
3. O segredo do JWT está escrito no código (`src/services/jwtService.ts:3`) e os arquivos `.env` de produção estão versionados no git.
4. A fórmula de saldo de cashback compensa expiração em agregado e, por isso, **exibe saldo que o cliente não tem** — de forma unidirecional e crescente com a idade do programa.
5. O débito pendente de um resgate abandonado **nunca é liberado**, porque o único timer que o cancela vive no aplicativo do cliente.

---

## Repositórios do ecossistema

| Repositório | Papel | Observação |
|---|---|---|
| `matsuya_app-api` | A única API | Branch padrão é `master`; **todo o delivery vive em `feature/delivery-backend`, nunca mesclada** |
| `matsuya_app-v2` | App mobile do cliente | Matclub em produção; delivery na Fase 1 |
| `matsuya_app-admin-v2` | Admin web atual | Será absorvido pelo Corporate por fases |
| `matsuya_backoffice` | **Este repositório** | Especificação hoje; monorepo das aplicações depois |

---

## Convenções deste documento

- Toda afirmação sobre o estado atual é verificável em `arquivo:linha` no código-fonte, e foi conferida em **14/08/2026**.
- Os literais de domínio (status de pedido, meio e status de pagamento, tipo de entrega, papéis) são **normativos**: painel, API e app não podem divergir.
- Diagramas em Mermaid, renderizáveis no GitHub.
- Toda decisão não óbvia traz a alternativa rejeitada e o motivo.
