# ADR-0008 — Dinheiro em `BIGINT` de centavos

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [10 §0.1](../10-cashback-ledger.md)

## Contexto
`Point.cashback`, `Point.points` e todos os valores de `orders` são `FLOAT`. IEEE-754 não representa R$ 0,10.

## Decisão
Todo dinheiro no schema novo é `BIGINT` em centavos. Guarda de runtime `assertInt` na fronteira do serviço de carteira. As colunas float legadas convivem durante a transição e são convertidas na borda.

## Alternativas consideradas
- **`NUMERIC(12,2)`:** correto, mas o Sequelize devolve como string, o que exige auditar todo consumidor de qualquer forma; centavo inteiro é mais rápido e indexa melhor.
- **Manter FLOAT:** torna o invariante `SUM(lançamentos) == saldo` inimplementável.

## Consequências
Migração expand/contract com dual-write. É o item de maior esforço da Fase 0, e não pode escorregar para depois de existir pagamento.
