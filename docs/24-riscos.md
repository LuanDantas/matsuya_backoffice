# 24 — Riscos

> PARTE 24 do briefing. Riscos técnicos, financeiros, operacionais, de segurança, de performance, de UX e de produto. Cada um com probabilidade, impacto, mitigação projetada e **sinal de alerta antecipado** — um risco sem sinal de alerta é um risco que só se descobre tarde demais.

Escala: **A** alto · **M** médio · **B** baixo.

---

## 1. Riscos técnicos

| # | Risco | Prob. | Imp. | Mitigação | Sinal de alerta |
|---|---|---|---|---|---|
| T1 | **A migração do catálogo funde produtos errados** e corrompe o histórico de relatórios | M | A | Agrupamento é **relatório, não fusão automática**; revisão humana obrigatória; `order_items` já faz snapshot de nome e preço | Coluna `price_spread` alta num cluster; itens com nomes muito divergentes agrupados |
| T2 | ~~O POS escreve direto em `points`~~ — **descartado**. Os logs de produção mostram que o ERP grava **pela API** (`POST /points`), não no banco. O adaptador continua unidirecional e a migração do ledger pode reimplementar a rota sobre o `walletService` sem que o ERP perceba | — | **B** | Manter o job noturno de `LEGACY_UNMIRRORED_WRITE` como rede de segurança | Linhas em `points` sem lançamento correspondente |
| T3 | O congelamento do roteador legado é contornado sob pressão de prazo | A | M | Guarda de CI que reprova o build se a contagem de linhas de `routes.ts` crescer | PR tentando adicionar rota legada |
| T4 | Sequelize devolve `DECIMAL` como string e quebra consumidores na migração de dinheiro | A | M | Expand/contract com dual-write; serialização explícita com `Number(...)` na fronteira; testes de snapshot do contrato legado | Teste de contrato falhando; valores aparecendo como texto no app |
| T5 | O relay do outbox trava e ninguém percebe | M | A | Alerta de página em `idade da linha mais antiga não publicada > 60 s`, exposto no `/internal/status`; mensagens venenosas estacionadas | A métrica mais importante do sistema; se ela cresce, algo já está errado |
| T6 | Um único processo Node vira gargalo antes do previsto | B | M | Adapter Redis do Socket.IO é a única mudança necessária; workers já emitem através do adapter | CPU sustentada acima de 70%; latência p95 subindo |
| T7 | Rollback de migration impossível por `down()` quebrado | M | M | Job de CI roda `up → down → up` num banco limpo | Falha do job — que é o objetivo dele |
| T8 | Deriva entre a spec OpenAPI e o cliente tipado escrito à mão | A | B | Job noturno compara método+caminho e abre issue | Issue automática aberta |
| T9 | **O ERP é o único consumidor anônimo de rota de escrita.** Fechar `points.create` depende de um terceiro acrescentar um header e de as lojas atualizarem | A | M | Token de serviço; modo observação até o log não registrar mais chamada anônima; bloqueio por variável, reversível em segundos | Chamadas anônimas em `points.create` no log |

---

## 2. Riscos financeiros

| # | Risco | Prob. | Imp. | Mitigação | Sinal de alerta |
|---|---|---|---|---|---|
| F1 | **O custo agregado do grandfather da migração é maior do que o esperado** | M | A | Calcular `SUM(delta_cents)` **antes** de commitar e obter aval escrito do financeiro; opção de teto por cliente com revisão manual da cauda | O próprio número, no relatório de reconciliação |
| F2 | O passivo de cashback cresce sem controle | M | A | `mv_wallet_liability` desde a Fase 3; expiração por lote; breakage medido | Passivo circulante crescendo mais rápido que a receita |
| F3 | Campanha mal configurada estoura orçamento | M | M | `max_bonus_per_order_cents` e `budget_cents` **obrigatórios**; incremento guardado dentro da transação; `stackable = false` por padrão | `consumed_budget_cents` acelerando |
| F4 | Fraude interna via ajuste manual de cashback | B | A | Motivo obrigatório, auditoria na mesma transação, quatro olhos acima do teto, relatório diário ao financeiro | Volume de ajustes por operador; ajustes recorrentes para os mesmos CPFs |
| F5 | Chargebacks acima do esperado | M | M | Ledger registra `CLAWBACK` e `WRITE_OFF`, tornando a perda **mensurável**; conta marcada e congelada em recorrência | Taxa de chargeback por unidade |
| F6 | Pedido `on_delivery` com cashback consumido e recusado na porta | M | B | Política explícita de recrédito ao lote original; risco medido no relatório de falha de entrega | Taxa de `ENT_CLIENTE_RECUSOU` em pedidos com cashback |

---

## 3. Riscos operacionais

| # | Risco | Prob. | Imp. | Mitigação | Sinal de alerta |
|---|---|---|---|---|---|
| O1 | **A loja não adota o Order Hub** e continua atendendo por telefone/WhatsApp | M | A | Piloto em duas unidades com acompanhamento presencial; o Hub precisa ser mais rápido que a alternativa, não apenas mais completo | Pedidos aceitos com atraso alto numa unidade específica |
| O2 | Impressora quebrada numa loja por dias sem ninguém notar | A | M | Heartbeat do agente a cada 30 s; indicador vermelho antes da primeira falha; **relatório de taxa de falha de impressão por unidade no Corporate** | Taxa de falha > 20% em 1 h |
| O3 | Operadores desativam o som e perdem pedidos | A | A | **"Silenciar tudo" não existe**; só modo silencioso de 15 min, com permissão, banner vermelho e registro em auditoria; volume mínimo de 40% | Pedidos expirando numa unidade que está online |
| O4 | Franqueado vê ou altera dados de outra unidade | B | A | Escopo imposto na camada de query; 404 em vez de 403; RLS na Fase 3 | Qualquer ocorrência é incidente |
| O5 | Time pequeno demais para o roadmap | A | A | Fases 1 e 2 paralelizáveis; corte sai de P2, depois de P1, nunca de P0 | Portão de fase não atingido no prazo |
| O6 | Dois sistemas administrativos convivendo por dois anos | A | M | Congelamento de features no legado, deletar-ao-migrar, painel de burn-down, **data de aposentadoria fixada na Fase 0** | Percentual de sessões em `/legacy/*` parado |
| O7 | Migração do cashback exige janela de manutenção em horário ruim | B | M | Cutover de ~15 min no vale de tráfego (04:00 BRT); só mutações de cashback ficam em manutenção, leituras e pedidos continuam | — |

---

## 4. Riscos de segurança

| # | Risco | Prob. | Imp. | Mitigação | Sinal de alerta |
|---|---|---|---|---|---|
| S1 | **Comprometimento já ocorrido** pelos segredos versionados e pelo JWT hardcoded | M | A | Assumir comprometimento: rotacionar tudo, revisar logs de acesso ao banco e uso dos provedores, e considerar limpeza de histórico do git | Uso anômalo de Twilio/Comtele; pontos criados fora de padrão |
| S2 | Alguém cunhou cashback pelos endpoints abertos antes da correção | B | A | Auditoria retroativa de `points` criados sem correspondência de venda; a coluna `suspicious` já existe | Créditos sem `transaction_code` ou fora do horário de operação |
| S3 | Rotação do segredo do JWT desloga toda a base de uma vez | A | M | Verificação dupla por 48 h, aviso prévio, execução às 04:00 | Pico de logins e de erros 401 |
| S4 | PANs em texto puro nos dispositivos dos clientes | **Certeza** | A | Purga única no upgrade; tratar como incidente de segurança reportável; **bloqueador da release de pagamentos** | Já é fato, não risco |
| S5 | Vazamento de PII em relatório de erro | M | A | `beforeSend` do Sentry removendo CPF, telefone, e-mail, endereço e `customer.*` | Auditoria periódica de eventos no Sentry |
| S6 | Escalonamento de privilégio pela tela de papéis | B | A | Validação no serviço: ninguém concede além do próprio conjunto nem em escopo maior | Tentativa registrada em auditoria |

---

## 5. Riscos de performance

| # | Risco | Prob. | Imp. | Mitigação | Sinal de alerta |
|---|---|---|---|---|---|
| P1 | Tempestade de refetch no pico do Hub | M | A | Escrever no cache em vez de invalidar; coalescing de 120 ms; consciência de filtro | Quedas de frame no board; picos de requisição no minuto cheio |
| P2 | Dashboard do Corporate agregando no navegador | A | M | Agregação no servidor e views materializadas desde a Fase 3; `DataGrid` server-driven por padrão | Payloads acima de alguns MB; tempo de render de tabela |
| P3 | Um diretor assinando o stream de todas as unidades | M | M | **Teto de 8 unidades ao vivo**; Corporate assina `network:ops` agregado, nunca todos os streams | Contagem de rooms por socket |
| P4 | Exportação de relatório derrubando o banco | M | M | Fila de concorrência 1, paginação por cursor, pool separado para workers, `statement_timeout` | Utilização do pool acima de 80% |
| P5 | Memória do Hub crescendo ao longo de 8 h de turno | M | M | `gcTime` limitado, chat virtualizado, **um único ticker rAF** para todos os cronômetros | Uso acima de 250 MB no fim do turno |

---

## 6. Riscos de UX

| # | Risco | Prob. | Imp. | Mitigação | Sinal de alerta |
|---|---|---|---|---|---|
| U1 | **Recusa acidental por reflexo de fechar modal** | A | A | Novo pedido **não é modal**; recusa exige motivo; a faixa de observação tem atraso anti tap-through | Taxa de recusa com motivo `REJ_OUTRO` sem texto significativo |
| U2 | Observação do cliente ignorada (alergia, "sem cebola") | A | A | Faixa amarela de largura total acima dos botões; bloco no topo do detalhe; impressa em fonte dupla no topo **e** no rodapé da comanda | Reclamação recorrente e taxa de retrabalho |
| U3 | Operador confunde retirada com entrega | M | A | Cabeçalho âmbar sólido em retirada; ícone distinto; ação diferente na coluna Prontos | Pedidos de retirada despachados por engano |
| U4 | Botão cinza sem explicação gera ticket de suporte | A | B | Nunca desabilitar sem motivo; travas do Corporate mostram quem travou e quando | Volume de perguntas "por que não consigo editar" |
| U5 | Tema escuro no Hub rejeitado pelos operadores | B | B | Alternância manual persistida por dispositivo | Preferência efetivamente escolhida no piloto |

---

## 7. Riscos de produto

| # | Risco | Prob. | Imp. | Mitigação | Sinal de alerta |
|---|---|---|---|---|---|
| Pr1 | **Decisões de negócio em aberto atrasam fases** ([01 §5](./01-premissas-e-lacunas.md)) | A | M | Cada lacuna tem prazo-limite e uma recomendação provisória para seguir sem travar | Lacuna sem resposta a menos de duas semanas do prazo |
| Pr2 | Prints de referência chegam e contradizem a UX proposta | M | B | A UX está justificada por princípio, não por imitação; o passe de revisão está previsto | — |
| Pr3 | Corporate e Store Manager divergem além do previsto | B | M | Extrair `apps/portal` continua sendo 1 a 2 semanas, porque os pacotes já são compartilhados | Mais de 40% de telas exclusivas do Portal |
| Pr4 | Franquia exige isolamento maior do que o modelo suporta | M | M | Escopo já é multivalorado, com grupos desde o dia 1; RLS é a próxima camada | Exigência contratual de isolamento de dados |
| Pr5 | O cashback no delivery é usado muito acima do previsto e comprime a margem | M | A | Teto configurável por pedido (recomendado 50% do subtotal); passivo monitorado | Percentual da receita financiada por cashback |

---

## Os cinco que merecem atenção semanal

1. **S1 — comprometimento já ocorrido.** É o único risco cujo dano pode já estar em curso.
2. **T5 — relay do outbox travado.** Falha silenciosa em que tudo parece bem.
3. **F1 — custo do grandfather.** Precisa de número antes de decisão, não depois.
4. **O3 — som desativado no Hub.** Anula sozinho todo o valor da Fase 1.
5. **O5 — capacidade do time.** É o que determina se o roadmap é plano ou ficção.
