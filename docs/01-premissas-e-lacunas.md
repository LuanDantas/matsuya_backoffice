# 01 — Premissas, lacunas e perguntas em aberto

> Seção 31 do briefing: *"faça suposições razoáveis quando necessário e liste-as explicitamente"*. Este capítulo registra tudo o que foi assumido para que a arquitetura pudesse fechar, separando **suposição** (decidimos por você, e a decisão está justificada) de **pergunta em aberto** (precisa de resposta do negócio antes de virar código).
>
> Toda suposição aqui é revisável. Se alguma estiver errada, o capítulo afetado está indicado.

---

## 1. Decisões já travadas com o cliente

| Tema | Decisão | Consequência |
|---|---|---|
| Entregável | Só a especificação arquitetural | Nenhum código de aplicação nesta entrega |
| Admin atual (`matsuya_app-admin-v2`) | Absorvido gradualmente pelo Corporate | Fases 0–6 em [04 §9](./04-arquitetura-frontend.md) |
| Backend | Evoluir a API existente como modular monolith | Sem NestJS, sem serviço novo, sem reescrita ([06](./06-arquitetura-backend.md)) |
| Prints de referência | Não fornecidos; seguimos com padrões consolidados | As PARTES 16 e 17 recebem um passe de revisão quando os prints chegarem |

---

## 2. Suposições de produto e negócio

| # | Suposição | Base | Se estiver errada |
|---|---|---|---|
| P1 | A rede tem 6 a 12 unidades hoje, com horizonte de dezenas — não centenas — nos próximos 24 meses | Dev tem 9 unidades cadastradas, produção tem 11 | Acima de ~100 unidades, revisitar o adapter Redis do Socket.IO e a estratégia de agregação de relatório ([06](./06-arquitetura-backend.md), [19](./19-observabilidade.md)) |
| P2 | Todas as unidades são da própria rede; franquia existe ou existirá, mas **não é marketplace** — não há marcas de terceiros | Registro de decisão anterior do módulo delivery | Marketplace exigiria tenancy real, split de pagamento e onboarding de lojista — mudança estrutural em [07](./07-dominios.md) e [11](./11-pagamentos.md) |
| P3 | Uma única marca por ora; múltiplas marcas são evolução futura | Briefing, §25 | A modelagem já prevê `brand_id` como coluna futura em `unity`; adiar não bloqueia |
| P4 | Mercado Pago é o PSP (Pix + cartão), além de pagamento na entrega | Decisão de negócio anterior | Trocar de PSP é contido: [11](./11-pagamentos.md) isola o provedor atrás de uma interface |
| P5 | Entregadores são próprios (papel `courier`), com integração de praça como opção futura | `orders.courier_id` já existe no schema | Terceirização total simplifica o Order Hub e elimina H-07 |
| P6 | **CONFIRMADO (logs de produção, 14/08).** O ERP do restaurante, instalado **em cada loja**, chama `POST /points` sem autenticação para lançar cashback quando o cliente informa o CPF no caixa. Sai pelo IP da própria unidade (7 IPs distintos observados em 2 h) e usa o domínio `mastsuya-api.onrender.com`, enquanto os demais clientes usam `api.matsuya.com.br` | Logs de requisição do Render | — |
| P7 | Não existe integração com ERP ou sistema fiscal no escopo | Nada no código, nada no briefing | Emissão de NF-e mudaria o ciclo do pedido e exigiria um contexto novo |
| P8 | Cada unidade tem internet própria e instável, com LAN local funcional | Realidade de restaurante em São Paulo | Se a LAN também cair, o agente de impressão perde o caminho de fallback ([04 §7](./04-arquitetura-frontend.md)) |
| P9 | O horário de pico é almoço e jantar, com até 20 pedidos simultâneos por unidade | Padrão do setor | Volume 5× maior exigiria virtualização de lista e revisão dos orçamentos de performance |
| P10 | O time de engenharia é pequeno (1 a 3 pessoas) e sem experiência prévia com monorepo, testes ou fila | Ausência total de testes, CI e Docker nos três repos | Um time maior justificaria Nx, microsserviços e observabilidade completa desde o dia 1 |

---

## 3. Suposições técnicas

| # | Suposição | Justificativa | Capítulo |
|---|---|---|---|
| T1 | Um único PostgreSQL continua suficiente; não haverá réplica de leitura no curto prazo | Volume atual não justifica | [06](./06-arquitetura-backend.md) |
| T2 | Redis será provisionado (fila, adapter de socket, idempotência, rate limit) | É a única infraestrutura nova necessária | [06 §5](./06-arquitetura-backend.md) |
| T3 | Um único processo Node atende o tempo real por ora; o adapter Redis entra quando houver mais de uma instância | Simplicidade primeiro | [14](./14-websockets.md) |
| T4 | O app mobile continuará usando as rotas legadas por vários meses e **não pode quebrar** | Está em produção | [06 §4](./06-arquitetura-backend.md) |
| T5 | O deploy continua no Render, com evolução para Docker + CI | Inferido do CORS e do `DATABASE_URL` de produção | [19](./19-observabilidade.md) |
| T6 | O e-mail transacional atual (SMTP) e o Expo Push seguem como canais | Já existem e funcionam | [13](./13-eventos.md) |
| T7 | Não haverá app nativo dedicado para o Order Hub na v1 — é PWA em navegador | Reduz drasticamente custo e ciclo de release | [04 §2](./04-arquitetura-frontend.md) |
| T8 | Impressoras térmicas são ESC/POS, com conexão USB ou Ethernet | Padrão absoluto do setor no Brasil | [04 §7](./04-arquitetura-frontend.md) |
| T9 | O geocoding continua com Nominatim/OSM, sem chave e sem custo | Já implementado | [08](./08-banco-de-dados.md) |
| T10 | Não há requisito de alta disponibilidade formal (SLA contratual) no primeiro ano | Nenhuma menção no briefing | [21](./21-roadmap.md) |

---

## 4. Suposições sobre dinheiro e conformidade

| # | Suposição | Consequência se errada |
|---|---|---|
| M1 | Cashback é **benefício comercial**, não moeda eletrônica regulada, e não é conversível em dinheiro | Se fosse regulado, haveria exigências de reserva e reporte ao Banco Central |
| M2 | Cashback expira por lote, e a expiração é retida pela empresa (breakage) | Se a política for "nunca expira", o passivo cresce indefinidamente e [10](./10-cashback-ledger.md) muda a modelagem de lotes |
| M3 | Os limiares atuais de nível (R$ 699 e R$ 2.500) e os percentuais (1/2/3 %) permanecem, mas passam a ser **dados**, não código | Hoje estão duplicados no app mobile (`getPlanStartValue`) |
| M4 | Dados de cartão **nunca** transitam nem repousam em servidor próprio — tudo é tokenizado pelo PSP | Mantém o escopo de PCI DSS no mínimo (SAQ A) ([18](./18-seguranca.md)) |
| M5 | O cliente é o titular dos dados sob a LGPD, e a base legal principal é execução de contrato + consentimento para marketing | Define os fluxos de exportação, anonimização e mascaramento de PII |
| M6 | Estorno de cartão leva até 2 dias úteis; Pix é imediato | É o texto exibido ao cliente em [03 §3.5](./03-tres-aplicacoes.md) |
| M7 | Quando um pedido é cancelado, o cashback usado volta **ao lote original, com a validade preservada** | Alternativa (novo lote com nova validade) beneficiaria o cliente e aumentaria o passivo |
| M8 | Cashback já creditado e já gasto, num pedido posteriormente estornado, **não gera saldo negativo** — é baixado como perda | Política alternativa (saldo negativo) gera atrito grave de suporte ([10 §7.2](./10-cashback-ledger.md)) |

---

## 5. Lacunas que precisam de decisão do negócio

Nenhuma bloqueia o início da implementação, mas cada uma tem um **prazo antes do qual precisa estar respondida**.

| # | Pergunta | Precisa de resposta antes de | Nossa recomendação provisória |
|---|---|---|---|
| L1 | Franqueados são terceiros de verdade, com contrato e acesso restrito, ou gerentes assalariados? | Fase 3 (RBAC) | Modelar como terceiros — é o caso mais restritivo e degrada bem |
| L2 | O Corporate pode **travar preço** por unidade, ou o preço é sempre da rede? | Fase 5 (catálogo) | Trava por campo, com override permitido dentro de uma faixa percentual |
| L3 | Qual o SLA de aceite contratual? (assumimos 5 min entrega / 3 min retirada) | Fase 1 (Order Hub) | Manter o assumido, configurável por unidade com teto do Corporate |
| L4 | Quem paga a diferença quando um item é substituído por outro mais caro? | Fase 1 | A loja absorve — nunca cobrar a mais sem novo consentimento |
| L5 | Cashback pode pagar 100% de um pedido, ou existe um teto por pedido? | Fase 2 (ledger + pagamentos) | Teto configurável, começando em 50% do subtotal |
| L6 | Cashback acumula com cupom no mesmo pedido? | Fase 2 | Sim, com o cashback aplicado depois do desconto |
| L7 | O cashback do pedido de delivery é creditado na entrega ou na confirmação do pagamento? | Fase 2 | **Na entrega** — evita crédito sobre pedido que será cancelado |
| L8 | Existe orçamento para MFA (TOTP) e para um provedor de e-mail transacional adequado? | Fase 0 | TOTP é implementável sem custo de licença |
| L9 | Quantas vias de impressão por pedido, e quais impressoras existem hoje em cada loja? | Fase 1 | Assumimos cozinha + balcão, com etiqueta opcional |
| L10 | Há exigência fiscal (NFC-e / cupom fiscal) no delivery? | Antes do go-live comercial | Fora de escopo — se existir, é um contexto novo |
| L11 | Prazo de retenção de dados de cliente e de chat, para fins de LGPD | Fase 3 | 5 anos para pedido (prazo prescricional), 90 dias para anexos de chat |
| L12 | O Order Hub substitui algum sistema de PDV existente, ou convive com ele? | Fase 1 | Convive — não há integração de PDV no escopo |
| L13 | Existe equipe de suporte dedicada, ou o suporte é feito pelo próprio Corporate? | Fase 3 | Não há — "Suporte" vira um pacote de permissões, não um contexto ([07](./07-dominios.md)) |
| L14 | Qual o volume real de pedidos por unidade hoje? Não há métrica coletada | Fase 2 (dimensionamento) | Instrumentar antes de dimensionar |

---

## 6. O que este documento deliberadamente não cobre

| Fora de escopo | Motivo |
|---|---|
| O app mobile do cliente | Já existe e funciona; só recebe os contratos novos (cashback no checkout, push de status, chat) |
| App do entregador | Fase 3 do plano original do delivery; a arquitetura não o inviabiliza (`courier_id` já existe) |
| Emissão fiscal | Ver L10 |
| Integração com ERP e com PDV | Evolução futura ([25](./25-evolucoes-futuras.md)) |
| Marketplace / marcas de terceiros | Ver P2 |
| Roteirização e otimização de entregas | Evolução futura; exige volume que ainda não existe |
| Precificação dinâmica e recomendação por IA | Evolução futura; a arquitetura de eventos ([13](./13-eventos.md)) já produz o dado necessário |
