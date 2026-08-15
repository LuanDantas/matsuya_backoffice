# ADR-0004 — RBAC com permissões e escopo multivalorado

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [15](../15-rbac.md)

## Contexto
Hoje há três papéis num `STRING`, `ensureRole` aplicado em um único ponto, e escopo por unidade em dois controllers. Um manager pertence a exatamente uma unidade.

## Decisão
Tabelas de papel e permissão, com concessão multivalorada por escopo (`network` | `group:{id}` | `unit:{id}`) e expiração opcional. `store_groups` existe desde o dia 1. O claim `role` do JWT vira derivado e legado, para não quebrar o app.

## Alternativas consideradas
- **Expandir a lista de papéis STRING:** não resolve escopo, e cada papel novo exige deploy.
- **Permissões dentro do JWT:** estoura o limite de header e não permite revogação.

## Consequências
Uma consulta de resolução por requisição, cacheada no Redis com invalidação por `permissions_version`. Migração em seis passos, sem impacto no app mobile até a atualização forçada.
