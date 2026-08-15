# 25 — Evoluções futuras

> PARTE 25 do briefing. Nada aqui é implementado agora. O compromisso é outro e é o que importa: **para cada item, mostrar qual decisão da arquitetura atual mantém a porta aberta** — e, quando existir, qual é o ponto de extensão exato.

---

## 1. Fidelidade e relacionamento

| Evolução | O que já sustenta | Ponto de extensão |
|---|---|---|
| **Clube de assinatura** (mensalidade com benefícios) | O contexto `loyalty` é separado de `wallet`; assinatura já tem ciclo próprio | Nova tabela de assinatura + cobrança recorrente no `payments`; o ledger não muda |
| **CRM e segmentação** | `customers` possui tags, notas e consentimentos; `mv_customer_rollup` traz LTV, frequência e ticket | Consumidor dos eventos de domínio para materializar segmentos |
| **Cupons personalizados por cliente** | `promotions` já reserva cupom de uso único; `coupon_redemptions` registra o resgate | Coluna de público-alvo na promoção + emissão em lote por segmento |
| **Promoções inteligentes** (desconto calculado por elasticidade) | Toda promoção já é declarativa e resolvida numa função de preço | O `priceResolver` é o ponto onde um motor entra sem tocar em pedidos |
| **Gamificação** (selos, desafios, streaks) | O ledger tem tipo `ADJUSTMENT` e metadados; `wallet_lots` tem `source` e `campaign_id` | Novo `source` de lote; nenhuma mudança estrutural |
| **Níveis dinâmicos** (rebaixamento por inatividade) | `matclub_subscribers` já é recalculado por evento | Job periódico consumindo `orders.order.delivered` |

## 2. Operação e cozinha

| Evolução | O que já sustenta | Ponto de extensão |
|---|---|---|
| **KDS — Kitchen Display System dedicado** | O Order Hub já é PWA com rooms por unidade e resync por cursor; a máquina de estados já tem `ready` | Uma segunda visão sobre as mesmas rooms, filtrando por estação de preparo; exigiria `order_items.station` |
| **Previsão de tempo de preparo** | `order_status_events` grava carimbos de todas as transições; `mv_order_sla_daily` já agrega p50/p95 | Modelo alimentado pelo histórico; o ETA já é um campo escrito, não calculado no cliente |
| **Previsão de demanda** | `mv_sales_daily` por unidade, dia, canal e meio de pagamento | Consumidor de leitura; nada de escrita muda |
| **Capacidade dinâmica** (pausar sozinho quando a fila atrasa) | O auto-aceite já se desliga quando 3 pedidos atrasam; `store_pauses` já existe | Job avaliando SLA de preparo e disparando `stores.store.paused` |
| **Fechamento de caixa integrado** | Pagamento na entrega já é conciliado por relatório de turno | Integração com maquininha, se houver |

## 3. Logística

| Evolução | O que já sustenta | Ponto de extensão |
|---|---|---|
| **App do entregador** | `orders.courier_id` já existe; o papel `courier` estava previsto; `order_dispatches` está modelado | App próprio ou PWA sobre `/ops` com escopo de entregador |
| **Rastreamento em mapa ao vivo** | O endpoint de tracking já devolve `courierLocation` (hoje nulo, como placeholder explícito) | Room `order:{id}` já existe; falta o produtor de posição |
| **Roteirização e agrupamento de entregas** | `order_dispatches` permite N pedidos por despacho; `addresses` tem lat/lng | Serviço de otimização consumindo despachos abertos |
| **Frota terceirizada** (integração de praça) | O contexto `delivery` isola a logística; a UI de despacho já prevê a opção "entregador da praça" | Adaptador por provedor atrás da mesma interface |
| **Confirmação de entrega por código** | Hoje o código de 4 dígitos é gerado **no cliente** e nunca chega ao servidor — falha conhecida | Gerar no servidor no `ready` e validar no `deliver` |

## 4. Inteligência e dados

| Evolução | O que já sustenta | Ponto de extensão |
|---|---|---|
| **Recomendação de produtos** | `order_items` com snapshot e `catalog_item_id` dão a matriz cliente × item | Consumidor de leitura |
| **Antifraude por modelo** | A coluna `suspicious` já existe; o ledger registra velocidade, unidade e ator de cada movimento; `qrcode_uses` é trilha antirreplay | Scorer consumindo `wallet.entry.created` e `orders.order.placed` |
| **Atendimento por IA no chat** | O chat já é imutável, auditado e com eventos de sistema no mesmo fio | Um participante a mais na thread, com `actor_type` próprio |
| **Analytics de funil** | Eventos de domínio já existem no backend | Falta o lado do cliente — ver §6 |
| **Data warehouse** | O outbox retém 14 dias e é replay-friendly; as views materializadas isolam leitura | Sink consumindo o outbox; nada precisa mudar no caminho de escrita |

## 5. Escala e estrutura

| Evolução | O que já sustenta | Ponto de extensão |
|---|---|---|
| **Múltiplas marcas** | `store_groups` existe desde o dia 1; catálogo mestre é por rede | Coluna `brand_id` em `unity` e em `catalog_items`, e um nível de escopo a mais |
| **Franquia com isolamento contratual** | Escopo multivalorado + RLS previsto na Fase 3 | Ativar RLS e emitir credencial de banco separada, se exigido |
| **Marketplace com marcas de terceiros** | **Mudança estrutural** — exigiria tenancy real, split de pagamento e onboarding de lojista | Ponto de ruptura consciente: está fora do desenho atual |
| **Múltiplas cidades e fusos** | Todos os timestamps são `timestamptz` gerados pelo Postgres; campanhas já têm `timezone` | Nenhum |
| **Segunda instância de API** | Workers já emitem **através** do adapter, não por referência local ao `io` | Instalar `@socket.io/redis-adapter`; é a única mudança de código |
| **Réplica de leitura** | O contexto `reporting` já é somente leitura e isolado | Apontar o pool de relatório para a réplica |

## 6. Eventos de analytics a instrumentar

O backend já produz eventos de domínio; **o que falta é o lado do cliente**. Instrumentar estes desde a Fase 1 do app, porque histórico não se recupera depois:

```
delivery_opened · menu_viewed · category_viewed · product_viewed
product_added · product_removed · cart_created · cart_abandoned
checkout_started · address_selected · unit_switched
coupon_applied · coupon_rejected · cashback_applied
payment_started · payment_failed · order_created
order_tracked · order_delivered · order_cancelled · review_submitted
```

| Análise | Como esses eventos a produzem |
|---|---|
| **Funil** | `delivery_opened → menu_viewed → product_added → checkout_started → order_created` |
| **Conversão** | `order_created / delivery_opened`, segmentado por unidade, horário e canal |
| **Abandono** | `cart_created` sem `order_created` em 24 h; onde o funil quebra e por quê |
| **Retenção** | Coorte por mês de primeiro pedido, com recompra em 30/60/90 dias |
| **LTV** | `mv_customer_rollup` cruzado com o custo de cashback do cliente |
| **Frequência** | Intervalo entre pedidos, com alerta de risco de churn |
| **Impacto do cashback** | Comparação de conversão e ticket entre pedidos com e sem `cashback_applied` |

## 7. Integrações

| Integração | Situação | Observação |
|---|---|---|
| **ERP** | Fora de escopo | O contexto `reporting` é o ponto natural de saída; o outbox é o de entrada |
| **PDV / POS de loja** | Convive hoje, sem integração | **O caminho de escrita do POS em `points` precisa ser confirmado antes da migração do ledger** ([24](./24-riscos.md), T2) |
| **Fiscal (NFC-e)** | Fora de escopo | Se existir exigência, é um contexto novo, e ele muda o ciclo do pedido |
| **WhatsApp para o cliente** | Provedor já configurado | Falta o template e o consentimento; o canal já está na matriz de notificações |
| **Segundo PSP** | Não previsto | `payments` já isola o provedor atrás de uma interface e de `provider_*` nas tabelas |

---

## O que a arquitetura atual **inviabiliza** (e é bom saber)

Honestidade vale mais aqui do que otimismo:

1. **Marketplace com marcas de terceiros.** Exigiria tenancy real e split de pagamento. Não é uma extensão — é outro produto.
2. **Escala de milhões de pedidos por dia.** O desenho é para dezenas de lojas. Chegar a milhares exigiria separar leitura de escrita, particionar pedidos e provavelmente extrair `payments` e `wallet`. As fronteiras de contexto existem justamente para tornar essa extração possível — mas ela seria um projeto, não um ajuste.
3. **Consistência forte entre serviços distribuídos.** Todo o desenho de consistência depende de **um único PostgreSQL**. Distribuir os dados converte cada transação de hoje numa saga com compensação. É o preço que estamos deliberadamente **não** pagando agora.
