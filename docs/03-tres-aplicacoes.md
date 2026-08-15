# 03 — As três aplicações

> PARTE 3 do briefing. Define o que cada aplicação é, para quem, e — no caso do Order Hub, que é a mais crítica — como ela se comporta em detalhe. O inventário de telas está em [16](./16-telas.md); a navegação em [17](./17-ux-navegacao.md); a arquitetura técnica em [04](./04-arquitetura-frontend.md).

---

## 1. Visão de conjunto

| | **Corporate / Matriz** | **Store Manager / Portal da Unidade** | **Order Hub** |
|---|---|---|---|
| Pergunta que responde | "Como vai a rede?" | "Como vai a minha loja e como eu a configuro?" | "O que eu faço agora?" |
| Usuários | Diretoria, ops, financeiro, marketing, suporte, gerente regional | Franqueado, gerente de loja | Operadores de balcão e cozinha |
| Escopo | `network` \| `group:{id}` \| `unit:{id}` | `unit:{id}` dentro de um conjunto autorizado | Uma unidade por dispositivo |
| Dispositivo | Desktop ≥ 1280 px | Tablet-first (o franqueado vive no iPad) | Tablet 10–13" em suporte, ou PC de balcão 24" |
| Tema padrão | Claro | Claro | **Escuro** |
| Sessão | Minutos por vez | Minutos por vez | **12 horas seguidas** |
| Frequência de uso | Diária a semanal | Diária | **Contínua durante o serviço** |
| Tempo real | Opcional (telas ao vivo) | Baixa frequência (status) | **É o produto** |
| Custo de erro | Decisão errada | Configuração errada | **Pedido perdido, cliente perdido** |
| Telas | 36 | 18 | 12 |

Do ponto de vista do usuário são três produtos com fronteiras nítidas. Do ponto de vista de engenharia, Corporate e Store Manager são **a mesma aplicação em dois níveis de escopo** e compartilham base de código; o Order Hub é uma aplicação separada. A justificativa está em [04 §1](./04-arquitetura-frontend.md#1-a-pergunta-que-importa-três-aplicações-ou-duas).

---

## 2. Máquina de estados estendida (contrato de UI)

A máquina atual do backend tem 6 estados e não cobre a operação real. Aqui fixamos os estados, os rótulos pt-BR e — o mais importante — **quais deles importam ao operador**. Os rótulos do app do cliente são **normativos**: painel e app nunca podem chamar o mesmo estado por nomes diferentes.

| Estado | Rótulo (operador) | Rótulo (cliente) | Importa ao operador? |
|---|---|---|---|
| `awaiting_payment` | Aguardando pagamento | Aguardando pagamento | **Sim, mas não é trabalho** — rail separado, sem som |
| `payment_failed` | Pagamento não aprovado | Pagamento não aprovado | **Sim** — sai da entrada; se já estava em preparo, é alerta vermelho |
| `pending` | **Aguardando confirmação** | Aguardando confirmação | **Crítico** — único estado com SLA e som |
| `confirmed` | Confirmado | Confirmado | Transitório; a UI o funde visualmente com `preparing` |
| `preparing` | **Em preparo** | Em preparo | **Crítico** |
| `ready` | **Pronto** | Pronto | **Crítico** — separa "pronto p/ retirada" de "pronto p/ coleta" |
| `awaiting_courier` | Aguardando entregador | Saindo para entrega | **Crítico** — é onde o pedido trava |
| `out_for_delivery` | Saiu para entrega | Saiu para entrega | Médio — monitoramento |
| `delivered` | Entregue | Entregue | Baixo — arquivo |
| `rejected` | Recusado | Pedido recusado | Baixo — arquivo, mas alimenta métrica |
| `cancelled` | Cancelado | Cancelado | Baixo — arquivo |
| `delivery_failed` | Falha na entrega | Não foi possível entregar | **Crítico** — exceção |
| `customer_not_found` | Cliente não localizado | Não conseguimos te encontrar | **Crítico** — exige ação em minutos |

**Decisão de produto:** `partial_cancellation` e `refund` **não são estados de pedido**.

- **Cancelamento parcial** = flag `hasPartialCancellation` + linhas de item com `cancelledQty` e `cancelReason`. O pedido continua `preparing`. Modelar como estado forçaria o operador a sair da fila de trabalho para consertar um item — o oposto do que ele precisa às 12h30.
- **Reembolso** = `paymentStatus: 'refunded'` + lançamentos `REFUND` no ledger. Um pedido `delivered` que foi reembolsado continua `delivered`; o financeiro é uma dimensão ortogonal ao ciclo operacional.

Isso mantém a coluna do quadro com um significado único: **onde o pedido está fisicamente**. Estado de dinheiro vira badge, não coluna. O detalhamento da máquina no backend está em [09](./09-pedidos.md).

---

## 3. Order Hub — UX em profundidade

### 3.1 Contexto de uso (não negociável)

| Variável | Realidade |
|---|---|
| Dispositivo | Tablet 10–13" (retrato ou paisagem) em suporte no balcão, **ou** PC de balcão 24" 1920×1080 |
| Distância dos olhos | 50–90 cm (tablet), 70–120 cm (monitor) |
| Mãos | Frequentemente uma só; às vezes com luva ou molhada |
| Ruído | Alto (cozinha, exaustor, salão) |
| Atenção | Fragmentada — o operador também atende balcão e telefone |
| Pico | 20 pedidos simultâneos, 3 a 5 novos por minuto |
| Erro caro | Recusar por engano, perder uma observação de alergia, esquecer um adicional |

**Princípio-mestre:** o painel não é um CRUD de pedidos. É um **instrumento de fila sob pressão**. Toda decisão abaixo prioriza *tempo até a próxima ação correta* sobre densidade de informação.

### 3.2 Layout: híbrido "rail + kanban"

**Recomendação: híbrido — nem Kanban puro, nem lista pura.**

*Por que não Kanban puro* (o padrão iFood/Rappi merchant): com 5 a 7 colunas num tablet de 10", cada coluna fica com ~140 px. O card vira ilegível e o operador precisa rolar horizontalmente — o gesto mais lento e mais propenso a erro sob pressão. Além disso, Kanban puro trata "novo pedido" como uma coluna entre iguais, e ela é a única com SLA correndo.

*Por que não lista pura*: com 20 pedidos, uma lista única obriga varredura vertical para responder "o que está pronto?" e "o que está travado?". Perde-se a leitura espacial do estado.

**O híbrido:**

- **Rail de Entrada** (esquerda, fixo, ~300 px, nunca sai da tela): só `pending`. É a única região com contagem regressiva de SLA e som. Permanece visível em qualquer viewport, inclusive quando o operador está dentro do detalhe de outro pedido. É exatamente o que o iFood **não** faz bem: lá o pedido novo cobre a tela inteira e o operador perde o contexto.
- **Quadro de trabalho** (centro, 3 colunas): `Em preparo` (funde `confirmed` + `preparing`), `Prontos` (`ready`), `Em rota` (`awaiting_courier` + `out_for_delivery`).
- **Faixa de Exceções** (rodapé, colapsável, abre sozinha quando tem item): `payment_failed`, `delivery_failed`, `customer_not_found`, pedidos estourando SLA de preparo, chats sem resposta há mais de 3 min.

| Viewport | Comportamento |
|---|---|
| ≥ 1440 px (monitor 24") | Rail + 3 colunas + faixa de exceções, tudo simultâneo. Densidade "confortável". Cards mostram até 3 linhas de itens |
| 1024–1439 px (tablet paisagem) | Rail + 3 colunas; exceções viram badge no topo que expande em sheet. Densidade "compacta". Cards com 2 linhas de itens |
| < 1024 px (tablet retrato) | **Coluna única com filtro segmentado** (`Entrada (3) · Preparo (7) · Prontos (2) · Rota (4) · Exceções (1)`). O rail de Entrada vira uma **barra flutuante persistente no topo** com o pedido mais antigo e seu timer; tocar abre o sheet de aceite. **A entrada nunca fica escondida atrás de uma aba** |

#### Quadro principal (monitor 24" / tablet paisagem)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ● ABERTA  Matsuya Mooca      Preparo: 25 min ▾   🔔 Som ON   🖨 OK   ⏱ 12:34   ⛶  ⚙  JS │
├──────────────────┬───────────────────────────────────────────────────────────────────────┤
│  ENTRADA (3)     │  EM PREPARO (7)      │  PRONTOS (2)        │  EM ROTA (4)             │
│                  │                      │                     │                          │
│ ┌──────────────┐ │ ┌──────────────────┐ │ ┌─────────────────┐ │ ┌──────────────────────┐ │
│ │ ⏱ 01:42  ▓▓▓░│ │ │ #1042  🛵        │ │ │ #1031  🏠 RETIRA│ │ │ #1022  🛵  22 min    │ │
│ │ #1047  🛵    │ │ │ Ana P.     16 min│ │ │ Bruno M.        │ │ │ Carla S.             │ │
│ │ Marina L.    │ │ │ 3 itens  R$ 128  │ │ │ 2 itens R$ 74   │ │ │ 🏍 Rafael — a 1,2 km │ │
│ │ 4 itens      │ │ │ ▓▓▓▓▓▓░░░ 8/25min│ │ │ ⏱ pronto há 4min│ │ │ ▸ Acompanhar         │ │
│ │ R$ 214,00    │ │ │ ▸ Abrir preparo  │ │ │ ▸ Cliente chegou│ │ └──────────────────────┘ │
│ │ 💳 Cartão ✔  │ │ └──────────────────┘ │ └─────────────────┘ │ ┌──────────────────────┐ │
│ │ 🪙 R$30 cash │ │ ┌──────────────────┐ │ ┌─────────────────┐ │ │ #1019  🛵            │ │
│ │ 📝 OBSERVAÇÃO│ │ │ #1044  🛵  💬 2  │ │ │ #1035  🛵       │ │ │ ⚠ Sem entregador     │ │
│ ├──────┬───────┤ │ │ Pedro K.   4 min │ │ │ Julia F.        │ │ │ há 9 min             │ │
│ │RECUSAR│ACEITAR│ │ │ ⚠ 1 item indisp.│ │ │ ▸ Chamar entrega│ │ │ ▸ Atribuir           │ │
│ └──────┴───────┘ │ └──────────────────┘ │ └─────────────────┘ │ └──────────────────────┘ │
│ ┌──────────────┐ │ ┌──────────────────┐ │                     │                          │
│ │ ⏱ 03:10  ▓▓▓▓│ │ │ #1045  🏠        │ │                     │                          │
│ │ #1048 …      │ │ │ …                │ │                     │                          │
│ └──────────────┘ │ └──────────────────┘ │                     │                          │
├──────────────────┴──────────────────────┴─────────────────────┴──────────────────────────┤
│ ⚠ EXCEÇÕES (2)   #1019 Sem entregador há 9 min   ·   #1008 Pagamento não aprovado    ▲   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Hierarquia de informação do card — a regra dos 2 segundos

O operador lê o card numa ordem fixa. Nada compete por posição.

| # | Informação | Onde | Tratamento |
|---|---|---|---|
| 1 | **Timer de SLA** (só em `pending`) | Topo-esquerda, maior elemento do card | Numérico grande + barra de progresso; muda de cor e de forma |
| 2 | **Tipo de entrega** `🛵 Entrega` / `🏠 Retirada` | Topo-direita, ícone + cor de fundo do cabeçalho | Retirada tem cabeçalho **âmbar sólido**; entrega, neutro. É a diferença mais custosa de errar |
| 3 | **Número curto do pedido** (#1047) | Linha 1 | Mono, alto contraste. Nunca o UUID |
| 4 | **Nome do cliente** | Linha 1 | — |
| 5 | **Nº de itens + total** | Linha 2 | `4 itens · R$ 214,00` |
| 6 | **Flags críticas** | Linha 3, faixa dedicada | Chips com ícone, ordem fixa |
| 7 | Ações primárias | Rodapé do card | Dois botões grandes, área de toque ≥ 56 px |

**Secundário** (visível, sem competir): tempo decorrido desde a criação, badge de chat não lido, nome do entregador, bairro.
**Atrás de um toque**: lista completa de itens, `optionsSnapshot` por item, endereço completo, histórico de status, pagamento detalhado, cupom, telefone, histórico do cliente.

#### Flags críticas — ordem fixa

| Flag | Chip | Quando |
|---|---|---|
| Observação do cliente | `📝 OBSERVAÇÃO` — **faixa amarela de largura total**, caixa alta | `notes` não vazio |
| Adicionais | `➕ 6 adicionais` | algum item com `optionsSnapshot` |
| Cashback usado | `🪙 R$ 30,00 em cashback` | `cashbackUsed > 0` |
| Pagamento | `💳 Cartão ✔` / `Pix ✔` / `💵 Na entrega — R$ 90,00` | sempre |
| Cupom | `🎟 BEMVINDO10` | `voucherCode` presente |
| Cliente novo / VIP | `⭐ Ouro` / `🆕 1º pedido` | nível / histórico |

#### Observações (`notes`) — tratamento especial

É o campo que mais gera retrabalho e risco (alergia, "sem cebola", "porteiro não atende").

1. No card: faixa amarela de largura total, **acima** dos botões de ação, com o texto integral se ≤ 60 caracteres, senão truncado com o chip `ver tudo`.
2. No detalhe: bloco no topo, antes dos itens, com ícone e borda âmbar.
3. **Aceitar um pedido com `notes` exige que a faixa tenha sido renderizada por ≥ 800 ms.** Não é um checkbox — é um atraso imperceptível para quem já leu, e um freio para quem estava tocando às cegas.
4. Na impressão térmica: `** OBSERVACAO **` em fonte de altura dupla, no topo do cupom **e** repetido no rodapé.

#### `optionsSnapshot` (adicionais) — tratamento especial

Nunca colapsar adicionais no card de preparo. Cada item é renderizado assim:

```
2×  Temaki Salmão                              R$ 58,00
      + Cream cheese extra                     + R$ 6,00
      + Sem cebolinha
      − Trocar arroz por shari doce            + R$ 4,00
```

Adicionais com `priceDelta === 0` (remoções, trocas) são os **mais esquecidos** e não podem ficar em cinza claro só porque não custam nada. Mesmo peso visual dos pagos; a diferença é só o prefixo `+`/`−`.

#### Pagamento em cashback e pagamento parcial

Um pedido de R$ 120 = R$ 30 de cashback + R$ 90 no cartão é risco real de erro (o operador acha que "não foi pago"):

```
┌─ PAGAMENTO ──────────────────────────────┐
│ Total do pedido               R$ 120,00  │
│ 🪙 Cashback (carteira)     −  R$  30,00  │  ← já debitado, verde
│ 💳 Cartão · aprovado       −  R$  90,00  │  ← verde
│ ──────────────────────────────────────── │
│ A COBRAR NA ENTREGA           R$   0,00  │  ← linha final SEMPRE presente
└──────────────────────────────────────────┘
```

A linha **A COBRAR NA ENTREGA** é obrigatória em todos os pedidos, inclusive quando é R$ 0,00. É a única informação que o entregador precisa e a que mais gera conflito no portão. Em `on_delivery` ela é vermelha, vai em fonte dupla no cupom térmico e traz o troco solicitado, se houver.

#### Retirada vs. entrega

| Aspecto | Entrega | Retirada |
|---|---|---|
| Cabeçalho do card | Neutro | **Âmbar sólido** |
| Ícone | 🛵 | 🏠 |
| Endereço | Completo + bairro + complemento + referência | Oculto; "Retirada no balcão" |
| Ação em `Prontos` | `Chamar entregador` | `Cliente chegou → Entregar` |
| SLA de preparo | ETA = preparo + deslocamento | ETA = preparo |
| Estado terminal | `out_for_delivery` → `delivered` | `ready` → `delivered` (pula rota) |
| Impressão | 2 vias (cozinha + entrega) | 1 via (cozinha) + etiqueta com nome |

### 3.4 A interrupção do novo pedido

**Recomendação: coluna dedicada persistente + realce animado. Não modal, não toast.**

*Por que não modal* (o que iFood e Rappi fazem): o modal bloqueia. Com 3 pedidos por minuto, o operador que está montando o #1042 é jogado para fora do contexto, e o reflexo treinado vira "fechar o modal" — que é exatamente o gesto que precede uma recusa acidental. Modal também impede ler dois pedidos novos lado a lado para decidir a ordem.

*Por que não toast*: efêmero. Um pedido com SLA de 3 minutos não pode depender de o operador estar olhando nos 5 segundos do toast.

**O padrão:**

1. O card entra no topo do rail com **animação de inserção com deslocamento** (240 ms, `ease-out`) — o movimento é o que a visão periférica capta, não a cor.
2. Pulso de contorno por 6 s (3 ciclos lentos) e um **flash de borda na tela inteira** (2 px, 400 ms), visível mesmo com o detalhe de outro pedido aberto.
3. O rail ganha cabeçalho `ENTRADA (3)` com contagem viva.
4. Se o operador está em outra tela, aparece uma **barra âncora inferior** de 64 px: `⏱ 02:58 · Novo pedido #1047 · R$ 214,00 — [Ver]`. Não rouba foco.

```
┌─────────────────────────────────────────────┐
│  ← #1042 · Em preparo              💬 2   ⚙ │
│                                              │
│   (conteúdo do preparo continua visível)     │
│                                              │
│   ▢ 2× Temaki Salmão                         │
│   ▣ 1× Combo Matsuya 20 peças                │
│   ▢ 1× Sunomono                              │
│                                              │
├──────────────────────────────────────────────┤
│ 🔔  NOVO PEDIDO  #1047 · Marina L.           │
│     ⏱ 02:58  ▓▓▓▓▓▓▓▓░░  R$ 214,00  🛵      │
│     📝 tem observação                        │
│  [ Silenciar 30s ]            [ VER PEDIDO ] │
└──────────────────────────────────────────────┘
```

#### Design sonoro

| Evento | Som | Repetição | Silenciável? |
|---|---|---|---|
| Novo pedido | 3 notas ascendentes, 900 ms, ~1,2 kHz (corta ruído de cozinha) | a cada 12 s enquanto houver `pending`, escalando | Só por 30 s, nunca permanentemente |
| Novo pedido — escalada | mesmo som, +6 dB, intervalo 6 s após 60% do SLA | contínuo | Não |
| SLA a 30 s do fim | pulso duplo grave, insistente | a cada 5 s | Não |
| Mensagem do cliente | clique curto, 300 ms | 1× por mensagem, agrupado a cada 10 s | Sim |
| Cancelamento pelo cliente | nota descendente | 1× | Não |
| Falha de impressão | buzz curto | 1× por falha | Sim |
| Timer de preparo estourou | sino leve | 1× | Sim |

**Política de volume e mute:**

- Volume é **por dispositivo**, persistido localmente, com **mínimo de 40%**. Não existe 0%.
- "Silenciar tudo" não existe. Existe **"Modo silencioso (15 min)"**, que exige `store:pause` ou superior, registra no log de auditoria e mostra banner vermelho persistente `🔇 Som desativado — volta em 12 min`.
- **Autoplay:** na primeira interação após o login, exibir o card `Ativar som do painel` com botão. Sem esse gesto o áudio não toca, e a UI mostra `🔕 Som bloqueado pelo navegador — toque para ativar` em vermelho no topo. **Nunca falhar em silêncio.**

**Aba em segundo plano** (o operador vai abrir o WhatsApp Web, o PDV, o Instagram). Quando `document.hidden === true`:

1. O som continua (Web Audio não é suspenso se houve gesto do usuário).
2. **Título da aba** alterna a cada 1 s: `(3) NOVO PEDIDO ⏱ 02:58` ↔ `Matsuya · Painel`.
3. **Favicon com badge** numérico gerado em canvas.
4. **Notification API** (uma por pedido, `renotify: true`, `requireInteraction: true`); o clique foca a aba e abre o pedido.
5. Ao voltar ao foco, um **resumo de reentrada**: `Enquanto você estava fora: 2 pedidos novos, 1 chat, 1 pedido expirou`.

**Wake lock:** solicitar `navigator.wakeLock` ao entrar no board e re-solicitar em `visibilitychange`. Se negado, exibir em Configurações: `⚠ A tela pode apagar neste dispositivo. Ajuste o tempo de bloqueio nas configurações do tablet.` Em modo quiosque o wake lock é pré-requisito, e a ausência dele aparece na barra de status.

### 3.5 Aceite e recusa com SLA

**Linguagem visual do timer.** É o elemento de maior contraste do card. Três zonas, com mudança **de forma além da cor** (daltonismo é comum e a cozinha é mal iluminada):

| Zona | Tempo restante | Cor | Forma | Tipografia |
|---|---|---|---|---|
| Tranquilo | > 60% do SLA | Verde-azulado | Barra fina | Regular |
| Atenção | 25–60% | Âmbar | Barra grossa + borda do card âmbar | Semibold |
| Crítico | < 25% ou < 45 s | Vermelho | Barra grossa + **pulso do card a 1 Hz** | Bold, +2 pt |

Formato `MM:SS`, decrescente. Nunca crescente para SLA de aceite — crescente não comunica escassez.

**SLA padrão:** 5 min para `delivery`, 3 min para `pickup`. Configurável por unidade dentro de limites definidos pelo Corporate.

**Auto-aceite — recomendação: oferecer, com trava.** É útil no pico e é o que operadores pedem. Os riscos são reais (aceitar fora de área, com item em falta, com a loja lotada). Mitigação:

| Regra | Comportamento |
|---|---|
| Exige `orders:autoaccept` | padrão: só gerente ativa |
| **Nunca** auto-aceita se | `notes` não vazio · item marcado indisponível · `paymentStatus !== 'paid'` em `pix`/`card` · total acima de um teto · cliente com histórico de cancelamento · endereço fora do raio → cai para aceite manual com badge `Requer revisão` |
| Desliga sozinho | se 3 pedidos entrarem em atraso de preparo: `Auto-aceite desativado — a fila está atrasada.` |
| Sempre visível | chip persistente no cabeçalho `⚡ Auto-aceite ON (25 min)`. Nunca um estado invisível |
| Auditável | cada auto-aceite grava `actor: system` com o motivo no histórico |

**Quando o SLA expira — não recusar automaticamente.** Recusa automática destrói NPS e é irreversível.

1. Aos 0:00 o card **não some**. Vira `Expirado` no topo do rail, borda vermelha, e o timer passa a contar crescente: `⏱ +01:12 atrasado`.
2. O cliente recebe um push único: *"Estamos com alto volume. Já já confirmamos seu pedido."*
3. **Escalada ao gerente aos +2 min**: push + e-mail aos usuários com `orders:accept` e escopo da unidade; o pedido aparece na faixa de Exceções e no dashboard do Store Manager.
4. **Aos +10 min sem ação**, auto-recusa pelo sistema com motivo `REJ_SEM_RESPOSTA_DA_LOJA`, reembolso integral (cartão/Pix estornados, cashback devolvido via `RELEASE`/`REFUND`) e alerta ao Corporate. Esse limite é configurável **só no Corporate**, nunca na unidade.

**Fluxo de recusa.** Recusa é destrutiva e assimétrica (o cliente já foi notificado). Logo: **confirmação, nunca desfazer**.

```
┌──────────────────────────────────────────────┐
│  Recusar pedido #1047 · R$ 214,00            │
├──────────────────────────────────────────────┤
│  Por que está recusando?                     │
│  ○ Loja sem capacidade no momento            │
│  ○ Item indisponível                     ▸   │  ← abre seletor de itens
│  ○ Endereço fora da área de entrega          │
│  ○ Sem entregador disponível                 │
│  ○ Loja fechada / fora do horário            │
│  ○ Pedido duplicado                      ▸   │  ← mostra o pedido gêmeo
│  ○ Suspeita de fraude                        │
│  ● Outro motivo                              │
│    ┌────────────────────────────────────┐    │
│    │ Descreva (obrigatório)             │    │
│    └────────────────────────────────────┘    │
├──────────────────────────────────────────────┤
│  O QUE ACONTECE:                             │
│  • Cliente é avisado agora                   │
│  • 🪙 R$ 30,00 voltam para a carteira        │
│    (mesmo lote, validade preservada)         │
│  • 💳 R$ 90,00 estornados no cartão          │
│    (até 2 dias úteis)                        │
│  • Cupom BEMVINDO10 volta a ficar disponível │
├──────────────────────────────────────────────┤
│         [ Voltar ]     [ RECUSAR PEDIDO ]    │
└──────────────────────────────────────────────┘
```

O botão de confirmação só habilita após a escolha do motivo; `Outro motivo` exige texto com ≥ 10 caracteres. Requer `orders:reject`.

### 3.6 Vista de preparo

Abre como **drawer lateral de 480 px** em telas ≥ 1024 px — o board continua visível à esquerda. Em tablet retrato, tela cheia com o rail flutuante preservado.

```
┌──────────────────────────────────────────────────────────┐
│ ← #1042  Ana Paula S.        🛵 Entrega    💬 2   ⋯      │
│ ⏱ 08:12 / 25:00  ▓▓▓▓▓▓▓░░░░░░░░  Prev. saída 12:51     │
├──────────────────────────────────────────────────────────┤
│ 📝 OBSERVAÇÃO DO CLIENTE                                 │
│    "Sem cebola em nada, alergia. Interfone quebrado,     │
│     ligar ao chegar."                                    │
├──────────────────────────────────────────────────────────┤
│ ITENS                                    ✔ 1 de 3        │
│ ▣ 1× Combo Matsuya 20 peças              R$ 89,00        │
│ ▢ 2× Temaki Salmão                       R$ 58,00        │
│      + Cream cheese extra              + R$  6,00        │
│      − Sem cebolinha                                     │
│      ⚠ Indisponível?  [ Substituir ] [ Cancelar item ]   │
│ ▢ 1× Sunomono                            R$ 18,00        │
├──────────────────────────────────────────────────────────┤
│ PAGAMENTO                                                │
│ Subtotal            R$ 165,00                            │
│ Taxa de entrega     R$   9,00                            │
│ Desconto (BEMVINDO10) −R$ 14,00                          │
│ 🪙 Cashback usado   −R$  30,00                           │
│ ─────────────────────────────                            │
│ Total               R$ 130,00   💳 Cartão ✔ aprovado     │
│ A COBRAR NA ENTREGA R$   0,00                            │
│ Cashback a creditar R$   2,60 (Prata 2%)                 │
├──────────────────────────────────────────────────────────┤
│ ENTREGA                                                  │
│ Rua Tomás Gonzaga, 78 — apto 42                          │
│ Liberdade · São Paulo/SP · 01506-020                     │
│ Ref.: portão azul ao lado da farmácia                    │
│ 📞 (11) 91234-5678        🗺 Abrir no mapa               │
├──────────────────────────────────────────────────────────┤
│ [ 🖨 Reimprimir ] [ ⏱ Informar atraso ] [ MARCAR PRONTO ] │
└──────────────────────────────────────────────────────────┘
```

**Checklist de itens.** Toque marca/desmarca. É **local ao dispositivo e não bloqueante** — nunca impedir "Marcar pronto" por checklist incompleto, o que só criaria o hábito de marcar tudo de uma vez e destruiria o valor. Em vez disso: `2 itens não conferidos. Marcar pronto mesmo assim?` com `[Conferir] [Sim, está pronto]`.

**Timer de preparo.** Conta **crescente** contra o ETA prometido (`08:12 / 25:00`). Ao ultrapassar, vira `⏱ +03:40 acima do previsto` em vermelho e o pedido sobe ao topo da coluna.

**Informar atraso / ajustar ETA:**

```
Informar atraso — #1042
Novo tempo de preparo:  [ +5 ] [ +10 ] [ +15 ] [ +20 ] min   (+ campo livre)
Motivo (vai para o cliente):
  ○ Alto volume de pedidos agora
  ○ Item precisou ser refeito
  ○ Aguardando entregador
  ○ Não informar motivo
☑ Avisar o cliente pelo app        (padrão marcado)
[ Cancelar ]  [ Confirmar novo prazo ]
```

Requer `orders:eta:write`. Cada ajuste entra no histórico; mais de 2 ajustes no mesmo pedido geram alerta ao gerente.

**Marcar pronto → despacho:**

- **Retirada:** `MARCAR PRONTO` → coluna `Prontos` → push ao cliente → `Cliente chegou · Entregar` → `delivered`, opcionalmente com confirmação do código de 4 dígitos exibido no app do cliente.
- **Entrega:** `MARCAR PRONTO` → `ready` → painel de despacho:

```
Despachar #1042
  ○ Entregador próprio
     ▸ Rafael Souza    · livre       · 3 entregas hoje
     ▸ Camila Dias     · em rota (2) · volta em ~12 min
     ▸ + Cadastrar entregador
  ○ Entregador da praça (integração)   [ Chamar ]   ⏱ busca ~2 min
  ○ Retirado pelo próprio cliente
[ Confirmar despacho ]
```

Ao confirmar: `out_for_delivery`, imprime a via de entrega, e o cliente recebe push com nome e telefone do entregador. Requer `courier:assign`. Sem atribuição em 5 min, o pedido vai para Exceções como `Sem entregador`.

### 3.7 Painel de chat

Terceira coluna (360 px) à direita do drawer em ≥ 1440 px; em telas menores, aba dentro do drawer (`Preparo | Chat (2)`).

```
┌────────────────────────────────────────┐
│ 💬 Chat · #1042 · Ana Paula S.         │
│ Você está respondendo · João S.        │  ← presença
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │ Boa noite! Dá pra tirar a cebola │  │
│  │ do temaki?                12:38  │  │
│  └──────────────────────────────────┘  │
│      ┌──────────────────────────────┐  │
│      │ Claro! Já anotamos aqui.     │  │
│      │ João · 12:39            ✓✓   │  │
│      └──────────────────────────────┘  │
│  ⓘ Prazo de preparo alterado para      │
│    35 min por João S. · 12:41          │  ← evento do sistema
├────────────────────────────────────────┤
│ RESPOSTAS RÁPIDAS                    ▸ │
│ [Confirmado] [Já saiu] [+10 min] [...] │
├────────────────────────────────────────┤
│ ┌────────────────────────────────┐ 📎 │
│ │ Escreva uma mensagem…          │ ➤  │
│ └────────────────────────────────┘     │
└────────────────────────────────────────┘
```

**Respostas rápidas (texto pt-BR definitivo):**

| Atalho | Mensagem |
|---|---|
| Confirmado | `Olá! Recebemos seu pedido e já começamos o preparo. 😊` |
| Prazo | `Seu pedido deve ficar pronto em cerca de {X} minutos.` |
| +10 min | `Estamos com um volume maior de pedidos agora. Seu pedido vai atrasar cerca de 10 minutos. Desculpe pelo transtorno!` |
| Item em falta | `Infelizmente o item {ITEM} acabou agora. Podemos substituir por {SUGESTÃO} ou cancelar só esse item e devolver o valor. Como prefere?` |
| Saiu para entrega | `Seu pedido saiu para entrega com {ENTREGADOR}. Chega em aproximadamente {X} minutos! 🛵` |
| Confirmar endereço | `Você pode confirmar o endereço e o complemento, por favor? Queremos entregar certinho.` |
| Interfone | `Nosso entregador está na porta e não conseguiu chamar no interfone. Você pode descer ou nos passar outra referência?` |
| Pronto p/ retirada | `Seu pedido está pronto para retirada no balcão! Estamos te esperando. 🏠` |
| Observação anotada | `Anotamos sua observação e já repassamos para a cozinha. 👍` |
| Agradecimento | `Obrigado pela preferência! Qualquer coisa, é só chamar por aqui. 🙏` |
| Cancelamento | `Seu pedido foi cancelado e o valor será devolvido. O cashback volta para sua carteira na hora e o cartão em até 2 dias úteis.` |

Os placeholders `{X}`, `{ITEM}` etc. abrem preenchimento inline antes do envio — **nunca vão literais**.

**Regras do chat:**

- Tempo real por WebSocket; indicador `digitando…`; `✓` enviado, `✓✓` lido.
- **Não lidas:** badge no card (`💬 2`), no cabeçalho do board (`💬 5`), e som agrupado. Chat sem resposta há mais de 3 min entra em Exceções.
- **Presença multioperador:** ao abrir o chat, o operador "assume" a conversa por 90 s (renovado enquanto digita). Outro operador vê `Camila está respondendo…` e o campo fica somente-leitura, com botão `Assumir mesmo assim` (registrado no log).
- **Anexos:** o cliente pode enviar **imagem** (≤ 5 MB, jpg/png/heic) — útil para foto de item errado. O operador **só envia texto**. Nada de PDF, áudio ou localização na v1: reduz superfície de risco (LGPD, malware) sem caso de uso comprovado. Imagens recebidas passam por varredura e expiram em 90 dias.
- **Auditoria:** toda mensagem grava `orderId`, `actorId`, `actorName`, `role`, `unitId`, `ip`, `sentAt`, `channel`. Eventos de sistema (mudança de status, ETA, cancelamento) entram como mensagens de sistema no mesmo fio — cliente e Corporate veem a mesma linha do tempo. O chat é **imutável**: não existe apagar mensagem; existe `ocultar` com motivo (`chat:moderate`), preservando o registro na auditoria.

### 3.8 Cancelamento e fluxos de problema

#### Item indisponível — o fluxo mais comum

```
Item indisponível — 2× Temaki Salmão (R$ 58,00)
  ○ Substituir por outro item          ▸ [buscar no cardápio]
  ○ Cancelar só este item              → devolve R$ 58,00
  ○ Reduzir quantidade                 → 2 ▾ para 1 ▾
  ○ Cancelar o pedido inteiro
☑ Avisar o cliente e aguardar resposta (2 min)     ← padrão
☐ Marcar como indisponível no cardápio hoje
```

- **Substituir:** se o substituto for mais barato, a diferença volta como reembolso; se for mais caro, **a diferença é absorvida pela loja** — nunca cobrar a mais sem novo consentimento de pagamento. A UI diz isso: `Diferença de R$ 4,00 será absorvida pela loja.`
- **Cancelamento parcial:** o item fica riscado com `Cancelado · Item indisponível`, o total é recalculado, e a devolução segue a **ordem inversa de pagamento** — primeiro o cashback usado (via `RELEASE`/`REFUND` no lote original), depois cartão/Pix. Isso precisa aparecer antes de confirmar.
- `Avisar o cliente e aguardar` envia a resposta rápida e coloca o pedido em `Aguardando cliente` por 2 min com contador visível; sem resposta, cai na opção escolhida.

#### Taxonomia de motivos

**Recusa (antes do aceite) — `orders:reject`:**

| Código | Rótulo |
|---|---|
| `REJ_SEM_CAPACIDADE` | Loja sem capacidade no momento |
| `REJ_ITEM_INDISPONIVEL` | Item indisponível |
| `REJ_FORA_DA_AREA` | Endereço fora da área de entrega |
| `REJ_SEM_ENTREGADOR` | Sem entregador disponível |
| `REJ_LOJA_FECHADA` | Loja fechada / fora do horário |
| `REJ_PEDIDO_DUPLICADO` | Pedido duplicado |
| `REJ_SUSPEITA_FRAUDE` | Suspeita de fraude |
| `REJ_SEM_RESPOSTA_DA_LOJA` | Sem resposta da loja (automático) |
| `REJ_OUTRO` | Outro motivo (texto obrigatório) |

**Cancelamento (após o aceite) — `orders:cancel`:**

| Código | Rótulo |
|---|---|
| `CAN_ITEM_INDISPONIVEL` | Item indisponível |
| `CAN_CLIENTE_DESISTIU` | Cliente desistiu |
| `CAN_CLIENTE_SOLICITOU` | Cliente pediu o cancelamento |
| `CAN_ERRO_NO_PREPARO` | Erro no preparo |
| `CAN_ATRASO_EXCESSIVO` | Atraso excessivo |
| `CAN_ENDERECO_INCORRETO` | Endereço incorreto ou incompleto |
| `CAN_SEM_ENTREGADOR` | Sem entregador disponível |
| `CAN_PROBLEMA_PAGAMENTO` | Problema no pagamento |
| `CAN_PEDIDO_TESTE` | Pedido de teste interno |
| `CAN_FORCA_MAIOR` | Força maior (energia, clima, segurança) |
| `CAN_OUTRO` | Outro motivo (texto obrigatório) |

**Falha na entrega — `orders:delivery:fail`:**

| Código | Rótulo |
|---|---|
| `ENT_CLIENTE_AUSENTE` | Cliente ausente |
| `ENT_NAO_LOCALIZADO` | Endereço não localizado |
| `ENT_CLIENTE_RECUSOU` | Cliente recusou o pedido |
| `ENT_ACESSO_NEGADO` | Acesso negado (portaria/condomínio) |
| `ENT_PROBLEMA_ENTREGADOR` | Problema com o entregador |
| `ENT_AREA_DE_RISCO` | Área de risco |

#### Painel de consequências

Todo cancelamento (total ou parcial) mostra o que vai acontecer — **nunca escondido atrás de um "ok"**:

```
┌ CONSEQUÊNCIAS DO CANCELAMENTO ─────────────────────┐
│ Valor a devolver                        R$ 130,00  │
│ 🪙 Cashback usado → volta à carteira    R$  30,00  │
│    lote de 12/07/2026 · validade 12/01/2027        │
│ 💳 Cartão → estorno                     R$ 100,00  │
│    prazo do banco: até 2 dias úteis                │
│ 🎟 Cupom BEMVINDO10 → volta a ficar disponível     │
│ ⚠ Cashback a creditar (R$ 2,60) será cancelado     │
│ ⓘ Esta ação não pode ser desfeita.                 │
└────────────────────────────────────────────────────┘
```

#### Quem pode cancelar, e quando

| Estado | Cliente | Operador (`unit`) | Gerente | Corporate (`network`) |
|---|---|---|---|---|
| `pending` | Sim, livre | Sim (é recusa) | Sim | Sim |
| `confirmed` | Sim, até 2 min | Sim | Sim | Sim |
| `preparing` | Não — abre chat | Sim | Sim | Sim |
| `ready` / `awaiting_courier` | Não | Sim, com motivo obrigatório | Sim | Sim |
| `out_for_delivery` | Não | **Não** | Sim | Sim |
| `delivered` | Não | Não | Não — só reembolso | Sim (reembolso + auditoria) |
| Após 24 h de `delivered` | — | — | — | Sim, com dupla aprovação |

Cancelamento parcial segue a mesma tabela, com um limite adicional: **acima de 40% do valor do pedido, exige permissão de gerente**.

### 3.9 Atalhos de teclado

Válidos no board e no drawer; nunca disparam com foco em campo de texto.

| Tecla | Ação | Contexto |
|---|---|---|
| `Espaço` | Abrir/expandir o pedido em foco | Board |
| `↑ ↓` | Navegar pedidos na coluna | Board |
| `← →` | Trocar de coluna | Board |
| `A` | Aceitar o pedido em foco (abre confirmação) | Entrada |
| `R` | Recusar (abre seletor de motivo) | Entrada |
| `P` | Marcar pronto | Preparo |
| `D` | Despachar / atribuir entregador | Prontos |
| `E` | Entregue | Em rota / Prontos |
| `C` | Abrir chat do pedido | Qualquer |
| `I` | Imprimir / reimprimir | Detalhe |
| `T` | Informar atraso | Preparo |
| `1…9` | Marcar/desmarcar o item N no checklist | Preparo |
| `/` | Busca rápida (nº, nome, telefone) | Global |
| `F` | Alternar tela cheia / quiosque | Global |
| `M` | Silenciar 30 s | Global |
| `Esc` | Fechar drawer / cancelar diálogo | Global |
| `?` | Abrir a tabela de atalhos | Global |

Ações destrutivas **nunca** executam direto pelo atalho — sempre abrem o diálogo. Um overlay de atalhos aparece automaticamente na 1ª e na 3ª sessão do usuário; depois, só por `?`.

### 3.10 Quiosque, tema, densidade e consciência multioperador

**Quiosque / tela cheia.** `F` ou `⛶` entra em `requestFullscreen()` + wake lock + supressão da navegação (sem sidebar, sem breadcrumb). Sair exige segurar `Esc` por 2 s, ou o PIN do operador se a unidade tiver `kioskLock` — evita que um cliente no balcão feche o painel. Instalável como PWA para virar app dedicado no tablet.

**Tema escuro é o padrão do Order Hub** (claro é o padrão das outras duas apps). O painel fica ligado 12 h em iluminação irregular; fundo claro em tela grande no balcão ofusca e cansa; e o escuro faz as cores de status saltarem com muito menos saturação, reduzindo o "efeito árvore de Natal". **Exceção: a área de impressão e a pré-visualização do cupom são sempre claras.** Alternância manual disponível e persistida por dispositivo. Contraste mínimo AA em ambos os temas.

**Densidade.** Três níveis, persistidos por dispositivo, com padrão derivado do viewport:

| Nível | Padrão em | Card mostra |
|---|---|---|
| Confortável | ≥ 1440 px | Até 3 itens + todas as flags + endereço resumido |
| Compacto | 1024–1439 px | Até 2 itens + flags críticas |
| Denso | Escolha manual, no pico | Só cabeçalho + flags + total (12 cards de uma vez) |

Mesmo em "Denso", `📝 OBSERVAÇÃO` e a linha "a cobrar na entrega" **nunca** são suprimidos.

**Consciência multioperador.** Numa unidade há 2 a 4 pessoas no painel ao mesmo tempo. Sem isso, dois operadores aceitam ou cancelam o mesmo pedido.

- Cada card mostra avatares de 20 px de quem está **olhando** (`👁 CD`) e contorno sólido de quem está **agindo**.
- **Lock otimista:** abrir um diálogo destrutivo trava o pedido por 45 s para os demais, que veem `Camila está recusando este pedido…` e o botão desabilitado.
- Se dois cliques colidirem, quem perder vê um toast **não bloqueante**: `Este pedido já foi aceito por Camila D. há instantes.` e o card se atualiza sozinho — sem modal de erro.
- O cabeçalho lista quem está online: `👥 3 online`.
- Toda transição grava o operador; o histórico mostra `Aceito por João S. · 12:34`.

### 3.11 Estados degradados

| Situação | O que o operador vê | Ação oferecida |
|---|---|---|
| **Sem pedidos** | `Nenhum pedido no momento.` / `Assim que chegar um pedido novo, você ouve o alerta.` + chips de status (`🔔 Som ativo · 🖨 Impressora OK`) — o vazio é o momento certo de confirmar que o sistema está armado | `Fazer um pedido de teste` (se `orders:test`) |
| **Conexão perdida** | Barra vermelha fixa: `⚠ Sem conexão — tentando reconectar… (12s)`. Board dessaturado com carimbo `Dados de 12:41`. Ações destrutivas desabilitadas; aceites feitos offline entram em fila local com badge `pendente de envio` | `Tentar agora`, `Ver fila de envio` |
| **Reconectado** | Barra verde por 4 s: `Conexão restabelecida. 2 pedidos novos chegaram.` + resumo de reentrada | — |
| **Impressora offline** | Chip vira `🖨 Impressora offline` vermelho. Cada aceite abre `Não foi possível imprimir o pedido #1047.` com pré-visualização em tela cheia | `Tentar de novo`, `Ver na tela`, `Trocar de impressora`, `Continuar sem imprimir` |
| **Pedido travado** | Preparo > ETA+10 min, `awaiting_courier` > 5 min, ou chat sem resposta > 3 min sobe para Exceções com o motivo em texto: `#1019 · sem entregador há 9 min` | Ação contextual + `Escalar ao gerente` |
| **Pagamento pendente** | Card em rail separado `Aguardando pagamento (2)`, **sem som e sem SLA**: `Pix gerado há 3 min · expira em 12 min`. Não entra na cozinha | `Ver`, `Cancelar por falta de pagamento` (só após expirar) |
| **Pagamento falhou após o aceite** | Volta para Exceções, borda vermelha: `⚠ Pagamento não aprovado — pedido já em preparo` | `Falar com o cliente`, `Cancelar pedido`, `Cobrar na entrega` (se `orders:payment:override`) |
| **Suspeita de duplicidade** | Ao aceitar, se houver outro pedido do mesmo cliente, mesmo total ± R$ 1, nos últimos 10 min: `Possível pedido duplicado. Este pedido é muito parecido com o #1046, feito há 4 minutos.` com os dois lado a lado | `São diferentes, aceitar`, `Ver #1046`, `Recusar como duplicado` |
| **Loja fechada mas chegam pedidos** | Banner vermelho: `A loja está marcada como FECHADA e 2 pedidos chegaram.` — indica erro de horário ou de pausa | `Abrir a loja agora`, `Ver horários`, `Recusar os pedidos` |
| **Loja pausada** | Banner âmbar com contador: `⏸ Delivery pausado — volta em 08:12` | `Retomar agora`, `+15 min` |
| **Sessão expirando** | Aviso 2 min antes com contador; **nunca deslogar em silêncio no meio do pico** | `Continuar conectado` |

---

## 4. Empréstimos de padrão — e o que fazemos melhor

| Padrão do mercado | Origem | Adotamos? | O que fazemos melhor |
|---|---|---|---|
| Som insistente com escalada no novo pedido | iFood | Sim, integralmente | Sons distintos por evento (hoje tudo soa igual e o operador ignora) e política de mute que impede silêncio permanente |
| Colunas por estágio | Uber Eats Manager | Sim, mas só 3 colunas de trabalho | Rail de Entrada fixo e separado — o pedido novo nunca é "mais uma coluna" |
| Modal bloqueante de novo pedido | iFood, Rappi | **Não** | Coluna persistente + barra âncora: o operador decide sem perder o contexto do pedido que está montando |
| Checklist de itens no preparo | Rappi Partner | Sim | Não bloqueante — checklist obrigatório vira ritual vazio |
| Respostas rápidas no chat | iFood | Sim | Placeholders preenchíveis (`{X} minutos`) em vez de textos genéricos, e eventos de sistema no mesmo fio |
| Motivo de cancelamento por lista | Todos | Sim | **Painel de consequências antes de confirmar** — mostrar cashback, estorno e cupom é o que nenhum concorrente faz |
| Pausar loja | iFood | Sim | Pausa com previsão de retorno visível ao cliente e retomada automática, em vez de pausa esquecida ligada |
| Auto-aceite | iFood | Sim, com trava | Desliga sozinho quando a fila atrasa e nunca auto-aceita pedido com observação ou item em falta |
| Tema claro fixo | Todos | **Não** | Escuro por padrão no balcão, por fadiga visual e legibilidade das cores de status |
