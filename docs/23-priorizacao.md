# 23 — Priorização

> PARTE 23 do briefing. Quatro níveis. O critério de corte é explícito em cada um — sem isso, "prioridade" vira opinião.

---

## Critérios

| Nível | Definição operacional |
|---|---|
| **P0** | Sem isto, o sistema **não pode ir ao ar** — ou porque a operação não funciona, ou porque expõe a empresa a risco financeiro, jurídico ou de segurança |
| **P1** | Muito importante. A operação funciona sem, mas com custo humano recorrente, risco elevado ou perda de valor mensurável. Entra no mesmo ciclo, logo depois |
| **P2** | Evolução. Melhora eficiência, cobertura ou experiência. Entra quando P0 e P1 estiverem estáveis |
| **P3** | Futuro. Não implementar agora; **apenas garantir que a arquitetura não inviabilize** |

---

## P0 — Obrigatórias

### Segurança e integridade
- Segredo do JWT em variável de ambiente, com verificação dupla
- Fechamento dos 9 endpoints de escrita abertos, precedido de release em modo apenas-log
- `ensureAuth` falhando fechado
- Remoção dos `.env` do git e rotação de todas as credenciais
- Rate limit em autenticação e SMS; helmet; CORS por configuração
- Middleware de erro com `asyncHandler`
- `audit_logs` gravada na mesma transação da mutação
- Backup automatizado **com ensaio de restauração**
- Purga dos números de cartão em texto puro no dispositivo
- Bloqueio da tela de Pix mockada para builds antigos

### Correção de dinheiro
- Dinheiro em centavos inteiros
- Ledger de carteira com lotes FIFO e consumo persistido
- Reserva com TTL e **sweeper no servidor** (corrige o débito órfão em produção)
- Antidupla-gasto por lock de conta, restrição de banco e índice único parcial
- Reconciliação diária que congela conta com deriva, sem autocorreção
- Migração de `points` sem redução de saldo de nenhum cliente

### Operação
- Máquina de estados estendida do pedido
- Tempo real com `store_change_log` e resync por cursor
- Order Hub: board, SLA com som, aceite/recusa com motivo, preparo, exceções
- Impressão automática com fallback pelo navegador
- Modo offline com fila e reconciliação reconhecida pelo operador
- Push ao cliente nas transições de status
- Lock otimista nas transições e `Idempotency-Key` nas mutações
- Chat com o cliente

### Governança
- RBAC com permissões e escopo multivalorado
- Imposição de escopo na camada de query (`ScopedRepository`)
- MFA para escopo de rede e permissões financeiras
- Mascaramento de PII por padrão e auditoria de acesso e exportação
- Pagamentos: Pix, cartão com autorização/captura, pagamento na entrega, híbrido, e a matriz de compensação

---

## P1 — Muito importantes

- Dashboard executivo, financeiro e comparativo de unidades
- Agregação no servidor e views materializadas (aposenta o cálculo no navegador)
- Busca de pedido da rede e detalhe completo para o suporte
- Exportações assíncronas em CSV e XLSX com auditoria
- Telas de usuários, papéis e permissões
- Log de auditoria consultável e aba "Histórico" nas telas de detalhe
- Estorno e cancelamento parcial com desfazimento proporcional
- Conciliação com o extrato do Mercado Pago
- Motor de regras de acúmulo e campanhas declarativas
- Aceite automático **com travas**
- Presença multioperador no Hub
- Escalonamento de SLA ao gerente
- Alerta de unidade offline e de excesso de cancelamento
- Portal da Unidade: operação, horários, tempo de preparo, área de entrega, cardápio local
- Catálogo mestre com publicação, diff e reversão
- Avaliações e NPS
- Compartilhamento de sessão entre o console novo e o admin legado
- Docker, CI e ambiente de staging
- Acesso temporário com expiração
- Painel de burn-down da migração

---

## P2 — Evoluções

- Despacho com entregadores próprios e mapa ao vivo
- Fechamento de turno com conferência de caixa
- Modo quiosque com trava por PIN
- Densidade configurável e atalhos de teclado avançados
- Relatórios agendados por e-mail
- Timeline de promoções com detecção de colisão
- Grupos e regiões com hierarquia profunda
- Estoque simples por item
- Notificações por WhatsApp ao cliente
- Row Level Security no PostgreSQL como defesa em profundidade
- Prometheus e Grafana (**quando** os gatilhos de [19 §5](./19-observabilidade.md) forem atingidos)
- Codegen de tipos a partir do OpenAPI (**quando** a spec tiver schema real)
- Regressão visual do design system
- Anexos no chat pelo operador
- Integração com frota de entrega terceirizada

---

## P3 — Futuras

Todas em [25](./25-evolucoes-futuras.md). Nenhuma é implementada agora; o compromisso é apenas que **a arquitetura não as inviabilize**:

Clube de assinatura · CRM e segmentação · promoções inteligentes e cupons personalizados · recomendação de produto · previsão de demanda e de tempo de preparo · antifraude por modelo · gamificação · múltiplas marcas · KDS (kitchen display) dedicado · integração com ERP e com PDV · roteirização de entregas · marketplace com marcas de terceiros · app dedicado do entregador · atendimento por IA no chat.

---

## Como a priorização se relaciona com o roadmap

| Fase | Composição |
|---|---|
| Fase 0 | P0 de segurança e fundação, integralmente |
| Fase 1 | P0 de operação (Order Hub), mais P1 de presença e escalonamento |
| Fase 2 | P0 de dinheiro, integralmente; P1 de estorno e campanhas ao final |
| Fase 3 | P1 de Corporate leitura e P0 de governança |
| Fase 4 | P1 de fidelidade e P0 dos ajustes com quatro olhos |
| Fase 5 | P1 de catálogo mestre e Portal da Unidade |
| Fase 6 | P2 selecionados e a aposentadoria do legado |

**Nenhum item P2 entra antes de todos os P0 da fase correspondente estarem verdes.** Quando o prazo apertar, o corte sai de P2, depois de P1 — nunca de P0.
