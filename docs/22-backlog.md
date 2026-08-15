# 22 — Backlog inicial

> PARTE 22 do briefing. Estrutura **Épico → Feature → User Story**. Cada história traz prioridade ([23](./23-priorizacao.md)) e fase ([21](./21-roadmap.md)). As histórias estão em pt-BR, no formato "Como… quero… para que…".
>
> Não é o backlog completo do produto — é o backlog **suficiente para as fases 0 a 3**, mais o esqueleto das fases 4 a 6. Cada item mapeia numa tela de [16](./16-telas.md) ou num contrato de [12](./12-api.md).

---

## ÉPICO 1 — Fundação segura da plataforma

### Feature 1.1 — Fechar as brechas de autenticação
- **E1.1.1** · P0 · F0 — Como responsável técnico, quero o segredo do JWT lido de variável de ambiente com verificação dupla por 48 h, para que ninguém consiga forjar um token administrativo sem deslogar toda a base de uma vez.
- **E1.1.2** · P0 · F0 — Como responsável técnico, quero os 9 endpoints de escrita hoje abertos rodando em modo apenas-log por 72 h e depois autenticados, para que ninguém consiga cunhar cashback ou disparar push para toda a base.
- **E1.1.3** · P0 · F0 — Como responsável técnico, quero que `ensureAuth` rejeite quando o usuário não existe ou está desativado, para que um token de conta removida não passe como fantasma.
- **E1.1.4** · P0 · F0 — Como responsável técnico, quero os arquivos `.env` removidos do git e todas as credenciais rotacionadas, para que o comprometimento atual seja encerrado.
- **E1.1.5** · P0 · F0 — Como responsável técnico, quero rate limit em `/auth/*` e nos endpoints de SMS, para que não sejamos alvo de credential stuffing nem de abuso de custo de SMS.

### Feature 1.2 — Kernel de plataforma
- **E1.2.1** · P0 · F0 — Como desenvolvedor, quero `/api/v1` montado e o roteador legado congelado por guarda de CI, para que nenhuma rota nova nasça no arquivo de 508 linhas.
- **E1.2.2** · P0 · F0 — Como desenvolvedor, quero logging estruturado com `requestId` propagado até os workers, para conseguir seguir uma requisição ponta a ponta.
- **E1.2.3** · P0 · F0 — Como desenvolvedor, quero um middleware terminal de erro com `asyncHandler`, para que uma promise rejeitada não derrube o processo nem vaze stack trace.
- **E1.2.4** · P0 · F0 — Como desenvolvedor, quero o outbox transacional com relay, para que nenhuma notificação seja enviada sem commit e nenhum commit fique sem notificação.
- **E1.2.5** · P0 · F0 — Como responsável técnico, quero `audit_logs` particionada por mês gravando na mesma transação da mutação, para que toda ação crítica tenha prova.
- **E1.2.6** · P1 · F0 — Como responsável técnico, quero Docker, CI com migrations `up → down → up` e ambiente de staging, para que deploy deixe de ser artesanal.

### Feature 1.3 — Fundação de front-end
- **E1.3.1** · P0 · F0 — Como desenvolvedor, quero o monorepo com tokens e os 15 componentes de base, para que as três experiências não virem três cópias das mesmas strings de Tailwind.
- **E1.3.2** · P0 · F0 — Como desenvolvedor, quero o `packages/contracts` com os enums e rótulos pt-BR do domínio, para que painel e app nunca chamem o mesmo estado por nomes diferentes.
- **E1.3.3** · P1 · F0 — Como desenvolvedor, quero Storybook publicado no CI, para revisar componentes em tema claro e escuro sem subir uma aplicação.

---

## ÉPICO 2 — Order Hub

### Feature 2.1 — Receber e aceitar pedidos em tempo real
- **E2.1.1** · P0 · F1 — **Como operador da unidade, quero receber novos pedidos em tempo real para que possa iniciar a preparação imediatamente.**
- **E2.1.2** · P0 · F1 — Como operador, quero um alerta sonoro que escala enquanto houver pedido não aceito, para não perder um pedido quando estou de costas para a tela.
- **E2.1.3** · P0 · F1 — Como operador, quero um cronômetro regressivo de SLA que mude de cor **e de forma**, para saber quanto tempo me resta mesmo com pouca luz na cozinha.
- **E2.1.4** · P0 · F1 — Como operador, quero aceitar um pedido em um toque e ver o card mover na hora, para não travar a fila no pico.
- **E2.1.5** · P0 · F1 — Como operador, quero recusar um pedido escolhendo um motivo de uma lista e ver as consequências antes de confirmar, para não estornar por engano.
- **E2.1.6** · P0 · F1 — Como operador, quero que o pedido com observação do cliente exiba a observação em destaque acima dos botões, para não aceitar às cegas um pedido com alergia.
- **E2.1.7** · P1 · F1 — Como operador, quero ver quando outro colega já está agindo sobre um pedido, para não aceitarmos ou cancelarmos o mesmo pedido duas vezes.
- **E2.1.8** · P1 · F1 — Como gerente, quero ativar aceite automático com travas (nunca aceita pedido com observação, item em falta ou pagamento não aprovado), para aliviar o pico sem correr risco.
- **E2.1.9** · P0 · F1 — Como gerente, quero ser avisado quando um pedido estoura o SLA de aceite, para intervir antes de o cliente desistir.

### Feature 2.2 — Preparar e despachar
- **E2.2.1** · P0 · F1 — Como operador, quero ver todos os adicionais e remoções de cada item com o mesmo peso visual, para não esquecer um "sem cebola".
- **E2.2.2** · P0 · F1 — Como operador, quero um cronômetro de preparo contra o prazo prometido, para saber quando estou atrasando.
- **E2.2.3** · P1 · F1 — Como operador, quero informar atraso escolhendo +5/+10/+15 min e um motivo, para o cliente ser avisado sem eu precisar digitar.
- **E2.2.4** · P0 · F1 — Como operador, quero marcar o pedido como pronto e despachar escolhendo o entregador, para o cliente receber a notificação com o nome de quem vai entregar.
- **E2.2.5** · P0 · F1 — Como operador, quero que pedidos de retirada sejam visualmente distintos dos de entrega, porque confundir os dois é o erro mais caro do balcão.
- **E2.2.6** · P0 · F1 — Como operador, quero ver "a cobrar na entrega" em todo pedido, inclusive quando é R$ 0,00, para o entregador não gerar conflito no portão.

### Feature 2.3 — Falar com o cliente
- **E2.3.1** · P0 · F1 — Como operador, quero conversar com o cliente em tempo real dentro do pedido, para resolver dúvida de endereço sem telefone.
- **E2.3.2** · P0 · F1 — Como operador, quero respostas rápidas com campos preenchíveis, para responder em segundos no pico.
- **E2.3.3** · P1 · F1 — Como operador, quero ver quando outro colega está respondendo aquela conversa, para não respondermos em duplicidade.
- **E2.3.4** · P1 · F1 — Como Corporate, quero que as mensagens sejam imutáveis e auditáveis, para que uma conversa possa ser usada em uma disputa.

### Feature 2.4 — Imprimir
- **E2.4.1** · P0 · F1 — Como operador, quero que a comanda saia automaticamente na cozinha ao aceitar o pedido, para não digitar nada.
- **E2.4.2** · P0 · F1 — Como operador, quero ser avisado quando a impressora estiver offline **antes** de aceitar um pedido, para não descobrir só quando a comanda não sai.
- **E2.4.3** · P0 · F1 — Como operador, quero reimprimir e, se o agente falhar, imprimir pelo navegador, para a loja não parar por causa de impressora.
- **E2.4.4** · P1 · F1 — Como gerente, quero configurar quantas vias saem em qual impressora por evento, para adequar ao layout da minha cozinha.

### Feature 2.5 — Continuar operando sem internet
- **E2.5.1** · P0 · F1 — Como operador, quero um aviso impossível de ignorar quando a conexão cair, para não achar que o silêncio significa "sem pedidos".
- **E2.5.2** · P0 · F1 — Como operador, quero que aceitar e avançar status funcionem offline e sejam enviados depois, para não parar de atender quem já está na cozinha.
- **E2.5.3** · P0 · F1 — Como operador, quero um resumo do que foi e do que não foi aplicado ao reconectar, para saber exatamente o que preciso refazer.
- **E2.5.4** · P0 · F1 — Como operador, quero que o Hub nunca perca um pedido depois de uma queda, mesmo que o socket tenha ficado fora por minutos.
- **E2.5.5** · P1 · F1 — Como Corporate, quero ser avisado quando uma unidade fica sem Hub conectado em horário de funcionamento, para ligar para a loja antes que o cliente reclame.

### Feature 2.6 — Exceções
- **E2.6.1** · P0 · F1 — Como operador, quero marcar um item como indisponível e escolher entre substituir, cancelar o item ou cancelar o pedido, vendo o impacto financeiro de cada opção.
- **E2.6.2** · P0 · F1 — Como operador, quero registrar falha na entrega com motivo, para o cliente e o Corporate entenderem o que houve.
- **E2.6.3** · P1 · F1 — Como operador, quero pausar o recebimento de pedidos por 15/30/60 min com previsão de retorno visível ao cliente, para não afundar a cozinha.
- **E2.6.4** · P1 · F1 — Como operador, quero ser avisado quando um pedido novo parece duplicata de outro recente, para não preparar duas vezes.

---

## ÉPICO 3 — Carteira de cashback

### Feature 3.1 — Ledger correto
- **E3.1.1** · P0 · F2 — Como financeiro, quero que o saldo do cliente seja calculado por lotes FIFO com consumo persistido, para pararmos de exibir saldo que o cliente não tem.
- **E3.1.2** · P0 · F2 — Como financeiro, quero um relatório de reconciliação diário que congele contas com deriva, para que erro de código não vire prejuízo silencioso.
- **E3.1.3** · P0 · F2 — Como cliente, quero que meu saldo não diminua na migração, para não perceber nada além de um extrato mais claro.
- **E3.1.4** · P0 · F2 — Como financeiro, quero saber o valor agregado do ajuste de migração antes do cutover, para aprovar a despesa conscientemente.
- **E3.1.5** · P0 · F2 — Como cliente, quero que um resgate abandonado no meio libere meu saldo automaticamente, para não perder dinheiro porque meu app fechou.

### Feature 3.2 — Gastar cashback no delivery
- **E3.2.1** · P0 · F2 — **Como cliente, quero pagar parte do meu pedido de delivery com o cashback que acumulei, para que o programa de fidelidade tenha utilidade real.**
- **E3.2.2** · P0 · F2 — Como responsável técnico, quero garantia de que o mesmo cashback nunca seja consumido por dois pedidos, mesmo com dois toques simultâneos.
- **E3.2.3** · P0 · F2 — Como operador, quero ver claramente quanto do pedido foi pago com cashback e quanto falta cobrar, para não achar que um pedido pago não foi pago.
- **E3.2.4** · P0 · F2 — Como cliente, quero meu cashback de volta ao lote original quando um pedido é cancelado, para não perder a validade que eu tinha.
- **E3.2.5** · P1 · F2 — Como marketing, quero criar "cashback em dobro às terças na Moema" sem pedir deploy, com teto de custo por pedido e orçamento total.

### Feature 3.3 — Administrar o programa
- **E3.3.1** · P0 · F4 — Como financeiro, quero ajustar o cashback de um cliente informando motivo obrigatório, com registro de ator, IP e valores antes e depois.
- **E3.3.2** · P0 · F4 — Como financeiro, quero que ajustes acima de um teto exijam aprovação de um segundo usuário, para evitar fraude interna.
- **E3.3.3** · P0 · F3 — Como diretoria, quero saber o **passivo de cashback circulante**, porque hoje ninguém consegue responder isso.
- **E3.3.4** · P1 · F3 — Como financeiro, quero ver cashback concedido, usado e expirado por período e por unidade, para medir o custo do programa.

---

## ÉPICO 4 — Pagamentos

### Feature 4.1 — Pix e cartão de verdade
- **E4.1.1** · P0 · F2 — Como responsável técnico, quero remover os cartões em texto puro do dispositivo e esconder o Pix mockado para builds antigos, porque hoje é um defeito ativo em produção.
- **E4.1.2** · P0 · F2 — Como cliente, quero pagar por Pix com um QR real e ver o pedido confirmar sozinho quando eu pagar.
- **E4.1.3** · P0 · F2 — Como cliente, quero pagar com cartão tokenizado, sem que meu número trafegue ou fique guardado.
- **E4.1.4** · P0 · F2 — Como responsável técnico, quero que a captura do cartão aconteça quando a loja aceita, não quando entrega, para que uma recusa não custe comida já feita.
- **E4.1.5** · P0 · F2 — Como responsável técnico, quero que webhook duplicado, fora de ordem ou perdido não corrompa nem duplique nada.

### Feature 4.2 — Estornos
- **E4.2.1** · P0 · F2 — Como suporte, quero estornar um pedido e ver exatamente o que volta em cashback e o que volta no cartão, com prazos.
- **E4.2.2** · P1 · F2 — Como suporte, quero cancelar só parte dos itens e ter o desfazimento proporcional automático.
- **E4.2.3** · P1 · F2 — Como financeiro, quero conciliar o extrato do Mercado Pago com nossos registros e ver as divergências numa lista de trabalho.

---

## ÉPICO 5 — Corporate

### Feature 5.1 — Visão de rede
- **E5.1.1** · P0 · F3 — Como diretoria, quero um painel com faturamento, pedidos, ticket médio e cancelamentos da rede, filtrável por período, unidade, grupo e região.
- **E5.1.2** · P0 · F3 — Como operações, quero comparar unidades numa tabela ranqueável, para achar quem está fora da curva.
- **E5.1.3** · P0 · F3 — Como suporte, quero buscar qualquer pedido da rede por número, telefone ou cliente, e ver o histórico completo com quem fez o quê.
- **E5.1.4** · P1 · F3 — Como financeiro, quero exportar qualquer relatório em CSV ou XLSX, com jobs assíncronos para volumes grandes.
- **E5.1.5** · P1 · F3 — Como operações, quero receber alerta quando uma unidade apresenta excesso de cancelamento ou fica offline.

### Feature 5.2 — Governança de acesso
- **E5.2.1** · P0 · F3 — Como administrador, quero conceder papéis com escopo de rede, grupo ou unidade, para que um gerente regional veja só as lojas dele.
- **E5.2.2** · P0 · F3 — Como administrador, quero que ninguém consiga conceder permissão maior do que a própria.
- **E5.2.3** · P0 · F3 — Como administrador, quero MFA obrigatório para quem tem escopo de rede ou permissões financeiras.
- **E5.2.4** · P1 · F3 — Como administrador, quero conceder acesso temporário com data de expiração, para cobertura de férias sem esquecer de revogar.
- **E5.2.5** · P0 · F3 — Como auditoria, quero consultar quem alterou o quê, quando, de onde, com valores antes e depois.

### Feature 5.3 — Clientes e LGPD
- **E5.3.1** · P0 · F3 — Como suporte, quero ver a visão 360 de um cliente com pedidos, cashback, conversas e avaliações.
- **E5.3.2** · P0 · F3 — Como encarregado de dados, quero que a PII apareça mascarada por padrão e que toda revelação e exportação seja auditada.
- **E5.3.3** · P1 · F3 — Como encarregado de dados, quero exportar e anonimizar os dados de um titular mediante solicitação.

---

## ÉPICO 6 — Portal da Unidade

### Feature 6.1 — Operar a loja
- **E6.1.1** · P0 · F5 — Como franqueado, quero alternar entre as minhas unidades e nunca ver as de outros.
- **E6.1.2** · P0 · F5 — Como gerente, quero abrir, fechar e pausar a loja com previsão de retorno.
- **E6.1.3** · P0 · F5 — Como gerente, quero configurar horários, tempo de preparo, taxa e raio de entrega, dentro dos limites definidos pela matriz.
- **E6.1.4** · P1 · F5 — Como gerente, quero ver o desempenho do meu dia comparado com a média da rede.

### Feature 6.2 — Cardápio local
- **E6.2.1** · P0 · F5 — Como gerente, quero marcar um item como indisponível em dois toques, com retorno programado.
- **E6.2.2** · P0 · F5 — Como gerente, quero ver claramente quais campos estão travados pela matriz e por quê, em vez de um botão cinza sem explicação.
- **E6.2.3** · P1 · F5 — Como gerente, quero criar uma promoção local dentro dos limites autorizados.

---

## ÉPICO 7 — Catálogo mestre

- **E7.1.1** · P0 · F5 — Como marketing, quero cadastrar um produto uma vez e publicá-lo para as unidades escolhidas, em vez de cadastrar doze vezes.
- **E7.1.2** · P0 · F5 — Como marketing, quero travar campos por produto, para que a unidade não altere nome, foto nem preço quando não deve.
- **E7.1.3** · P0 · F5 — Como operações, quero ver o diff por unidade antes de publicar e poder reverter.
- **E7.1.4** · P1 · F5 — Como operações, quero um relatório de agrupamento dos produtos duplicados para revisão humana antes da consolidação, porque fusão automática corrompe o histórico.

---

## ÉPICO 8 — Migração do admin legado

- **E8.1.1** · P1 · F3 — Como usuário do admin, quero transitar entre o sistema novo e o antigo sem fazer login duas vezes.
- **E8.1.2** · P1 · F4 — Como responsável de produto, quero um painel de burn-down com páginas legadas restantes e percentual de sessões ainda no legado.
- **E8.1.3** · P1 · F6 — Como responsável técnico, quero desligar o admin legado com critérios objetivos verificados, e não por decisão de calendário.
