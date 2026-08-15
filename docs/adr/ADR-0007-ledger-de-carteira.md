# ADR-0007 — Ledger de carteira com lotes FIFO

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [10](../10-cashback-ledger.md)

## Contexto
A fórmula atual compensa expiração em agregado e, por isso, exibe saldo que o cliente não tem — de forma unidirecional e crescente com a idade do programa.

## Decisão
Lançamentos imutáveis append-only, lotes com `expires_at` e consumo persistido, consumo FIFO por `expires_at ASC, id ASC`, saldo cacheado mantido correto na mesma transação, e reconciliação que **congela a conta em vez de se autocorrigir**.

## Alternativas consideradas
- **Corrigir a fórmula:** impossível — ela não tem como saber de qual lote um débito saiu.
- **Partida dobrada completa com plano de contas:** dobra o volume de escrita sem comprar nada que uma view de relatório não entregue.

## Consequências
O passivo de cashback passa a ser calculável. A migração exige decisão de negócio sobre o saldo fantasma existente (ADR-0009).
