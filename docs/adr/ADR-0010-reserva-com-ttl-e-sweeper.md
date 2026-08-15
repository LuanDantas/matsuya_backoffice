# ADR-0010 — Reserva com TTL e varredura no servidor

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [10 §2](../10-cashback-ledger.md)

## Contexto
O único timer que cancela um resgate abandonado vive no aplicativo do cliente. Se o app é morto, o débito pendente fica órfão para sempre e o saldo some em silêncio.

## Decisão
Reservas com TTL por canal, varredura a cada 30 s mais uma varredura incondicional no boot. Uma reserva sai de aberta exatamente uma vez, e perder a corrida é **sucesso no-op**, não erro.

## Alternativas consideradas
- **Confiar no timer do cliente:** é o comportamento atual, e ele está destruindo resgates hoje.

## Consequências
Entregável isoladamente, sem tocar no delivery. O TTL do servidor precisa ser estritamente maior que o timer do cliente — 180 s contra 120 s.
