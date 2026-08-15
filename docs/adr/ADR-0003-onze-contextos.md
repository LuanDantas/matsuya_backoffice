# ADR-0003 — Onze contextos delimitados, não dezessete

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [07](../07-dominios.md)

## Contexto
O briefing propôs 17 contextos. Numa rede de 12 lojas, isso significa 17 pastas com um arquivo cada.

## Decisão
Fundir Identity+Authorization, Catalog+Pricing, Orders+Checkout; Chat vira submódulo de Orders; Support é descartado e vira um pacote de permissões. Restam 11 contextos e um kernel de plataforma.

## Alternativas consideradas
- **Manter os 17:** cerimônia sem benefício, e fronteiras que ninguém respeita porque não significam nada.

## Consequências
Menos indireção. Cada fusão tem ponto de extração identificado (o `priceResolver` para pricing, a pasta `chat` para chat), então voltar atrás é mover código, não redesenhar.
