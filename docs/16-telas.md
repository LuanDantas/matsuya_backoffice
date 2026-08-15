# 16 — Inventário de telas

> PARTE 16 do briefing. Formato por tela: **Nome · Objetivo · Usuários · Informações · Ações · Filtros · Permissões · Estados · Erros**.
>
> Os estados padrão são `loading / empty / error / partial / offline`; só anotamos o que foge do padrão. Fusões deliberadas de telas que o briefing listou separadas estão marcadas com **⊕** e justificadas.
>
> As chaves de permissão seguem a convenção de [15 — RBAC](./15-rbac.md); toda tela do Store Manager e do Order Hub é avaliada com escopo `unit:{id}`.

**Totais:** Corporate 36 · Store Manager 18 · Order Hub 12.

---

## 1. Corporate / Matriz — 36 telas

### Acesso e visão geral

**C-01 · Login e autenticação**
Autenticar com MFA. · Todos. · E-mail/senha, MFA, recuperação. · Entrar, esqueci a senha, validar código. · — · pública. · loading/error. · Credenciais inválidas, MFA inválido, conta bloqueada, usuário sem escopo.

**C-02 · Dashboard executivo**
Saúde da rede num relance. · Diretoria, admin, ops, gerente regional. · GMV, nº de pedidos, ticket médio, taxa de cancelamento/recusa, tempo médio de preparo e entrega, NPS, cashback emitido vs. resgatado, top/bottom unidades, série temporal. · Drill em qualquer card → lista filtrada; exportar; comparar período. · Escopo (rede/grupo/unidade), período, tipo de entrega, canal. · `dashboard:view` (+ `finance:view` para GMV/margem). · partial (unidade sem dados). · Janela sem dados, agregação atrasada, timeout.

**C-03 · Dashboard financeiro**
Dinheiro por unidade e por meio de pagamento. · Financeiro, diretoria. · Receita bruta/líquida, taxa de entrega arrecadada, descontos, cashback usado/gerado, repasses, split por `paymentMethod`, estornos, conciliação Mercado Pago. · Exportar CSV/XLSX, abrir divergências, marcar conciliado. · Escopo, período, meio de pagamento, status de pagamento. · `finance:view`, `finance:reconcile`, `reports:export`. · partial (gateway indisponível). · Divergência de conciliação, gateway fora do ar, período > 12 meses.

**C-04 · Comparativo de unidades**
Ranquear e achar outliers. · Ops, gerente regional, diretoria. · Tabela por unidade: pedidos, GMV, ticket, % cancelamento, % recusa, SLA de aceite, tempo de preparo, NPS, avaliações. Heatmap. · Ordenar, fixar unidades, exportar, abrir unidade. · Escopo, período, grupo/região, métrica de ordenação. · `dashboard:view`, `reports:export`. · — · Unidade nova sem histórico.

### Operação

**C-05 · Pedidos da rede**
Buscar qualquer pedido da rede. · Suporte, ops, financeiro. · Tabela: nº, unidade, cliente, status, `deliveryType`, total, `cashbackUsed`, `paymentMethod`/`paymentStatus`, criado em, SLA. · Abrir, exportar, cancelar/reembolsar (com permissão), reenviar notificação. · Escopo, período, status (multi), meio/status de pagamento, tipo de entrega, com cashback, com cupom, com observação, faixa de valor, busca livre. · `orders:read`, `orders:cancel`, `orders:refund`, `reports:export`. · empty com filtros ativos → oferecer limpar. · Busca sem resultado, filtro incompatível, export grande (vira job).

**C-06 · Detalhe do pedido (rede)**
Investigar um pedido ponta a ponta. · Suporte, ops, financeiro. · Agregado completo: itens + `optionsSnapshot`, `notes`, `addressSnapshot`, valores, cupom, cashback usado/gerado **com os lotes de origem**, linha do tempo de `statusEvents` com ator, transcrição do chat, avaliação, entregador, logs de impressão e de pagamento. · Cancelar, reembolsar, ajustar cashback, reenviar recibo, abrir cliente/unidade, copiar link. · — · `orders:read`; ações: `orders:cancel`, `orders:refund`, `cashback:adjust`; PII sob `customers:pii:read`. · partial (chat/gateway indisponível). · Pedido inexistente, sem escopo para a unidade, estorno recusado pelo gateway.

**C-07 · Unidades**
Governar a rede física. · Ops, admin. · Lista/mapa: nome, grupo/região, status (aberta/fechada/pausada), pedidos hoje, SLA, catálogo divergente, versão do painel. · Criar, editar, ativar/desativar, abrir Portal da Unidade, exportar. · Grupo/região, status, cidade, tem delivery, divergência de catálogo. · `units:read`, `units:write`. · — · Nome/CNPJ duplicado, unidade com pedidos ativos ao desativar.

**C-08 · Detalhe da unidade** **⊕**
Ficha e configuração central da unidade. **Absorve "editar unidade" e "configurações centrais da unidade"** — separá-las obrigaria o operador a alternar entre duas telas para um único ato de configuração. · Ops, admin. · Dados cadastrais, endereço/coordenadas, horários, contatos, meios de pagamento habilitados, SLA e limites máximos, entregadores, integrações, impressoras. · Salvar, travar campos para a unidade, forçar fechamento, ver auditoria. · — · `units:read`, `units:write`, `units:lock`. · — · CEP inválido, geocodificação falhou, horário conflitante.

**C-09 · Grupos e regiões**
Agrupar unidades para escopo e relatório. · Ops, admin. · Árvore de grupos/regiões, unidades por grupo, responsáveis. · Criar/editar/excluir grupo, mover unidade, atribuir responsável. · Busca. · `units:write`, `roles:manage`. · empty. · Ciclo na hierarquia, grupo com unidades ao excluir.

**C-10 · Zonas de entrega (rede)**
Padrões de raio, taxa e mínimo. · Ops. · Mapa com polígonos/raios por unidade, taxa, pedido mínimo, ETA, sobreposições. · Criar/editar zona, aplicar modelo a várias unidades, travar. · Escopo, cidade. · `delivery:zones:write`, `units:lock`. · — · Polígono inválido, zonas sobrepostas, região sem cobertura.

### Catálogo

**C-11 · Catálogo mestre — Produtos**
Fonte de verdade dos itens. · Marketing, ops, admin. · Lista: nome, categoria, preço sugerido, imagem, ativo, campos travados, nº de unidades que publicam, divergências. · Criar, editar, duplicar, ativar/desativar em massa, travar campos, publicar. · Categoria, ativo, travado, com divergência, sem imagem, busca. · `catalog:read`, `catalog:write`, `catalog:price:write`, `catalog:lock`. · partial (imagem faltando). · SKU duplicado, imagem grande, produto em pedidos ativos ao desativar.

**C-12 · Detalhe do produto mestre**
Editar item e definir o que a unidade pode mudar. · Marketing, ops. · Dados, preço sugerido, imagens, alérgenos, grupos de opções, matriz de travas por campo, disponibilidade por unidade, histórico de preço. · Salvar, travar/destravar campo, vincular grupos de opções, publicar, ver divergências. · — · `catalog:write`, `catalog:price:write`, `catalog:lock`. · — · Preço ≤ 0, grupo obrigatório sem opção ativa, conflito de edição concorrente.

**C-13 · Categorias mestre**
Organizar e ordenar o cardápio. · Marketing. · Lista ordenável, nº de produtos, ativa, visibilidade por unidade. · Criar, renomear, reordenar (drag), ativar/desativar, publicar. · Ativa, busca. · `catalog:write`. · — · Categoria com produtos ao excluir, posição duplicada.

**C-14 · Grupos de opções (adicionais)**
Padronizar adicionais. · Marketing, ops. · Grupos com `min/max/required`, opções com `priceDelta`, produtos vinculados. · Criar/editar grupo e opções, reordenar, vincular produtos, travar preço. · Obrigatório, busca. · `catalog:write`, `catalog:price:write`. · — · `min > max`, grupo obrigatório sem opções, exclusão de opção usada em pedido ativo.

**C-15 · Publicação do catálogo**
Levar o mestre às unidades com controle. · Ops, admin. · Diff por unidade: o que muda, o que está travado, o que a unidade sobrescreveu, impacto em preço. · Selecionar unidades, simular, publicar, agendar, reverter. · Escopo, tipo de mudança. · `catalog:publish`. · partial (unidade offline). · Conflito com override local, publicação parcial, rollback indisponível após X h.

### Fidelidade e cashback

**C-16 · Planos e níveis**
Configurar Bronze/Prata/Ouro. · Marketing, admin. · Planos, % de cashback (1/2/3), limiar de gasto acumulado, benefícios vinculados, nº de assinantes por nível. · Criar/editar plano, ajustar % e limiar, ativar/desativar, simular impacto. · Ativo. · `loyalty:plans:write`. · — · Limiares sobrepostos, redução de % com assinantes ativos (exige confirmação e aviso legal).

**C-17 · Benefícios**
Gerir vantagens por plano. · Marketing. · Lista de benefícios, planos vinculados, período, uso. · Criar/editar/ativar/desativar, vincular a plano, reordenar. · Plano, ativo. · `loyalty:benefits:write`. · — · Benefício sem plano, texto acima do limite.

**C-23 · Cashback — Configuração do programa**
Definir as regras do dinheiro. · Diretoria, financeiro, admin. · % por nível, validade dos lotes, teto de uso por pedido, arredondamento, regra de expiração, elegibilidade por canal, regra de estorno. · Editar, simular impacto, publicar com data de vigência. · — · `cashback:config:write`. · — · Mudança retroativa bloqueada, teto incoerente, exige dupla aprovação.

**C-24 · Cashback — Razão (ledger)**
Auditar cada centavo. · Financeiro, suporte, auditoria. · Entradas: tipo (`CREDIT/DEBIT/RESERVE/RELEASE/REFUND/EXPIRE/ADJUSTMENT`), valor, lote, validade, saldo resultante, pedido/ator de origem, unidade. · Abrir cliente/pedido, exportar, filtrar por lote. · Escopo, período, tipo de entrada, cliente, pedido, faixa de valor, a expirar em N dias. · `cashback:read`, `reports:export`. · — · Saldo inconsistente (exibe alerta de reconciliação), export grande.

**C-25 · Cashback — Ajuste manual**
Corrigir com trilha. · Financeiro, suporte sênior. · Saldo atual e lotes do cliente, campo de valor, motivo obrigatório (taxonomia), pré-visualização do saldo novo, histórico de ajustes do cliente. · Creditar, debitar, expirar lote, confirmar em duas etapas. · — · `cashback:adjust` (+ `cashback:adjust:high` acima do teto). · — · Acima do limite do papel, saldo insuficiente, motivo ausente. **Auditoria obrigatória: ator, motivo, valor antigo/novo, IP, timestamp.**

**C-26 · Assinantes**
Base do programa de fidelidade. · Marketing, suporte. · Cliente, nível, gasto acumulado, progresso para o próximo nível, cashback disponível/a expirar, último pedido, unidade preferida. · Abrir cliente, exportar, ajustar nível (com permissão), enviar campanha. · Nível, período de adesão, unidade, com saldo, inativo há N dias. · `loyalty:subscribers:read`, `reports:export`. · — · Export com PII exige justificativa (LGPD).

### Marketing

**C-18 · Cupons (vouchers)**
Emitir e acompanhar cupons. · Marketing, suporte. · Lista: código, tipo, tipo de desconto, valor, validade, uso/limite, unidades, status. · Criar, gerar em lote, cancelar, exportar, ver resgates, reemitir aniversário. · Tipo, status, validade, unidade, canal, busca por código/cliente. · `coupons:read`, `coupons:write`, `reports:export`. · — · Código duplicado, validade no passado, lote grande (vira job).

**C-19 · Tipos de cupons**
Taxonomia dos cupons. · Marketing, admin. · Tipos, regras de emissão, elegibilidade, cupons por tipo. · Criar/editar/ativar. · Ativo. · `coupons:write`. · — · Tipo em uso ao excluir.

**C-20 · Tipos de descontos**
Regras de cálculo (%, valor fixo, frete grátis, item grátis). · Marketing, admin. · Tipos, fórmula, teto, acúmulo com cashback. · Criar/editar/ativar, definir regra de acúmulo. · Ativo. · `coupons:write`. · — · Regra conflitante, desconto > total.

**C-21 · Promoções**
Campanhas por período/unidade. · Marketing. · Lista: nome, período, unidades, público, mecânica, resgates, receita atribuída. · Criar, duplicar, agendar, pausar, encerrar, ver elegibilidade. · Status, período, unidade, público. · `promotions:write`. · — · Sobreposição de promoções, público vazio, promoção sem itens.

**C-22 · Timeline de promoções**
Ver o calendário e evitar colisões. · Marketing, diretoria. · Gantt por unidade/grupo, sobreposições destacadas, marcos. · Arrastar para reagendar, abrir promoção, exportar calendário. · Escopo, período, status. · `promotions:write` (leitura com `dashboard:view`). · empty. · Colisão de campanhas, período > 12 meses.

**C-29 · Avaliações e NPS**
Ouvir o cliente. · Ops, marketing, diretoria. · `orderRating`, `deliveryRating`, tags, comentário, `appScore` (NPS), média por unidade e por item, tendência. · Abrir pedido, responder, marcar tratada, escalar, exportar. · Escopo, período, nota, tags, com comentário, respondida. · `reviews:read`, `reviews:reply`, `reports:export`. · empty. · Comentário moderado, avaliação de pedido excluído.

### Clientes

**C-27 · Clientes (LGPD)**
Base de clientes com privacidade. · Suporte, marketing, admin. · Nome, contato **mascarado por padrão**, nível, nº de pedidos, LTV, status de consentimento. · Revelar PII (com justificativa e log), abrir 360, exportar dados do titular, anonimizar/excluir. · Nível, unidade, período, consentimento, inativo, busca. · `customers:read`, `customers:pii:read`, `customers:export`, `customers:erase`. · partial (PII oculta). · Busca por PII sem permissão, exclusão com pedidos em aberto, prazo legal de retenção.

**C-28 · Cliente 360**
Ver tudo de um cliente. · Suporte, marketing. · Perfil, endereços, pedidos, chats, avaliações, extrato de cashback com lotes, cupons, consentimentos, dispositivos, notas internas. · Abrir pedido, ajustar cashback, emitir cupom de cortesia, anonimizar, adicionar nota. · Período, unidade. · `customers:read`, `customers:pii:read`, `cashback:adjust`, `coupons:write`. · partial. · Cliente anonimizado (mostra tombstone), sem escopo.

### Administração e ferramentas

**C-30 · Usuários e convites**
Quem acessa o quê. · Admin, RH, ops. · Usuários, papéis, escopos, status, último acesso, MFA. · Convidar, editar papel/escopo, suspender, forçar reset de senha, exigir MFA, remover. · Papel, escopo, status, app (Corporate/Unidade/Order Hub). · `users:manage`. · — · E-mail duplicado, remoção do último admin, usuário com sessão ativa.

**C-31 · Papéis e permissões (RBAC)**
Definir o modelo de acesso. · Admin, segurança. · Papéis, matriz papel × chave de permissão, escopo permitido, nº de usuários. · Criar/clonar/editar papel, marcar permissões, simular "ver como", exportar matriz. · Área, papel. · `roles:manage`. · — · Permissão perigosa sem aprovação, papel em uso ao excluir, escalonamento de privilégio bloqueado.

**C-32 · Log de auditoria**
Prova do que aconteceu. · Admin, financeiro, segurança, compliance. · Ator, papel, ação, entidade, valor antigo → novo, escopo, IP, user-agent, timestamp. · Filtrar, abrir entidade, exportar (assinado). · Período, ator, tipo de ação, entidade, unidade, IP. · `audit:read`, `audit:export`. · — · Período muito grande, export exige MFA, **registro imutável — nenhuma edição possível**.

**C-33 · Relatórios e exportações** **⊕**
Catálogo e execução de relatórios. **Funde "relatórios" e "exportações" numa tela com aba de histórico** — separá-las obriga o usuário a navegar para achar o próprio arquivo. · Financeiro, ops, marketing, diretoria. · Relatórios disponíveis (vendas, produtos, cashback, cupons, fidelidade, entregas, avaliações, conciliação), parâmetros, agendamentos, histórico de execuções com status e link. · Executar, agendar, baixar, cancelar job, compartilhar. · Escopo, período, formato, agendados. · `reports:read`, `reports:export`, `reports:schedule`. · loading longo → job assíncrono com progresso. · Timeout (converte em job), volume excessivo, arquivo expirado, export com PII bloqueado.

**C-34 · Validadores (QR)** **⊕**
Confirmar resgates presenciais. **Funde as 4 telas herdadas (cashback / voucher / cupom / promoção) numa só com 4 modos**, porque o fluxo é idêntico — ler código → mostrar dados → escolher unidade → confirmar/rejeitar — e a duplicação atual só multiplica bugs (hoje os validadores de cashback e voucher até divergem no parâmetro de unidade). · Operadores de loja, gerentes. · Código, tipo, cliente, valor/benefício, validade, unidade selecionada, status. · Ler QR/digitar código, validar, confirmar, rejeitar com motivo. · Tipo, unidade. · `validator:use` com escopo de unidade. · loading/error/offline (fila local). · Código inválido/expirado/já usado, cliente inelegível, unidade não autorizada, offline.

**C-35 · Configurações da rede**
Parâmetros globais. · Admin, diretoria. · Marca, SLA padrão, limites que a unidade pode alterar, gateways de pagamento, integrações, políticas de notificação, retenção de dados. · Editar, publicar, ver auditoria. · — · `settings:write`. · — · Configuração inválida, dupla aprovação pendente.

**C-36 · Central de notificações e avisos**
Fila de eventos que exigem atenção. · Todos. · Alertas (SLA estourado, unidade offline, conciliação divergente, pedido escalado), avisos publicados, preferências por canal. · Marcar lida, silenciar tipo, abrir origem, publicar aviso à rede. · Tipo, escopo, lida/não lida, período. · `notifications:read`, `notifications:broadcast`. · empty. · Aviso sem público, canal indisponível.

---

## 2. Store Manager / Portal da Unidade — 18 telas

Todas herdam o **escopo da unidade ativa**; toda permissão é avaliada com escopo `unit:{id}` ou `group:{id}`.

**M-01 · Login e seleção de unidade** **⊕**
Entrar e escolher a unidade. **Se o usuário só tem uma unidade, a seleção é pulada.** · Franqueado, gerente. · Unidades autorizadas com status (aberta/fechada/pausada) e pedidos ativos. · Entrar, escolher unidade, fixar padrão. · Busca. · pública / `units:read`. · loading/error. · Sem unidade autorizada, unidade desativada.

**M-02 · Dashboard da unidade**
Como está o dia. · Franqueado, gerente. · Pedidos hoje/agora, faturamento, ticket médio, tempo médio de preparo e entrega, % cancelamento, SLA de aceite, NPS, itens mais vendidos, comparação com a média da rede. · Abrir Order Hub, drill nos cards, exportar. · Período, tipo de entrega, canal. · `dashboard:view` escopo unidade. · partial. · Sem dados no período, comparação indisponível.

**M-03 · Pedidos da unidade**
Histórico e busca operacional. · Gerente, atendimento. · Tabela de pedidos com status, valores, pagamento, cashback, avaliação. · Abrir, exportar, reimprimir, abrir chat. · Período, status, pagamento, tipo de entrega, com problema, busca. · `orders:read`. · empty com filtros. · Sem resultado, export grande.

**M-04 · Detalhe do pedido (unidade)**
Investigar um pedido. · Gerente, atendimento. · Mesmo agregado do C-06, limitado à unidade. · Reimprimir, cancelar, reembolsar (se permitido), abrir chat, ver avaliação. · — · `orders:read`, `orders:cancel`, `orders:refund`. · partial. · Sem permissão para cancelar no estado atual.

**M-05 · Operação da loja (abrir/fechar/pausar)**
Controlar o fluxo agora. · Gerente, franqueado. · Estado atual, motivo, previsão de retorno, pedidos em curso, histórico de pausas. · Abrir, fechar, pausar (15/30/60 min ou até horário), retomar, definir motivo. · — · `store:pause`, `store:open_close`. · offline (bloqueia ação). · Fechar com pedidos ativos (exige confirmação), horário conflitante, pausa acima do limite do Corporate.

**M-06 · Horários de funcionamento**
Definir quando a loja opera. · Gerente. · Grade semanal por canal (delivery/retirada), feriados, exceções. · Editar, copiar dia, adicionar exceção, aplicar a outras unidades autorizadas. · Canal. · `store:hours:write`. · — · Sobreposição de faixas, horário fora do limite do Corporate, feriado sem regra.

**M-07 · Tempo de preparo e SLA**
Calibrar promessas. · Gerente. · Tempo de preparo padrão e por faixa de horário, modo "pico" (+X min), SLA de aceite, teto definido pelo Corporate. · Editar, ativar modo pico, agendar. · — · `store:sla:write`. · — · Valor acima do teto da rede, mudança durante o pico (aviso).

**M-08 · Área de entrega**
Onde e por quanto entregar. · Gerente, franqueado. · Mapa com raio/zonas, taxa, pedido mínimo, ETA, campos travados pelo Corporate. · Editar taxa/raio dentro dos limites, ativar/desativar zona, simular endereço. · — · `delivery:zones:write` (unidade). · — · Fora do limite permitido, zona sem cobertura, geocodificação falhou.

**M-09 · Meios de pagamento**
O que a loja aceita. · Gerente. · `pix`, `card`, `on_delivery` com status e travas, chave Pix, bandeiras, troco máximo. · Ativar/desativar, configurar troco. · — · `payments:write` (unidade). · — · Meio travado pelo Corporate (desabilitado com explicação), Pix não configurado.

**M-10 · Cardápio da unidade**
Controlar o que está no ar. · Gerente, atendimento. · Lista de itens com preço efetivo, origem (mestre/override), disponível, ativo, campos travados, estoque. · Marcar indisponível (hoje / até horário / por prazo), ativar/desativar, editar preço se permitido, ações em massa. · Categoria, disponível, ativo, sobrescrito, travado, sem imagem, busca. · `catalog:read`, `catalog:write` (unidade), `catalog:price:write`. · partial (sincronizando com o mestre). · Campo travado, preço fora da faixa permitida, item em pedido ativo.

**M-11 · Detalhe do item local**
Ajustar um item na unidade. · Gerente. · Valores do mestre vs. override lado a lado, cadeado por campo com explicação, opções e `priceDelta`, disponibilidade, histórico. · Salvar override, restaurar padrão do mestre, marcar indisponível. · — · `catalog:write`, `catalog:price:write`. · — · Tentativa de editar campo travado (mostra quem travou e por quê), conflito com publicação em curso.

**M-12 · Indisponibilidades e estoque**
Programar faltas. · Gerente, cozinha. · Itens indisponíveis agora, com retorno programado; contagem simples de estoque quando habilitado; itens que mais faltam. · Marcar/desmarcar, programar retorno, repor em massa, zerar no fim do dia. · Categoria, status. · `catalog:availability:write`. · — · Item já indisponível pelo Corporate, retorno no passado.

**M-13 · Promoções locais**
Campanhas da unidade. · Gerente, franqueado. · Promoções locais e da rede (estas em somente-leitura), período, mecânica, resgates, receita. · Criar/editar/pausar local, aderir a campanha da rede. · Status, período, origem. · `promotions:write` (unidade). · — · Conflito com promoção da rede, desconto acima do limite, promoção sem itens disponíveis.

**M-14 · Cupons da unidade**
Cupons locais e conferência. · Gerente. · Cupons válidos na unidade (locais e da rede), uso, validade. · Criar local (se permitido), pausar, ver resgates. · Origem, status, validade. · `coupons:read`, `coupons:write` (unidade). · — · Sem permissão para criar, código duplicado na rede.

**M-15 · Relatórios da unidade**
Números para o franqueado. · Franqueado, gerente. · Vendas por dia/hora, produtos, cancelamentos por motivo, cashback usado/gerado, entregas, avaliações. · Executar, agendar, exportar. · Período, tipo de entrega, canal, categoria. · `reports:read`, `reports:export` (unidade). · job assíncrono. · Período longo, sem dados, export bloqueado por PII.

**M-16 · Avaliações da unidade**
Reagir ao feedback. · Gerente. · Avaliações com notas, tags, comentário, pedido vinculado, média móvel. · Responder, marcar tratada, escalar ao Corporate, abrir pedido. · Período, nota, tags, respondida. · `reviews:read`, `reviews:reply`. · empty. · Prazo de resposta expirado, comentário moderado.

**M-17 · Equipe da unidade**
Quem opera aqui. · Franqueado, gerente. · Usuários com papel, escopo, último acesso, PIN do Order Hub, status. · Convidar, editar papel (dentro dos papéis permitidos), suspender, resetar PIN, remover. · Papel, status. · `users:manage` (escopo unidade). · — · Papel acima do próprio nível (bloqueado), e-mail duplicado, remoção do último gerente.

**M-18 · Dispositivos e impressoras**
Manter o hardware vivo. · Gerente, suporte. · Impressoras (nome, modelo, IP/agente, status, fila), tablets/PCs pareados, versão do painel, último ping. · Adicionar, testar impressão, definir padrão por tipo de via, desparear dispositivo, reiniciar agente. · Status. · `devices:manage`. · offline (destaque). · Impressora offline, agente desatualizado, sem papel, IP duplicado.

---

## 3. Order Hub — 12 telas

A UX detalhada destas telas está em [03 — As três aplicações](./03-tres-aplicacoes.md) §3.

**H-01 · Login do painel / PIN do operador**
Entrar rápido no balcão. · Operadores, gerente. · Unidade, lista de operadores, teclado numérico de PIN, status da loja e da impressora. · Entrar por PIN, trocar de unidade (se autorizado), login completo. · — · `orderhub:access` escopo unidade. · loading/error/offline (PIN validado em cache assinado por até 12 h). · PIN inválido, operador suspenso, unidade sem sessão de dispositivo, offline sem cache.

**H-02 · Painel de pedidos (board)**
A tela onde o trabalho acontece. · Operadores. · Rail de Entrada com SLA, colunas Em preparo / Prontos / Em rota, faixa de Exceções, status da loja, som, impressora, relógio, operadores online. · Aceitar, recusar, abrir, marcar pronto, despachar, entregar, buscar, silenciar 30 s, tela cheia, densidade. · Tipo de entrega, com observação, com problema, meu vs. todos, busca `/`. · `orders:read`, `orders:accept`, `orders:reject`. · **todos os 5 + os degradados de §3.11**. · Sem conexão, conflito de ação, SLA expirado, impressora offline, loja fechada com pedidos.

**H-03 · Novo pedido (interrupção)**
Decidir aceitar em segundos. · Operadores. · Timer, tipo de entrega, cliente, itens resumidos, `notes` em destaque, total, meio de pagamento e cashback, cupom, bairro, alerta de duplicidade. · Aceitar, recusar, ver detalhe, silenciar 30 s. · — · `orders:accept`, `orders:reject`. · loading/error/offline (enfileira). · Já aceito por outro operador, SLA expirado durante a leitura, pagamento não aprovado, item indisponível.

**H-04 · Detalhe e preparo**
Montar o pedido certo. · Operadores, cozinha. · `notes`, itens com `optionsSnapshot` completo, checklist, timer de preparo vs. ETA, pagamento com "a cobrar na entrega", endereço e referência, telefone, histórico. · Marcar itens, informar atraso, marcar pronto, reimprimir, abrir chat, item indisponível, cancelar. · — · `orders:read`, `orders:eta:write`, `orders:ready`, `print:use`. · partial (cliente/endereço incompletos). · Estado mudou por outro operador, impressão falhou, ETA acima do limite.

**H-05 · Chat do pedido**
Falar com o cliente. · Operadores. · Fio de mensagens, eventos de sistema, respostas rápidas, presença, recibos de leitura, anexos do cliente. · Enviar, usar resposta rápida, assumir conversa, abrir imagem, marcar resolvido. · Não lidas, período. · `chat:read`, `chat:write`. · offline (fila local com badge). · Envio falhou, conversa assumida por outro, anexo recusado, cliente bloqueou.

**H-06 · Problema no pedido (cancelar / substituir / falha)**
Resolver exceções com consequência clara. · Operadores, gerente. · Motivos por taxonomia, seletor de itens, painel de consequências (cashback, estorno, cupom), quem pode aprovar. · Substituir item, cancelar item, reduzir quantidade, cancelar pedido, registrar falha na entrega, solicitar aprovação do gerente. · — · `orders:cancel`, `orders:item:cancel`, `orders:delivery:fail`, `orders:refund`. · loading/error. · Estado não permite cancelar, acima do limite do papel, estorno recusado pelo gateway, aprovação pendente.

**H-07 · Despacho e entregadores**
Tirar o pedido da loja. · Operadores, gerente. · Entregadores com status e carga, pedidos prontos aguardando, tempo de espera, integração de praça. · Atribuir, agrupar entregas, chamar praça, marcar saída, marcar entregue, remover atribuição. · Status do entregador. · `courier:assign`, `orders:dispatch`. · partial (integração fora). · Sem entregador, integração indisponível, entregador já em rota, atribuição concorrente.

**H-08 · Impressão**
Garantir que o cupom saia. · Operadores. · Impressoras e status, fila com falhas, pré-visualização do cupom, vias configuradas. · Reimprimir, imprimir via específica, trocar impressora, testar, ver na tela, limpar fila. · Status, pedido. · `print:use`, `devices:manage` (troca). · offline (destaque). · Impressora offline, sem papel, agente desconectado, cupom acima do tamanho.

**H-09 · Status da loja**
Parar o fluxo quando a cozinha não aguenta. · Operadores (pausar), gerente (fechar). · Estado, motivo, previsão de retorno, pedidos em curso, próximo horário. · Pausar 15/30/60 min, retomar, fechar, abrir. · — · `store:pause`, `store:open_close`. · offline (bloqueia). · Pausa acima do limite, fechar com pedidos ativos, sem permissão para fechar.

**H-10 · Histórico do turno**
Fechar o turno e conferir. · Operadores, gerente. · Pedidos do turno por status, cancelamentos por motivo, tempo médio de preparo, faturamento por meio de pagamento, valores a cobrar na entrega recebidos. · Buscar, reabrir pedido, reimprimir, exportar resumo, fechar turno. · Turno, status, operador, tipo de entrega. · `orders:read`, `shift:close`. · empty. · Turno já fechado, divergência de caixa, pedido ainda ativo.

**H-11 · Configurações do painel**
Ajustar o instrumento. · Operadores, gerente. · Volume e sons por evento, densidade, tema, tela cheia/quiosque, impressora padrão, atalhos, colunas visíveis, auto-aceite. · Testar som, ajustar volume, mudar densidade/tema, ativar quiosque, ativar auto-aceite (com trava). · — · `orderhub:access`; `orders:autoaccept` e `devices:manage` para os itens travados. · — · Áudio bloqueado pelo navegador, wake lock indisponível, sem permissão para auto-aceite.

**H-12 · Modo degradado / reconexão**
Não perder pedido quando a rede cai. · Operadores. · Aviso de conexão, hora do último dado, fila de ações pendentes, pedidos em cache, instruções. · Tentar reconectar, ver fila, imprimir a partir do cache, contatar suporte. · — · `orders:read`. · **é a própria tela de offline**. · Conflito ao sincronizar, ação expirada, cache vencido, servidor indisponível.
