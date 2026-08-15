# ADR-0011 — Creditar cashback na entrega, não na criação do pedido

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [10 §4.3](../10-cashback-ledger.md)

## Contexto
O momento do crédito define se o clawback é exceção ou rotina.

## Decisão
O crédito é postado na transição para entregue. Na loja, na confirmação do POS.

## Alternativas consideradas
- **Creditar na criação:** permitiria gastar o cashback do pedido A no pedido B e depois cancelar o A — um laço de dinheiro grátis.
- **Creditar na confirmação de pagamento:** melhor que na criação, mas ainda credita sobre pedidos que serão cancelados no preparo.

## Consequências
O caminho de clawback vira exceção rara. O cliente vê o cashback um pouco depois — o que é aceitável e é o padrão do setor.
