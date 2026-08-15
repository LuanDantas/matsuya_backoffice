# ADR-0001 — Modular monolith na API existente

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [06](../06-arquitetura-backend.md)

## Contexto
A API atual é Express + Sequelize, com um roteador plano de 508 linhas e sem prefixo. O time tem 1 a 3 pessoas. A rede tem 6 a 12 unidades. O cashback está em produção.

## Decisão
Evoluir o repositório existente como modular monolith: um processo, um banco, uma unidade de deploy. Congelar o roteador legado e criar `/api/v1` com módulos por contexto.

## Alternativas consideradas
- **Novo serviço NestJS ao lado (strangler):** mais limpo, mas cria dois donos do mesmo banco e dobra a superfície operacional.
- **Reescrita completa em NestJS:** melhor destino final, pior relação risco/retorno — 25 controllers e 30 serviços, com o cashback em produção no meio.

## Consequências
Sem reescrita e sem quebrar o app mobile. Em troca, as fronteiras dependem de disciplina, e por isso são reforçadas por regra de ESLint e guarda de CI. Extrair um contexto depois continua possível, porque a fronteira é o serviço do módulo.
