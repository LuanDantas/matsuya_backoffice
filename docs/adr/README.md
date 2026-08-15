# Registro de decisões arquiteturais (ADRs)

Cada ADR registra **uma decisão estrutural**: o contexto que a forçou, a decisão, as alternativas rejeitadas e as consequências aceitas. Um ADR não é documentação de como algo funciona — para isso existem os capítulos. Ele existe para que, daqui a um ano, ninguém precise redescobrir *por que* a escolha foi essa.

| # | Decisão | Capítulo | Status |
|---|---|---|---|
| [0001](./ADR-0001-modular-monolith.md) | Modular monolith na API existente | [06](../06-arquitetura-backend.md) | aceito |
| [0002](./ADR-0002-api-v1-e-congelamento.md) | Namespace `/api/v1` com congelamento do legado | [06 §4](../06-arquitetura-backend.md) | aceito |
| [0003](./ADR-0003-onze-contextos.md) | Onze contextos delimitados, não dezessete | [07](../07-dominios.md) | aceito |
| [0004](./ADR-0004-rbac-com-escopo.md) | RBAC com permissões e escopo multivalorado | [15](../15-rbac.md) | aceito |
| [0005](./ADR-0005-escopo-na-camada-de-query.md) | Imposição de escopo na camada de query | [15 §6](../15-rbac.md) | aceito |
| [0006](./ADR-0006-catalogo-mestre.md) | Catálogo mestre com override por unidade | [08 §2](../08-banco-de-dados.md) | aceito |
| [0007](./ADR-0007-ledger-de-carteira.md) | Ledger de carteira com lotes FIFO | [10](../10-cashback-ledger.md) | aceito |
| [0008](./ADR-0008-dinheiro-em-centavos.md) | Dinheiro em `BIGINT` de centavos | [10 §0.1](../10-cashback-ledger.md) | aceito |
| [0009](./ADR-0009-grandfather-na-migracao.md) | Preservar o saldo existente na migração | [10 §5.2](../10-cashback-ledger.md) | **pendente de aval financeiro** |
| [0010](./ADR-0010-reserva-com-ttl-e-sweeper.md) | Reserva com TTL e varredura no servidor | [10 §2](../10-cashback-ledger.md) | aceito |
| [0011](./ADR-0011-credito-na-entrega.md) | Creditar cashback na entrega | [10 §4.3](../10-cashback-ledger.md) | aceito |
| [0012](./ADR-0012-outbox-e-bullmq.md) | Outbox transacional com BullMQ e Redis | [13](../13-eventos.md) | aceito |
| [0013](./ADR-0013-resync-por-cursor.md) | Re-sincronização por cursor | [14 §5](../14-websockets.md) | aceito |
| [0014](./ADR-0014-lock-otimista-e-idempotencia.md) | Lock otimista, ordem fixa de lock e idempotência | [06 §6](../06-arquitetura-backend.md) | aceito |
| [0015](./ADR-0015-monorepo-duas-apps.md) | Monorepo com dois deployables e três experiências | [04 §1](../04-arquitetura-frontend.md) | aceito |
| [0016](./ADR-0016-vite-spa-e-tanstack-query.md) | Vite SPA com TanStack Query | [04 §4 e §5](../04-arquitetura-frontend.md) | aceito |
| [0017](./ADR-0017-agente-de-impressao.md) | Agente local de impressão com fallback pelo navegador | [04 §7](../04-arquitetura-frontend.md) | aceito |

## Como registrar um ADR novo

Copie `_template.md`, numere em sequência e preencha as quatro seções. Um ADR nunca é editado depois de aceito — quando a decisão muda, escreve-se um novo ADR com status *substitui ADR-NNNN*, e o antigo passa a *substituído por*. O histórico das decisões erradas vale tanto quanto o das certas.
