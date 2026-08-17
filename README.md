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
| `api-client` | sessão, pedidos, painel, alertas, operação da loja, entrega, impressão |
| `realtime` | sincronizador de cursor — 12 testes |
| `ui` | design system: ~15 componentes, tokens, verificador de contraste |
| `printing` | modelo da comanda + caminho pelo navegador (o ESC/POS mudou para o agente) |
| `utils`, `config` | geo e configuração compartilhada |
| `apps/hub` | telas completas; login por e-mail e senha |
| `apps/agente-de-impressao` | agente local da loja: ESC/POS, fila própria, socket e heartbeat — 36 testes |
| `apps/console` | **não iniciado** — `src/` vazio |
| `queries`, `auth`, `observability` | **não iniciados** — diretórios vazios |

O Hub tem quadro, drawers, chat, exceções, conversas, rota com mapa, cardápio,
ajustes, som, impressão, modo offline, o entregador em tempo real, o painel de
agentes de impressão e o login por e-mail e senha.

A trilha de plataforma da Fase 0 **foi construída**: Redis, BullMQ, outbox e
relay, com os três consumidores que faltavam — SLA com escalada e auto-recusa,
push de status ao cliente e comanda para o agente da loja. O agente local de
impressão ([ADR-0017](./docs/adr/ADR-0017-agente-de-impressao.md)) existe em
`apps/agente-de-impressao`; falta empacotá-lo por sistema operacional.

Falta o **Storybook**, que é portão de saída da Fase 0, e os pacotes `queries`,
`auth` e `observability` seguem vazios.

## Entrar em desenvolvimento

O login é por e-mail e senha — não há mais campo de token nem atalho de admin.
O seeder cria `admin@matsuya.com.br` / `admin123`.

Para testar como **atendente**, e não como administrador da rede, é preciso
conceder o papel à mão: o seeder de RBAC mapeia só `admin` e `manager` do enum
legado, e ninguém recebe `store_operator` automaticamente. Sem isso a pessoa
entra, mas chega ao quadro com zero permissões.

```sql
INSERT INTO user_roles (user_id, role_id, scope_kind, scope_id, created_at, updated_at)
SELECT :userId, r.id, 'unit', :unityId, now(), now()
  FROM roles r WHERE r.key = 'store_operator';
```
