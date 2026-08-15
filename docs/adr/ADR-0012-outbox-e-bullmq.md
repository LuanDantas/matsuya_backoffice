# ADR-0012 — Outbox transacional com BullMQ e Redis

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [13](../13-eventos.md)

## Contexto
Push, SMS, WhatsApp e e-mail são chamadas HTTP dentro do handler. Uma falha de push pode derrubar um pedido; um rollback pode acontecer depois de o push já ter saído.

## Decisão
Toda emissão de evento passa pelo outbox, com transação obrigatória. Um relay com `FOR UPDATE SKIP LOCKED` enfileira no BullMQ usando o `event_id` como `jobId`.

## Alternativas consideradas
- **Kafka:** operar um broker para alguns milhares de eventos por dia é centro de custo; o replay que ele daria, o outbox já dá por 14 dias.
- **RabbitMQ:** segunda dependência com estado, entregando o que o BullMQ já tem.
- **`pg-boss`:** vice-campeão sério, mas o Redis é necessário de qualquer forma e polling pesado competiria com o OLTP.

## Consequências
Uma dependência nova. A métrica de idade da linha mais antiga não publicada passa a ser a métrica interna mais importante do sistema.
