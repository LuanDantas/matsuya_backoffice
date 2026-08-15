# ADR-0009 — Preservar o saldo existente na migração (grandfather)

- **Status:** aceito, **pendente de aval financeiro** · **Data:** 2026-08-14 · **Detalhe:** [10 §5.2](../10-cashback-ledger.md)

## Contexto
O saldo verdadeiro por FIFO é sempre menor ou igual ao saldo que a fórmula atual exibe. Migrar sem tratar isso reduziria o saldo de clientes reais.

## Decisão
Emitir um lote de crédito de migração igual à diferença, com validade de 90 dias a partir do cutover. Calcular o custo agregado e obter aval escrito do financeiro **antes** de commitar.

## Alternativas consideradas
- **Truncar:** queda de saldo e tempestade de suporte.
- **Grandfather sem validade:** carrega o passivo fantasma para sempre.

## Consequências
Despesa única de resultado, conhecida antes de ser incorrida. O vazamento é fechado dali para a frente, e o excedente legado se autoliquida em 90 dias.
