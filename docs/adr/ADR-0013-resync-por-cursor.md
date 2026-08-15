# ADR-0013 — Re-sincronização por cursor, com o socket como otimização

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [14 §5](../14-websockets.md)

## Contexto
Loja de restaurante tem internet instável. Um painel que perde um pedido numa reconexão é inaceitável.

## Decisão
`store_change_log` com sequência monotônica gravada na mesma transação de toda mutação, mais `GET /stores/:id/orders/changes?since=`. O cliente detecta lacuna por número de sequência e re-sincroniza. Sem socket, degrada para polling de 10 s.

## Alternativas consideradas
- **Confiar na entrega do socket:** nenhum transporte garante entrega através de reconexão.
- **Refetch completo a cada reconexão:** funciona, mas é caro e cria janela de inconsistência visual no pico.

## Consequências
Uma tabela a mais, com retenção de 7 dias. Em troca, a camada de socket vira segura de operar, e o Hub continua correto mesmo com ela inteiramente fora.
