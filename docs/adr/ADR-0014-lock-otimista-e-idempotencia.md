# ADR-0014 — Lock otimista, ordem fixa de lock e chaves de idempotência

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [06 §6](../06-arquitetura-backend.md)

## Contexto
Dois operadores aceitando o mesmo pedido, duplo clique do cliente, webhook duplicado e cancelamento correndo contra captura são cenários rotineiros, não exóticos.

## Decisão
Coluna `version` com `UPDATE … WHERE status = <esperado> AND version = <esperada>`; `Idempotency-Key` com replay de resposta nas mutações; chave primária composta na tabela de eventos de provedor; `SELECT … FOR UPDATE` na linha do pedido; e **ordem de lock fixa em todo o sistema: `orders` → `payments` → `wallet_*`**.

## Alternativas consideradas
- **`version: true` do Sequelize:** lança erro opaco e não permite acrescentar o predicado de status.
- **Lock distribuído no Redis:** dependência a mais para um problema que o Postgres já resolve.

## Consequências
Deadlock vira estruturalmente impossível. O 409 precisa devolver o estado atual no corpo, para o cliente re-renderizar sem outra ida ao servidor.
