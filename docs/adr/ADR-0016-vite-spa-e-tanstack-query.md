# ADR-0016 — Vite SPA com TanStack Query, sem Next.js e sem Redux

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [04 §4 e §5](../04-arquitetura-frontend.md)

## Contexto
Nenhuma das aplicações tem SEO, todas ficam atrás de login, duas mantêm WebSocket de longa duração e uma precisa de resiliência offline.

## Decisão
Vite 6 + React 19 em SPA nas duas apps. TanStack Query como espinha do estado de servidor, com escrita direta no cache a partir de eventos de socket em vez de invalidação. Zustand para o pouco estado genuinamente de cliente. React Hook Form + Zod, com schemas compartilhados em `packages/contracts`.

## Alternativas consideradas
- **Next.js:** adiciona um runtime de servidor a operar, um modelo de cache extra, e briga com socket de longa duração — para comprar SEO e RSC que não podemos usar.
- **Redux Toolkit:** sobraria gerenciando cinco booleanos, já que o estado assíncrono é do Query.
- **RTK Query:** mais fraco exatamente onde precisamos de força — cirurgia manual de cache e rollback otimista.

## Consequências
Artefatos estáticos em CDN, zero runtime de servidor. A regra "escrever no cache, não invalidar" é o que evita a tempestade de refetch no pico do Hub.
