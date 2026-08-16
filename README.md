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
| `api-client` | pedidos: quadro, mudanças, transições |
| `realtime` | sincronizador de cursor — 12 testes |
| `apps/hub` | quadro funcional; sessão provisória |
| `apps/console` | não iniciado |
| `ui`, `queries`, `auth`, `printing`, `observability` | não iniciados |

O Hub ainda não tem: som, impressão, modo offline, chat, e as demais telas do
inventário de [16](./docs/16-telas.md). A sessão é um campo de token, porque o
módulo de identidade da API ainda não expõe `/auth/me`.
