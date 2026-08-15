# 14 — Tempo real (WebSockets)

> PARTE 14 e seção 15 do briefing. O Order Hub depende inteiramente disto. A decisão mais importante deste capítulo **não é o socket** — é o protocolo de re-sincronização por cursor que torna o socket dispensável para a correção.

---

## 1. Topologia

Socket.IO v4 anexado ao **mesmo** `http.Server` do Express (`src/platform/realtime/io.ts`, ligado em `src/server.ts`). Um processo, sem serviço de socket separado. O Order Hub de uma dúzia de lojas são, no pico, algumas centenas de sockets concorrentes — um serviço à parte seria puro custo operacional.

## 2. Namespaces e rooms

| Namespace | Público |
|---|---|
| `/ops` | Order Hub, Store Manager e Corporate (staff autenticado) |
| `/customer` | Rastreamento de pedido no app (Fase 4, não no dia 1) |

| Room | Membros | Eventos |
|---|---|---|
| `store:{unityId}:orders` | quem tem `orders:read` com escopo naquela unidade | `order.placed`, `order.status_changed`, `order.items_adjusted`, `order.eta_changed` |
| `store:{unityId}:chat` | `chat:read` naquela unidade | `chat.message_posted`, `chat.typing` |
| `store:{unityId}:catalog` | `catalog:read` naquela unidade | `catalog.unit_item.changed` |
| `store:{unityId}:print` | agente de impressão da loja (token de dispositivo) | `print.job_created` |
| `order:{orderId}` | staff visualizando o detalhe; depois, o cliente | atualizações finas, presença ("Ana está vendo") |
| `network:alerts` | quem tem escopo `network` | loja offline, SLA estourado, provedor de pagamento fora |
| `user:{userId}` | os sockets do próprio usuário | `session.revoked`, `permissions.changed` |

## 3. Handshake e autorização de room no servidor

```ts
io.of('/ops').use(async (socket, next) => {
  const token = socket.handshake.auth?.token;   // nunca em query string: ela cai no log de acesso
  const ctx = await buildContextFromToken(token); // mesmo resolvedor do HTTP; lança em token inválido
  if (!ctx.actor) return next(new Error('UNAUTHENTICATED'));
  socket.data.ctx = ctx;
  socket.join(`user:${ctx.actor.userId}`);
  next();
});
```

**Clientes *pedem* rooms; o servidor *concede*.** Um cliente nunca entra numa room emitindo o nome dela:

```ts
socket.on('subscribe', async ({ storeId, channels }, ack) => {
  const ctx = socket.data.ctx;
  if (!ctx.scope.network && !ctx.scope.unitIds.includes(storeId))
    return ack({ error: 'FORBIDDEN_SCOPE' });
  if (channels.includes('orders') && !ctx.permissions.has('orders:read'))
    return ack({ error: 'FORBIDDEN_PERMISSION' });
  channels.forEach(c => socket.join(`store:${storeId}:${c}`));
  ack({ ok: true, cursor: await orderRepo.currentSeq(storeId) });   // ← o cursor é entregue no subscribe
});
```

**Reautorização:** `identity.user.role_granted|revoked|session_revoked` → emite para `user:{id}` → o servidor força `socket.disconnect(true)`; o cliente reconecta e re-deriva as rooms. Uma mudança de permissão, portanto, tem efeito nos sockets em **menos de um segundo** — o que um JWT sozinho nunca consegue garantir.

## 4. Heartbeat

`pingInterval: 20000, pingTimeout: 20000` nativos do Socket.IO. Por cima disso, um **heartbeat de aplicação a cada 15 s**: o cliente envia `ops:heartbeat {storeId, cursor}` e o servidor responde `{serverCursor, serverTime}`.

Esse heartbeat faz três trabalhos de uma vez:

1. **Detecta conexão silenciosamente morta** — um proxy segurando uma sessão TCP zumbi, ou um tablet num AP de Wi-Fi morto, mantém `socket.connected === true` indefinidamente.
2. **Detecta divergência de cursor** — `serverCursor > cursor` significa que eventos foram perdidos, mesmo sem nenhuma desconexão aparente.
3. **Corrige desvio de relógio** — os cronômetros de SLA do Hub são calculados contra `serverTime`, e não contra o relógio do tablet, que pode estar minutos errado.

## 5. Re-sincronização — o protocolo crítico

**Sockets são uma otimização; a correção vem do cursor.** O Hub tem de conseguir reconstruir o estado exato só com HTTP.

```sql
CREATE TABLE store_change_log (
  seq         bigserial PRIMARY KEY,     -- cursor monotônico global
  unity_id    int  NOT NULL,
  entity_type text NOT NULL,             -- 'order' | 'chat_message' | 'catalog_item'
  entity_id   bigint NOT NULL,
  op          text NOT NULL,             -- 'created' | 'updated' | 'deleted'
  version     int  NOT NULL,             -- versão da entidade após a mudança
  summary     jsonb NOT NULL,            -- suficiente para renderizar a linha sem segunda consulta
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scl_unit_seq ON store_change_log (unity_id, seq);
```

Escrito **dentro da mesma transação** de toda mutação de pedido, chat ou catálogo. Retenção de 7 dias — um Hub offline por mais que isso faz recarga completa.

É uma tabela separada, e não a reutilização de `order_status_events.id`, por dois motivos: o Hub também precisa re-sincronizar chat e catálogo, e as linhas de outbox são purgadas.

```
GET /api/v1/stores/:storeId/orders/changes?since=<seq>&limit=200
→ 200 {
    "data": {
      "changes": [
        { "seq": 90412, "entityType": "order", "entityId": 8871, "op": "updated",
          "version": 3,
          "summary": { "status": "preparing", "total": 128.90, "customer": "Ana S." } }
      ],
      "cursor": 90412,
      "hasMore": false,
      "snapshotRequired": false    // true quando `since` é anterior à retenção ou desconhecido
    }
  }
```

### 5.1 Algoritmo do cliente

```
no boot          : GET /stores/:id/orders?status=active  → snapshot + cursor; depois socket.subscribe
em evento socket : se (evt.seq === cursor + 1)  aplica, cursor = evt.seq
                   senão se (evt.seq <= cursor) ignora (duplicata)
                   senão                        GAP → chama /changes?since=cursor, depois aplica
ao reconectar    : GET /changes?since=cursor (repete enquanto hasMore)
                   se snapshotRequired → recarga completa
no heartbeat     : serverCursor > cursor → mesmo caminho de gap
socket fora >30s : degrada para polling de /changes?since=cursor a cada 10 s
                   e exibe a faixa "modo degradado"
```

Três propriedades importam:

- **O Hub nunca perde um pedido** — a detecção de lacuna é por número de sequência, não por confiança na entrega.
- **Duplicatas são inofensivas** — comparação de `seq`.
- **O socket pode estar inteiramente ausente** e o Hub continua funcionando com latência de 10 s.

É isso que torna a camada de socket segura de operar.

## 6. Envelope de evento

Todo evento emitido para `/ops` carrega o mesmo envelope, e o `seq` é obrigatório:

```jsonc
{
  "type": "order.status_changed",
  "v": 1,
  "seq": 90413,                       // monotônico por unidade — base da detecção de lacuna
  "unityId": 7,
  "occurredAt": "2026-08-14T19:12:03.441Z",
  "serverTime": "2026-08-14T19:12:03.502Z",
  "actor": { "userId": 42, "label": "João S." },
  "data": {
    "orderId": 8871, "version": 4,
    "from": "confirmed", "to": "preparing",
    "summary": { "status": "preparing", "total": 128.90, "customer": "Ana S." }
  }
}
```

`summary` existe para que o cliente escreva direto no cache do TanStack Query sem uma segunda requisição ([04 §5.6](./04-arquitetura-frontend.md)).

## 7. Escalar depois

Um processo hoje. Quando entrar uma segunda instância de API: instalar `@socket.io/redis-adapter` (`io.adapter(createAdapter(pubClient, subClient))`) — **essa é a única mudança de código**, porque os workers já emitem *através* do adapter, e não por uma referência local ao `io`.

A partir daí, sticky sessions passam a ser necessárias no load balancer — ou usa-se `transports: ['websocket']` apenas, pulando o upgrade por long-polling HTTP que exige stickiness.

Acima de ~10 mil sockets concorrentes — número que este negócio não vai atingir — separa-se o processo de socket e os workers passam a publicar direto no Redis.

## 8. Limites deliberados

| Limite | Motivo |
|---|---|
| Telas ao vivo do Corporate assinam no máximo **8 unidades simultâneas** | Sem esse teto, o dashboard de um diretor multiplica o fan-out do backend pelo número de unidades — exatamente o que inviabiliza a migração para o adapter Redis depois |
| Store Manager só assina `orders` **enquanto uma tela ao vivo está montada** | O resto do tempo assina só `unit:{id}:ops`, de baixa frequência |
| O Hub **nunca** desconecta por aba oculta | O Console desconecta após 30 min oculto |
| `/customer` fica para a Fase 4 | O app hoje faz polling de 15 s e isso é suficiente; migrar o app é trabalho que não bloqueia o Order Hub |
