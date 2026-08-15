# 00 — Sumário executivo

> PARTES 1 e 2 do briefing. Escrito para ser lido por quem decide, em dez minutos, sem abrir mais nenhum capítulo.

---

## 1. O problema, em três frases

A Matsuya tem um programa de cashback em produção e um módulo de delivery próprio funcionalmente pronto no app do cliente — mas **não tem nada por trás deles**: nenhum painel operacional em tempo real, nenhuma separação entre matriz e unidade, nenhum caminho para o cashback pagar um pedido de delivery, nenhuma auditoria e nenhum pagamento online. A API que sustenta tudo isso tem o segredo do JWT escrito no código, os arquivos `.env` de produção versionados no git e **nove endpoints de escrita completamente abertos** — incluindo um que cria cashback e outro que dispara push para toda a base. E a fórmula que calcula o saldo do cliente está errada de um jeito que **entrega dinheiro que ele não tem**, num vazamento que só cresce com a idade do programa.

Este documento especifica como sair daí sem parar a operação.

---

## 2. A proposta, em linguagem de CTO

Construímos **três experiências administrativas** — Corporate, Portal da Unidade e Order Hub — sobre **duas bases de código de front-end** e **um modular monolith** no back-end existente.

- **Order Hub** é a aplicação que gera valor primeiro: o painel de balcão em tempo real, com som, SLA, chat, impressão térmica e modo offline. É greenfield, não depende de nada legado, e prova a pilha inteira nas condições mais duras.
- **Corporate e Portal da Unidade** são o mesmo produto em dois níveis de escopo — cerca de 70% de sobreposição real. Viram um único artefato cujo comportamento é derivado das permissões e do escopo do usuário, com URL própria para cada público. Três experiências, uma base de código.
- **O back-end não é reescrito.** O roteador plano de 508 linhas é congelado e recebe cabeçalhos de descontinuação; tudo novo nasce em `/api/v1`, organizado em **11 contextos delimitados** dentro do mesmo repositório. Nenhum NestJS, nenhum microsserviço, nenhuma migração de banco arriscada por estética.
- **O admin web atual é absorvido por fases**, com regra de deletar-ao-migrar e data de aposentadoria fixada antes de a primeira linha ser escrita.

A única infraestrutura nova é o **Redis** — fila, cache de permissão, idempotência e, mais tarde, o adapter de WebSocket. Kafka, RabbitMQ, SQS, CQRS e event sourcing são rejeitados explicitamente, com justificativa registrada.

---

## 3. As sete decisões que importam

1. **Modular monolith, não microsserviços.** Um time de 1 a 3 pessoas, uma dúzia de lojas, e um pedido que precisa de consistência entre estoque, pagamento e carteira. Num monolito isso é **uma transação de banco**; distribuído, é uma saga com compensação em cada passo. As fronteiras de contexto existem para que a extração seja possível depois — não para pagá-la agora.

2. **O cashback vira um ledger de verdade.** Lançamentos imutáveis, lotes FIFO com expiração, consumo persistido, dinheiro em centavos inteiros. A fórmula atual compensa expiração em agregado e, por isso, **superestima o saldo do cliente e o passivo da empresa ao mesmo tempo**. Não é remendável: ela não tem como saber de qual lote um débito saiu.

3. **Reserva com TTL e varredura no servidor.** Hoje, um resgate abandonado deixa um débito pendente **para sempre**, porque o único timer existe no aplicativo do cliente. Se o app é morto, o saldo do cliente some em silêncio. A correção é entregável isoladamente, na primeira onda, sem tocar no delivery.

4. **O tempo real é uma otimização; a correção vem do cursor.** Todo evento carrega um número de sequência, e existe um endpoint que devolve tudo o que mudou desde um cursor. Isso significa que **o Order Hub nunca perde um pedido**, que duplicatas são inofensivas, e que o painel continua funcionando — a 10 segundos de latência — mesmo com o WebSocket inteiramente fora do ar.

5. **Autorização se impõe na camada de query, não no controller.** Hoje, dois controllers lembram de filtrar por unidade e o resto é global. No desenho novo, um repositório com escopo torna **impossível** escrever uma consulta sem contexto, e uma linha fora de escopo devolve 404 em vez de 403 — para que ninguém consiga descobrir pedidos de outra loja sondando códigos de status.

6. **O catálogo ganha um mestre.** Hoje o mesmo prato existe como doze linhas com doze preços e doze históricos; é por isso que existe um endpoint só para traduzir carrinho entre lojas. O modelo novo tem catálogo de rede com override por unidade, e a ausência de override significa herança total — o que torna abrir uma loja nova uma operação de um clique.

7. **A Fase 0 de segurança é um portão, não um item de backlog.** Treze correções, ordenadas por risco, cada uma com nota de compatibilidade. Não faz sentido publicar três painéis administrativos contra uma API cujo token qualquer pessoa consegue forjar.

---

## 4. O que muda para o negócio

| Hoje | Depois |
|---|---|
| Pedido de delivery chega e ninguém é avisado | Painel de balcão com som, SLA e escalonamento ao gerente |
| Cashback não paga nada no delivery | Cliente paga parte do pedido com o saldo — a promessa central do produto |
| Ninguém sabe qual é o passivo de cashback | Número diário, auditável, por período e por unidade |
| Um manager vê a rede inteira | Escopo por unidade, grupo ou região, imposto no banco |
| Produto novo é cadastrado doze vezes | Uma vez, publicado nas unidades escolhidas |
| Nenhum registro de quem alterou o quê | Auditoria na mesma transação da mudança, imutável |
| Margem financeira calculada no navegador | Agregação no servidor, com views materializadas |
| Pix é uma imagem estática mockada | Cobrança real, com webhook, poller e conciliação |

---

## 5. Sequência e prazos

Sete fases, com portão de saída explícito em cada uma. As fases 1 e 2 correm em paralelo.

| Fase | Conteúdo | Duração |
|---|---|---|
| **0** | Remediação de segurança + fundação de plataforma | ~6 semanas |
| **1** | Order Hub MVP, em duas unidades piloto | ~6 semanas |
| **2** | Ledger de cashback e pagamentos | ~10 semanas |
| **3** | Corporate leitura + RBAC completo | ~7 semanas |
| **4** | Fidelidade: absorção do admin legado | ~8 semanas |
| **5** | Catálogo mestre + Portal da Unidade | ~6 semanas |
| **6** | Analytics, otimização e aposentadoria do legado | ~4 semanas |

Estimativas para 2 a 3 pessoas de engenharia. Some cerca de 40% se for uma só. **Quando o prazo apertar, o corte sai das prioridades P2, depois das P1 — nunca das P0.**

---

## 6. Os cinco riscos que merecem atenção semanal

1. **Comprometimento já ocorrido.** Segredos versionados e JWT no código. É o único risco cujo dano pode já estar em curso.
2. **Relay de eventos travado.** Falha silenciosa em que tudo parece funcionar enquanto nada acontece. Tem métrica e alerta de página dedicados.
3. **Custo da migração do cashback.** O ajuste que preserva o saldo dos clientes tem um preço agregado que precisa ser calculado e aprovado **antes** do cutover.
4. **Som desativado no Order Hub.** Anula sozinho todo o valor da Fase 1 — por isso "silenciar tudo" não existe no produto.
5. **Capacidade do time.** É o que determina se este roadmap é um plano ou uma ficção.

---

## 7. O que precisa de decisão do negócio

Nenhuma bloqueia o início, mas cada uma tem prazo. As mais relevantes:

- Franqueados são terceiros com contrato, ou gerentes assalariados? *(antes da Fase 3)*
- O cashback pode pagar 100% de um pedido, ou há teto? *(antes da Fase 2)*
- Quem absorve a diferença quando um item é substituído por outro mais caro? *(antes da Fase 1)*
- Quantas vias de impressão, e quais impressoras existem hoje em cada loja? *(antes da Fase 1)*
- Existe exigência fiscal no delivery? *(antes do go-live comercial)*

A lista completa, com recomendação provisória para cada uma, está em [01 — Premissas e lacunas](./01-premissas-e-lacunas.md).

---

## 8. O princípio que guiou todas as decisões

> **A solução mais simples capaz de atender bem o cenário atual, sem impedir a evolução futura.**

Onde a resposta sofisticada foi rejeitada, o motivo está escrito: Kafka porque o outbox já dá replay por 14 dias; microsserviços porque a consistência custaria mais do que a escala vale; Prometheus e OpenTelemetry porque tracing distribuído num serviço único é um stack frame; partida dobrada completa porque não há plano de contas a manter. E onde a resposta simples **não** basta — lote FIFO, lock por conta, resync por cursor, auditoria transacional —, a complexidade foi paga por inteiro, porque ali ela compra correção, e não elegância.
