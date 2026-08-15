# 20 — Cenários de falha e casos de borda

> PARTE 20 do briefing, que pede no mínimo 20 cenários. São **28**, agrupados por origem. Cada um traz a reação projetada, não uma intenção genérica.

---

## 1. Infraestrutura e conectividade

**1. A internet da loja cai — o Hub fica inalcançável e os pedidos continuam chegando.**
Detecção no servidor: zero sockets em `store:{id}:orders` durante o horário de funcionamento por mais de 3 min → evento `stores.connectivity.lost` → escada de escalonamento: WhatsApp/SMS ao celular do gerente, depois ao regional, depois `network:alerts` no painel do Corporate. E, configurável por loja, **auto-pausa da loja para novos pedidos de delivery após 10 min**, para o cliente não pedir num buraco negro. Os pedidos já feitos ficam em `pending`, o timer de SLA continua correndo, e eles aparecem no instante em que o Hub reconecta, via `/changes`.

**2. A camada de socket cai** (crash no servidor, falha do adapter, proxy derrubando WebSocket).
O cliente detecta por heartbeat perdido → degrada para polling de `/changes?since=cursor` a cada 10 s e mostra a faixa de "modo degradado". **Nenhuma funcionalidade é perdida, apenas latência** — é exatamente para isso que o endpoint de cursor existe. No servidor, falha de socket nunca bloqueia transação: a emissão é um job, pós-commit.

**3. O Redis cai inteiro.**
Degradação graciosa, com três impactos separados: o cache de permissão cai para consulta direta ao banco (mais lento, correto); o cache de menu idem; as filas param de aceitar job, o relay faz backoff e as linhas de outbox se acumulam (**sem perda**); os sockets continuam funcionando em processo único, já que o adapter só é necessário em múltiplas instâncias. **A API continua plenamente funcional para receber pedido**, que é a única coisa que realmente não pode parar. O `/readyz` reporta degradado mas **não falha** — derrubar todas as instâncias porque um cache caiu seria uma indisponibilidade autoinfligida.

**4. O pool de conexões do banco esgota.**
Pool `max: 20`, `acquire: 10000` — um timeout de aquisição levanta `UpstreamError` → `503` com `Retry-After`, não uma requisição pendurada. O `/readyz` falha e o balanceador para de rotear para aquela instância. Os workers usam um **pool separado e menor**, de modo que uma exportação de relatório jamais consiga matar de fome o caminho de requisição. `statement_timeout = 15s` no papel da aplicação e `30s` no do worker impedem que uma query desgovernada segure conexão indefinidamente. Alerta em 80% de utilização.

**5. Migration roda no meio do deploy, com o código antigo ainda no ar.**
Seguro por construção pela regra de expand/contract: toda migration é retrocompatível com a release anterior, então instâncias velhas e novas coexistem num rolling deploy. As migrations rodam como passo pré-deploy com `pg_advisory_lock`, para que duas instâncias não as executem concorrentemente. O `/readyz` reporta a contagem de migrations pendentes; se um deploy falhar pela metade, instâncias com pendências não recebem tráfego.

---

## 2. Eventos e processamento assíncrono

**6. O relay do outbox trava** (worker morto, Redis fora, mensagem venenosa).
**É a falha silenciosa mais perigosa do sistema:** tudo parece bem enquanto nada downstream acontece. Detecção: `idade da linha mais antiga não publicada > 60 s` é alerta de página, exposto no `/internal/status`. Por mensagem: após 10 tentativas a linha é estacionada (`next_attempt_at = now() + 1 dia`), para que uma mensagem venenosa não bloqueie a cabeça da fila, e linhas estacionadas geram alerta próprio. Com o Redis fora, o relay faz backoff e as linhas acumulam no Postgres — **nenhum dado é perdido**, só a entrega é adiada, e drena sozinho na recuperação.

**7. O provedor de push cai** (Expo, Comtele, WhatsApp).
Envios são jobs com backoff exponencial (5 tentativas em ~30 min) → DLQ. Cadeia de fallback por tipo de notificação, configurada no template: push → SMS → WhatsApp. Taxa de falha acima de 10% em 10 min aciona `network:alerts`. **Crucialmente, nada disso pode fazer um pedido falhar** — que é exatamente o defeito que o outbox remove do desenho atual de chamada inline.

**8. O provedor de geocoding cai.**
Nunca no caminho crítico: a criação de endereço tem sucesso com `lat/lng` nulos e enfileira um job de geocoding com retry. A taxa de entrega então cai para "zona pelo CEP declarado"; se nem isso estiver disponível, o pedido é aceito com a taxa padrão da loja e marcado `needs_fee_review` para o gerente. Um circuit breaker abre após 5 falhas consecutivas e curto-circuita por 60 s, para parar de queimar cota e latência.

**9. Uma exportação de relatório estoura o tempo.**
Nunca é síncrona. `POST /reports/exports` devolve `202` e um id; uma fila dedicada de concorrência 1, com timeout de 10 min, transmite o resultado para arquivo (paginado por cursor, **nunca um `findAll` sobre um ano de pedidos**) e sobe para o armazenamento de objetos; `reporting.export.ready` notifica com URL assinada de 24 h. Timeout → status `failed` com motivo e sugestão de estreitar o período.

---

## 3. Pedidos e concorrência

**10. Dois operadores aceitam o mesmo pedido.**
Lock otimista: a segunda escrita casa com zero linhas e recebe `409` com o estado atual **e o nome de quem venceu**. Os dois Hubs então recebem o `order.status_changed` autoritativo pelo socket e convergem. Na UI, quem perdeu vê um toast não bloqueante — nunca um modal de erro.

**11. O mesmo pedido é atualizado a partir de dois dispositivos do mesmo operador.**
Idêntico ao anterior: `If-Match: <version>` resolve. A resposta 409 traz o estado atual no corpo, para o Hub re-renderizar sem outra ida ao servidor.

**12. Pedido duplicado por duplo toque do cliente.**
`Idempotency-Key` em `POST /orders`, mais uma guarda leve: um pedido do mesmo usuário, mesma loja e mesmo hash de itens dentro de 90 s devolve o pedido existente com `{duplicate: true}` em vez de criar um segundo. **A guarda leve existe porque builds antigos do app não enviam o header e não podem ser retrofitados.** No Hub, a suspeita de duplicidade também é mostrada ao operador antes do aceite ([03 §3.11](./03-tres-aplicacoes.md)).

**13. A loja aceita um pedido com item que acabou de esgotar.**
`unit_catalog_items.available` é validado **na criação** e **revalidado no aceite**. Se mudou no intervalo, o aceite devolve `409 ITEMS_UNAVAILABLE` com as linhas ofensoras e oferece "aceitar sem o item" → cancelamento parcial, que recalcula os totais, emite `order.items_adjusted` e dispara estorno parcial pelo módulo de pagamentos.

**14. O cliente cancela enquanto a cozinha já está preparando.**
`preparing → cancelled` exige `orders:cancel` (staff); a janela de cancelamento pelo cliente fecha em `confirmed`. Um pedido do cliente depois disso vira **mensagem de chat + flag `cancellation_requested`** exibida no Hub, e um humano decide. Isso evita a perda clássica de "comida já feita, dinheiro devolvido".

**15. O SLA de aceite expira sem ninguém agir.**
O pedido **não some**. Vira `Expirado` no topo do rail com contador crescente; o cliente recebe um push único; aos +2 min escala ao gerente; aos +10 min há **auto-recusa** com reembolso integral e alerta ao Corporate ([09 §3.3](./09-pedidos.md)). Recusa automática imediata é rejeitada: destrói NPS e é irreversível.

**16. Desvio de relógio nos cronômetros de SLA.**
Todos os timestamps são `timestamptz` gerados pelo **`now()` do Postgres** — nunca pelo processo da API, nunca pelo navegador. A API devolve `etaAt` (absoluto), `slaSecondsRemaining` (relativo) e `serverTime` no heartbeat; o Hub calcula o offset uma vez e conta contra o tempo corrigido. **As decisões de violação de SLA são tomadas no servidor por job atrasado**, então um tablet com relógio errado pode exibir uma contagem errada, mas nunca disparar um escalonamento indevido.

---

## 4. Pagamentos

**17. O pagamento confirmou mas o app do cliente caiu antes de ver a resposta.**
O pedido existe e está pago independentemente do cliente. O webhook do provedor é a fonte da verdade; o pedido transiciona no `payment.captured`, e não num callback de cliente. Ao reabrir o app, `GET /orders?status=active` mostra. Se o **pedido** nunca chegou a ser criado (crash entre o intent e o pedido), o job de reconciliação horário encontra capturas órfãs e ou estorna automaticamente, ou levanta um item em `network:alerts`.

**18. O webhook é entregue duas vezes, ou fora de ordem.**
Duplicata: a chave primária de `payment_provider_events` rejeita a segunda e devolve `200 {duplicate: true}`. Fora de ordem: `applyProviderEvent` afirma uma **precedência de estado** (`pending < authorized < paid < refunded`) e ignora qualquer evento que andaria para trás, logando em `warn`.

**19. O webhook nunca chega.**
Um poller de 60 s faz `GET /v1/payments/{id}` para toda linha em `processing` criada nos últimos 40 min e aplica o mesmo handler. Webhooks se perdem — no Render, um redeploy durante a entrega descarta em silêncio. São ~20 linhas de código que eliminam uma classe inteira de falha.

**20. O processo morre no meio do processamento de um webhook.**
A linha fica travada em `processing`; o dreno reenfileira linhas nesse estado há mais de 5 min, incrementando `process_attempts`. O trabalho de negócio é idempotente, então o replay é seguro.

**21. Cancelamento acontecendo durante a captura.**
Captura e cancelamento tomam ambos a **linha do pedido** `FOR UPDATE`. Quem perder enxerga o estado já commitado do outro: se a captura venceu, o cancelamento vira estorno; se o cancelamento venceu, a captura é pulada e a autorização é anulada no PSP. **O lock da linha do pedido é o desempate.**

**22. O estorno falha no PSP.**
Linha `failed` em `payment_transactions`, retry com backoff em 5 tentativas, depois alerta de revisão manual. **O recrédito do cashback não fica refém do estorno do dinheiro** — recreditar imediatamente. É o correto: nunca fazer o cliente esperar um problema nosso de PSP para receber dinheiro que já lhe devemos.

**23. Chargeback.**
`payments.status = 'chargeback'`; `CLAWBACK` do cashback acumulado; se já gasto, `WRITE_OFF`; conta marcada como suspeita; congelamento se recorrente. Chargeback é custo de operação — **o ledger registra a perda para que ela seja mensurável**.

---

## 5. Cashback

**24. Cashback foi reservado e o pedido não foi criado.**
Estruturalmente impossível: **reserva e criação do pedido são a mesma transação**. Se o processo morrer entre a transação e a chamada ao PSP, o sweeper libera no TTL e cancela o pedido. Em toda ordenação de falha, o cashback do cliente volta.

**25. O mesmo cashback é usado em dois pedidos simultâneos.**
Três mecanismos independentes, cada um suficiente: `SELECT … FOR UPDATE` na conta serializa o cliente; o `CHECK` de banco `reserved_cents <= balance_cents` aborta a transação mesmo com bug de lógica; e o índice único parcial torna duas reservas abertas para o mesmo pedido **fisicamente impossíveis** ([10 §2.2](./10-cashback-ledger.md)).

**26. O sweeper dispara exatamente no instante em que o operador confirma.**
Pelo **INVARIANTE R2**, a transição de reserva é um update guardado, e zero linhas afetadas significa "alguém chegou antes" — que é **sucesso no-op, não erro**. É isso que torna seguro o sweeper correr contra o operador e contra o timer de 120 s do cliente.

**27. Deriva entre o saldo cacheado e a soma dos lançamentos.**
O job de reconciliação **nunca se autocorrige**: grava a corrida, **congela a conta** (bloqueando gasto, não acúmulo) e aciona alerta. Num ledger financeiro, deriva é sempre defeito de código; um job que se autocura esconderia o bug que a causou.

**28. Um pedido `on_delivery` que consumiu cashback é recusado na porta.**
O cashback já foi consumido. Tratado como cancelamento-após-consumo: o cashback é **recreditado como novo lote preservando o `expires_at` original**, e o dinheiro simplesmente não é cobrado. O risco fica registrado e mensurável no relatório de falha de entrega.

---

## 6. Operação de loja

**29. A impressora está offline quando um pedido é aceito.**
O chip do cabeçalho fica vermelho **antes** do primeiro pedido falhar (o agente faz heartbeat a cada 30 s). O job de impressão tem retry com backoff; depois de `failed_final`, o operador recebe a opção "Imprimir pelo navegador", que abre a comanda em CSS no diálogo do sistema. **Falha de impressão nunca bloqueia o fluxo do pedido.**

**30. A loja está marcada como fechada mas pedidos continuam chegando.**
Banner vermelho no Hub indicando erro de configuração de horário ou pausa, com as ações `Abrir a loja agora`, `Ver horários` e `Recusar os pedidos`. É um sintoma de configuração, e o desenho trata como tal em vez de simplesmente recusar em silêncio.

**31. O operador perde a conexão com ações já tomadas.**
Aceites e avanços de status feitos offline entram numa fila local em IndexedDB, com TTL por tipo de ação, e são reexecutados em sequência com `Idempotency-Key` e `If-Match`. Ao final, um **modal que precisa ser reconhecido** relata o que foi aplicado e o que conflitou: *"2 ações aplicadas, 1 não pôde ser aplicada: Pedido #1043 já havia sido cancelado pelo cliente."* **Nada some em silêncio.** Cancelamento e alteração de valores são **bloqueados** offline ([04 §6.6](./04-arquitetura-frontend.md)).
