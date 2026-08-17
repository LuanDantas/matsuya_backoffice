# Matsuya — Suíte administrativa

Monorepo das aplicações administrativas do ecossistema Matsuya (Matclub + Delivery),
mais a especificação arquitetural que as define.

## Estrutura

```
docs/                    especificação (26 capítulos, 17 ADRs)
RELATORIO-EXECUTIVO.html relatório autocontido para apresentar

apps/
  hub/                   Order Hub — quadro de pedidos da loja (tablet)
  console/               Corporate + Portal da Unidade (não iniciado)
packages/
  contracts/             espelho do domínio: estados, motivos, ações, permissões
  api-client/            transporte tipado sobre /api/v1
  realtime/              sincronizador de cursor + socket
  config/                presets compartilhados
tooling/                 geração e verificação de contrato
```

## Começando

```bash
pnpm install
pnpm --filter @matsuya/hub dev     # http://localhost:5180
```

O Hub precisa da API rodando. No repositório da API:

```bash
npm run dev                        # http://localhost:3001
```

Configuração do Hub em `apps/hub/public/config.json` — lida em **runtime**, não no
build, para que trocar a URL da API num tablet não exija recompilar.

## Contrato com a API

`packages/contracts` espelha estados de pedido, motivos, ações e permissões. A
fonte da verdade é a API — é lá que a transição é de fato recusada.

Espelho que diverge da fonte é pior do que espelho nenhum: ele mostra botão que
dá 409, ou esconde pedido que existe. Por isso:

```bash
pnpm contracts:drift               # reprova se front e API discordarem
node tooling/gerar-permissoes.mjs  # regera a união de chaves de permissão
```

A verificação procura a API em `../matsuya_app-api-phase0`, ou onde
`MATSUYA_API_PATH` apontar. **Se não encontrar, sai com código 2** — não com
sucesso: tratar "não verifiquei" como "está tudo bem" é o jeito mais fácil de
uma checagem virar decoração.

## Estado

| Pacote | Situação |
|---|---|
| `contracts` | estados, motivos, ações, permissões geradas |
| `api-client` | pedidos, painel, alertas, operação da loja, entrega |
| `realtime` | sincronizador de cursor — 12 testes |
| `ui` | design system: ~15 componentes, tokens, verificador de contraste |
| `printing` | ESC/POS + caminho pelo navegador |
| `utils`, `config` | geo e configuração compartilhada |
| `apps/hub` | telas completas; sessão provisória |
| `apps/console` | **não iniciado** — `src/` vazio |
| `queries`, `auth`, `observability` | **não iniciados** — diretórios vazios |

O Hub tem quadro, drawers, chat, exceções, conversas, rota com mapa, cardápio,
ajustes, som, impressão pelo navegador, modo offline e o entregador em tempo
real.

Falta, e **todo o resto depende da mesma coisa**: SLA com escalada e push ao
cliente, que exigem a fila (Redis + BullMQ + outbox) da trilha de plataforma da
Fase 0 — ainda não construída. Falta também o agente local de impressão
([ADR-0017](./docs/adr/ADR-0017-agente-de-impressao.md)) e o Storybook, que é
portão de saída da Fase 0.

A sessão ainda é um campo de token. `/auth/me` **já existe** na API e alimenta
identidade, permissões e escopo; o que falta é um fluxo de login próprio.
