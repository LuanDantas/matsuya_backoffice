# 12 — API

> PARTE 12 do briefing. Toda superfície nova vive sob **`/api/v1`**. O roteador plano legado fica congelado e recebe headers `Deprecation`/`Sunset` ([06 §4](./06-arquitetura-backend.md)).

---

## 1. Convenções

| Aspecto | Regra |
|---|---|
| Envelope de sucesso | `{ "data": …, "meta": { "requestId", "page": { "limit", "cursor" } } }` |
| Envelope de erro | `{ "error": { "code", "message", "details": [], "requestId" } }` — `code` é uma constante estável, `message` é pt-BR para exibição |
| Paginação | Cursor (`?cursor=&limit=`) em tudo que cresce sem limite; offset só em listas notoriamente pequenas (unidades, papéis) |
| Autenticação | `Authorization: Bearer <accessToken>`. O backend também aceita o header cru sem `Bearer` durante a transição |
| Escopo | Sempre derivado do contexto do usuário; **nunca** aceito como parâmetro de confiança. `403 FORBIDDEN_SCOPE` distingue-se de `403 FORBIDDEN_PERMISSION` |
| Concorrência | `If-Match: <version>` nas transições de pedido; `409 ORDER_STATUS_CONFLICT` traz o estado atual no corpo |
| Idempotência | Header `Idempotency-Key` obrigatório em `POST /orders`, transições de pedido, `POST /payments/*` e `POST /wallet/adjust` |
| Validação | Schemas zod por rota; falha devolve `422` com `details[]` no formato `{ path, code, message }`, mapeável direto para `setError` do React Hook Form |
| Datas | ISO 8601 em UTC no fio; a formatação pt-BR é do cliente |
| Dinheiro | Inteiro em centavos nos campos `*_cents`; os campos legados em reais continuam sendo emitidos como número durante a transição ([10 §0](./10-cashback-ledger.md)) |

---

## 2. Catálogo por contexto

### Autenticação e sessão — `identity`

| Método | Caminho | Permissão |
|---|---|---|
| POST | `/auth/login` | pública |
| POST | `/auth/refresh` | refresh token |
| POST | `/auth/logout` | autenticado |
| GET | `/auth/me` | autenticado — devolve `permissions[]` e `scope` |
| POST | `/auth/mfa/enroll` · `/auth/mfa/verify` · `/auth/mfa/challenge` | autenticado |
| POST | `/auth/password/forgot` · `/password/reset` · `/password/change` | pública / autenticado |
| GET | `/auth/sessions` · DELETE `/auth/sessions/:id` | autenticado |
| POST | `/auth/device-tokens` | `devices:manage` — tokens de longa duração para Hub e agente de impressão |

### Usuários e papéis — `identity`

`GET/POST /users` · `GET/PATCH /users/:id` · `POST /users/:id/disable` · `GET/POST /users/:id/roles` · `DELETE /users/:id/roles/:grantId` · `GET /roles` · `POST/PATCH /roles/:id` · `GET/PUT /roles/:id/permissions` · `GET /permissions`

Permissões `users:*` e `roles:*` — **todas perigosas, exigem reautenticação com MFA**.

### Lojas — `stores`

`GET/POST /stores` · `GET/PATCH /stores/:id` · `GET/PUT /stores/:id/settings` · `GET/PUT /stores/:id/hours` · `POST /stores/:id/pause` · `POST /stores/:id/resume` · `GET /stores/:id/status` · `GET/POST /store-groups` · `PUT /store-groups/:id/units`

### Catálogo — `catalog`

**Mestre:** `GET/POST /catalog/categories` · `GET/POST /catalog/items` · `GET/PATCH/DELETE /catalog/items/:id` · `POST /catalog/items/:id/option-groups` · `PATCH /catalog/option-groups/:id` · `POST /catalog/items/:id/rollout` (listar em N unidades) · `POST /catalog/publish`

**Por unidade:** `GET /stores/:storeId/catalog` · `PUT /stores/:storeId/catalog/items/:catalogItemId` · `POST /stores/:storeId/catalog/items/:catalogItemId/unavailable` · `POST /stores/:storeId/catalog/reorder` · `GET /stores/:storeId/menu` (formato público, cacheado)

**Carrinho:** `POST /carts/validate` — substitui `cart/remap` ([08 §2.5](./08-banco-de-dados.md))

### Pedidos — `orders`

`GET /orders` · `GET /stores/:storeId/orders` · **`GET /stores/:storeId/orders/changes`** · `GET /orders/:id` · `POST /orders` · `POST /orders/:id/accept` · `/reject` · `/preparing` · `/ready` · `/dispatch` · `/deliver` · `/cancel` · `/items/cancel` · `/delivery-failed` · `PATCH /orders/:id/eta` · `POST /orders/:id/adjust` · `GET /orders/:id/events` · `POST /orders/:id/print`

### Chat — `orders/chat`

`GET /orders/:id/chat` · `POST /orders/:id/chat` · `POST /orders/:id/chat/read` · `GET /stores/:storeId/chat/threads` · `POST /chat/messages/:id/hide` (`chat:moderate`)

### Carteira — `wallet`

`GET /customers/:id/wallet` · `GET /customers/:id/wallet/statement` · `POST /customers/:id/wallet/adjust` (perigoso) · `POST /wallet/reserve` · `POST /wallet/reserve/:id/release` · `GET /stores/:storeId/wallet/summary` · `GET /wallet/reconciliation?date=`

### Pagamentos — `payments`

`POST /orders/:id/payment-intents` · `GET /payments/:id` · `POST /payments/:id/capture` · `POST /payments/:id/refund` · **`POST /payments/webhooks/:provider`** (pública, assinatura verificada) · `GET /payments/reconciliation?date=`

### Promoções e cupons — `promotions`

`GET/POST /promotions` · `GET/PATCH/DELETE /promotions/:id` · `PUT /promotions/:id/units` · `GET/POST /coupons` · `POST /coupons/:code/validate` · `GET /coupons/:code/redemptions`

### Fidelidade — `loyalty`

`GET/POST /plans` · `GET/PATCH /plans/:id` · `GET/POST /benefits` · `GET /subscribers` · `GET /subscribers/:id`

### Clientes — `customers`

`GET /customers` · `GET /customers/:id` (360) · `PATCH /customers/:id` · `GET /customers/:id/orders` · `GET/POST /customers/:id/notes` · `POST /customers/:id/anonymize` (LGPD) · `GET /customers/:id/export` (LGPD)

### Entrega — `delivery`

`GET/POST /stores/:storeId/zones` · `PATCH/DELETE /zones/:id` · `POST /shipping/quote` · `GET/POST /couriers` · `POST /orders/:id/dispatch` · `GET /stores/:storeId/couriers/availability`

### Relatórios — `reporting`

`GET /reports/sales` · `/reports/orders` · `/reports/sla` · `/reports/cashback` · `/reports/catalog-performance` · `/reports/cancellations` · `POST /reports/exports` · `GET /reports/exports/:id` · `GET /reports/exports/:id/download`

### Auditoria e plataforma

`GET /audit` · `GET /audit/entities/:type/:id` · `GET /healthz` · `GET /readyz` · `GET /internal/status` · `GET /feature-flags` · `GET /config/flags`

---

## 3. Os seis endpoints que definem o sistema

### 3.1 `POST /api/v1/auth/login`

```jsonc
// requisição
{ "email": "gerente@matsuya.com.br", "password": "…", "deviceName": "Hub Vila Olímpia" }

// 200
{ "data": {
    "accessToken": "eyJ…",            // 15 min
    "refreshToken": "rt_…",           // 30 d, rotativo; cookie httpOnly para as SPAs
    "expiresIn": 900,
    "user": { "id": 42, "firstName": "Ana", "lastName": "Souza", "email": "…", "role": "manager" },
    "permissions": ["orders:read","orders:accept","orders:reject","catalog:availability:write","chat:write"],
    "scope": { "network": false, "unitIds": [7] },
    "stores": [ { "id": 7, "name": "Vila Olímpia" } ],
    "mfaRequired": false
} }

// 401 { "error": { "code": "INVALID_CREDENTIALS", "message": "E-mail ou senha inválidos." } }
// 200 + { "mfaRequired": true, "mfaToken": "…" } quando a conta tem MFA
```

Access token curto + refresh rotativo valem **somente para as aplicações administrativas**. O app mobile mantém `POST /auth/login` com token de 1 dia e sem endpoint de refresh — introduzir refresh ali sem mudar o cliente quebraria o contrato "401 = logout definitivo" que o app implementa hoje.

### 3.2 `GET /api/v1/stores/:storeId/orders` — o snapshot de boot do Hub

```
?status=active|pending|in_progress|finished &channel=delivery|pickup &since= &limit=50 &cursor=
```

```jsonc
{ "data": {
    "orders": [ {
      "id": 8871, "code": "M-8871", "version": 3, "status": "preparing",
      "deliveryType": "delivery",
      "placedAt": "2026-08-14T19:02:11Z", "acceptedAt": "2026-08-14T19:03:40Z",
      "etaAt": "2026-08-14T19:45:00Z", "slaSecondsRemaining": 412,
      "customer": { "id": 991, "name": "Ana S.", "phone": "+5511…", "ordersCount": 12 },
      "totals": { "subtotal": 118.90, "deliveryFee": 10.00, "discount": 0,
                  "cashbackUsed": 0, "total": 128.90, "dueOnDelivery": 0 },
      "payment": { "method": "pix", "status": "paid" },
      "itemsCount": 4,
      "address": { "street": "…", "number": "…", "district": "…", "distanceKm": 2.4 },
      "flags": ["first_order", "has_unread_chat", "has_notes"]
    } ],
    "cursor": 90412,
    "counts": { "pending": 2, "confirmed": 1, "preparing": 4, "out_for_delivery": 3 },
    "page": { "nextCursor": null }
} }
```

`403 FORBIDDEN_SCOPE` se `storeId ∉ ctx.scope.unitIds`. **O `cursor` é devolvido na própria listagem**, precisamente para que o Hub possa assinar o socket sem corrida entre o snapshot e o primeiro evento.

### 3.3 `GET /api/v1/stores/:storeId/orders/changes?since=<seq>&limit=200`

O endpoint de re-sincronização. Especificado em [14 §5](./14-websockets.md). É o que garante que **o Hub nunca perde um pedido**, e o que permite operar sem socket algum, a 10 s de latência.

### 3.4 `POST /api/v1/orders/:id/accept`

```jsonc
// headers: Idempotency-Key: <uuid>, If-Match: 3
{ "etaMinutes": 35, "note": "" }

// 200
{ "data": { "order": { "id": 8871, "status": "confirmed", "version": 4,
                       "acceptedAt": "…", "etaAt": "…" },
            "seq": 90413 } }

// 409
{ "error": { "code": "ORDER_STATUS_CONFLICT",
             "message": "Este pedido já foi aceito por Camila D.",
             "details": { "currentStatus": "confirmed", "currentVersion": 4,
                          "actorLabel": "Camila D." },
             "requestId": "…" } }
```

O `409` traz o estado atual no corpo justamente para o Hub re-renderizar sem outra ida ao servidor — o operador vê o card corrigir-se sozinho, com um toast não bloqueante.

### 3.5 `POST /api/v1/orders/:id/cancel`

```jsonc
// headers: Idempotency-Key: <uuid>
{ "reasonCode": "CAN_ITEM_INDISPONIVEL", "reasonNote": "", "notifyCustomer": true }

// 200 — a resposta descreve TODAS as consequências, e é o que a UI exibe
{ "data": {
    "order": { "id": 8871, "status": "cancelled", "version": 5 },
    "consequences": {
      "refund": { "totalCents": 13000, "cardCents": 10000, "pixCents": 0,
                  "etaBusinessDays": 2, "paymentRefundId": "rf_…" },
      "cashback": { "releasedCents": 3000, "lotId": 4471,
                    "lotExpiresAt": "2027-01-12T00:00:00Z",
                    "earnedCancelledCents": 260 },
      "coupon": { "code": "BEMVINDO10", "restored": true }
    }
} }
```

Essa forma de resposta existe porque a UI **precisa** mostrar as consequências antes e depois de confirmar ([03 §3.8](./03-tres-aplicacoes.md)), e essa informação não pode ser recalculada no cliente sem duplicar a regra de negócio.

### 3.6 `POST /api/v1/payments/webhooks/:provider`

Pública e verificada por assinatura. Três regras não negociáveis:

1. `express.raw({ type: 'application/json' })` é montado nesta rota **antes** do `express.json()` — a assinatura é verificada sobre o corpo cru. Inverter a ordem é um bug silencioso e comum.
2. Deduplicação por `INSERT` em `payment_provider_events (provider, provider_event_id)`; duplicata devolve **`200 { ok: true, duplicate: true }`**. Qualquer não-2xx faz o provedor reenviar para sempre.
3. Reordenação é tratada por precedência de estado, não por ordem de chegada: `applyProviderEvent` recusa mover `paid → pending`.

---

## 4. Códigos de erro estáveis

| Código | HTTP | Significado |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | E-mail ou senha inválidos |
| `MFA_REQUIRED` | 401 | Precisa completar o desafio de MFA |
| `TOKEN_EXPIRED` | 401 | Access token expirado — use o refresh |
| `FORBIDDEN_PERMISSION` | 403 | O usuário não tem a chave de permissão |
| `FORBIDDEN_SCOPE` | 403 | Tem a permissão, mas não nesta unidade |
| `NOT_FOUND` | 404 | Inexistente **ou fora do escopo** (deliberadamente indistinguível) |
| `ORDER_STATUS_CONFLICT` | 409 | Transição inválida ou versão desatualizada |
| `ORDER_ALREADY_TERMINAL` | 409 | Pedido já em estado terminal |
| `REQUEST_IN_PROGRESS` | 409 | Mesma `Idempotency-Key` ainda em execução |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Mesma chave com corpo diferente — bug de cliente |
| `VALIDATION_ERROR` | 422 | Falha de schema; ver `details[]` |
| `CATALOG_FIELD_LOCKED` | 422 | Campo travado pela matriz |
| `PRICE_OUT_OF_BAND` | 422 | Override fora da faixa permitida |
| `INSUFFICIENT_BALANCE` | 422 | Saldo de cashback insuficiente |
| `HOLD_EXPIRED` | 409 | A reserva de cashback expirou |
| `STORE_CLOSED` | 422 | Loja fechada ou pausada |
| `OUT_OF_DELIVERY_RANGE` | 422 | Endereço fora da área |
| `BELOW_MINIMUM_ORDER` | 422 | Abaixo do pedido mínimo da zona |
| `RATE_LIMITED` | 429 | Limite de requisições |
| `UPSTREAM_ERROR` | 502 | Provedor externo indisponível |

---

## 5. Especificação viva

O repositório já introspecta o roteador Express e monta uma spec OpenAPI (`src/utils/apiDocs.ts` + `routeDefinitions.ts`), mas hoje ela emite `schema: { type: 'object', example: … }` — **exemplos, não JSON Schema** —, e todo query param é `string`. Por isso o cliente tipado do front-end é escrito à mão hoje ([04 §5.9](./04-arquitetura-frontend.md)).

O plano: as rotas de `/api/v1` declaram schemas zod para entrada e saída; um conversor (`zod-to-json-schema`) alimenta `apiDocs.ts`; a partir daí a spec passa a ter schema real, e o front-end pode gerar tipos com `openapi-typescript` mantendo o mesmo transporte. Até lá, um job noturno de CI compara o conjunto método+caminho da spec viva com `packages/contracts/endpoints.ts` e abre issue quando divergem.
