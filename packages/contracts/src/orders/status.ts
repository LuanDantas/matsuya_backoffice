/**
 * Estados do pedido — espelho do que a API impõe.
 *
 * Esta lista **não é a fonte da verdade**: a fonte é
 * `src/modules/orders/orderStateMachine.ts` na API, porque é lá que a transição
 * é de fato recusada. Aqui é o espelho que o front usa para desenhar colunas,
 * rótulos e cores.
 *
 * Espelho que diverge da fonte é pior do que espelho nenhum — ele mente com
 * confiança. Por isso `tooling/verificar-deriva-de-contrato.mjs` compara os dois
 * arquivos e reprova o build quando eles discordam.
 */

export const ORDER_STATUSES = [
  'awaiting_payment',
  'pending',
  'payment_failed',
  'confirmed',
  'preparing',
  'ready',
  'awaiting_courier',
  'out_for_delivery',
  'delivered',
  'delivery_failed',
  'customer_not_found',
  'cancelled',
  'rejected',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const TERMINAL_STATUSES = [
  'delivered',
  'cancelled',
  'rejected',
  'payment_failed',
] as const satisfies ReadonlyArray<OrderStatus>

export const ACTIVE_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'awaiting_courier',
  'out_for_delivery',
  'delivery_failed',
  'customer_not_found',
] as const satisfies ReadonlyArray<OrderStatus>

/**
 * Rótulos em pt-BR.
 *
 * Escritos do ponto de vista de **quem está na loja**, não do modelo de dados:
 * o atendente lê "aguardando entregador", não "awaiting_courier". Tempo verbal
 * no presente, porque a coluna do quadro descreve onde o pedido está agora.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguardando pagamento',
  pending: 'Novo',
  payment_failed: 'Pagamento falhou',
  confirmed: 'Aceito',
  preparing: 'Em preparo',
  ready: 'Pronto',
  awaiting_courier: 'Aguardando entregador',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  delivery_failed: 'Falha na entrega',
  customer_not_found: 'Cliente não localizado',
  cancelled: 'Cancelado',
  rejected: 'Recusado',
}

/**
 * Rótulos curtos, para o modo Expedição.
 *
 * A referência encurta a mesma informação quando a densidade sobe: o que no
 * modo Quadros é `Pedido em atraso há 1246min` vira `Atraso 1246min` na grade.
 * Não é economia de espaço por si — é que num cartão de 160 px o texto longo
 * quebra em três linhas e deixa de ser lido de relance, que é a única razão de
 * a grade densa existir.
 *
 * `Record<OrderStatus, string>` obriga o mapa a cobrir os treze estados: um
 * estado novo sem rótulo curto não compila.
 */
export const ORDER_STATUS_LABEL_CURTO: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguardando pgto.',
  pending: 'Novo',
  payment_failed: 'Pgto. falhou',
  confirmed: 'Aceito',
  preparing: 'Preparo',
  ready: 'Pronto',
  awaiting_courier: 'Aguard. entregador',
  out_for_delivery: 'Em rota',
  delivered: 'Entregue',
  delivery_failed: 'Falha',
  customer_not_found: 'Não localizado',
  cancelled: 'Cancelado',
  rejected: 'Recusado',
}

/**
 * Tom visual de cada estado. Nomes semânticos, não cores: o `ui` decide o que
 * "atencao" significa em claro e em escuro, e o Hub roda escuro por padrão.
 */
export type StatusTone = 'neutro' | 'informativo' | 'atencao' | 'sucesso' | 'perigo' | 'urgente'

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  awaiting_payment: 'neutro',
  // "Novo" é urgente por natureza: é o único estado com relógio de SLA correndo.
  pending: 'urgente',
  payment_failed: 'perigo',
  confirmed: 'informativo',
  preparing: 'informativo',
  ready: 'sucesso',
  awaiting_courier: 'atencao',
  out_for_delivery: 'informativo',
  delivered: 'sucesso',
  delivery_failed: 'perigo',
  customer_not_found: 'perigo',
  cancelled: 'neutro',
  rejected: 'neutro',
}

export const ehTerminal = (status: OrderStatus): boolean =>
  (TERMINAL_STATUSES as ReadonlyArray<string>).includes(status)

export const ehAtivo = (status: OrderStatus): boolean =>
  (ACTIVE_STATUSES as ReadonlyArray<string>).includes(status)
