# ADR-0002 — Namespace `/api/v1` com congelamento do legado

- **Status:** aceito · **Data:** 2026-08-14 · **Detalhe:** [06 §4](../06-arquitetura-backend.md)

## Contexto
Não existe prefixo de API: as rotas vivem na raiz. O app mobile em produção depende delas e não tem refresh token. Versionar por cima quebraria clientes.

## Decisão
Criar `/api/v1` em paralelo. `src/routes.ts` fica congelado (guarda de CI reprova aumento de linhas) e recebe `Deprecation`/`Sunset`. A aposentadoria de cada rota é guiada pelo log de tráfego por versão de app e pela alavanca `min_version`/`force_update` que já existe.

## Alternativas consideradas
- **Renomear as rotas atuais:** quebra o app em produção.
- **Manter tudo na raiz:** impossibilita versionar e perpetua o arquivo de 508 linhas.

## Consequências
Dois roteadores convivendo por meses. O envelope de resposta v1 é novo; o legado mantém sua forma intacta, inclusive nos erros.
