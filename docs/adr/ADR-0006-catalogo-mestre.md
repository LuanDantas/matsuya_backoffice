# ADR-0006 — Catálogo mestre com override por unidade

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [08 §2](../08-banco-de-dados.md)

## Contexto
`products.unity_id` é NOT NULL: o mesmo prato existe como N linhas com N ids e N preços. É por isso que existe um endpoint só para traduzir carrinho entre lojas.

## Decisão
Catálogo mestre da rede (`catalog_items`) + override por unidade (`unit_catalog_items`), com **ausência de linha significando herança total**. `products` vira projeção derivada, preservando os ids legados. Consolidação por relatório de clusters com **revisão humana obrigatória**.

## Alternativas consideradas
- **Fusão automática por similaridade de nome:** corromperia o histórico de relatórios de forma irreversível.
- **Manter duplicado:** inviabiliza a gestão de cardápio pela matriz, que é metade do Corporate.

## Consequências
`cart/remap` deixa de ser necessário e vira um join. Abrir loja nova passa a ser um clique. Em troca, a consolidação exige trabalho humano do marketing antes da Fase 5.
