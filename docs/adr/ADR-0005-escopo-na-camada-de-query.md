# ADR-0005 — Imposição de escopo na camada de query

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [15 §6](../15-rbac.md)

## Contexto
Middleware que checa permissão é promessa. A garantia precisa existir onde as linhas são selecionadas.

## Decisão
`ScopedRepository`: nenhum método de leitura ou escrita existe sem contexto. O predicado de unidade é aplicado **depois** da cláusula do chamador. Linha fora de escopo devolve **404, não 403**. Guarda de CI proíbe acesso cru a model fora de repositório. RLS do PostgreSQL entra na Fase 3 como defesa em profundidade.

## Alternativas consideradas
- **Checagem no controller:** é o padrão atual, e já falhou em 90% dos endpoints.
- **RLS desde o dia 1:** exige que todo caminho de escrita esteja em transação, o que é trabalho demais para a Fase 1.

## Consequências
Impossível esquecer o filtro. O 404 impede enumeração de ids entre unidades. O custo é que todo repositório precisa declarar sua coluna de unidade explicitamente, inclusive quando não tem.
