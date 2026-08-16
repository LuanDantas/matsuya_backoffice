import type { FamiliaDeMotivo } from './reasons'
import type { OrderStatus } from './status'

/**
 * Ações do ciclo de vida, do ponto de vista da interface.
 *
 * O que o front precisa saber de cada uma: de quais estados ela aparece, que
 * permissão exige, se pede motivo, e como o botão se chama. Espelho de
 * `TRANSITIONS` na API.
 *
 * Isto é o que permite ao quadro do Hub **não** oferecer um botão que vai
 * levar 409. Um botão que existe e falha é pior do que um botão ausente: ele
 * ensina o operador a não confiar na tela.
 */

export const ORDER_ACTIONS = [
  'accept',
  'reject',
  'preparing',
  'ready',
  'dispatch',
  'deliver',
  'delivery-failed',
  'customer-not-found',
  'retry-delivery',
  'cancel',
] as const

export type OrderAction = (typeof ORDER_ACTIONS)[number]

export interface DescricaoDaAcao {
  de: ReadonlyArray<OrderStatus>
  para: OrderStatus
  permissao: string
  motivo: FamiliaDeMotivo | null
  rotulo: string
  /** Ação que muda o rumo do pedido pede confirmação antes de executar. */
  confirmar: boolean
  /** Destaque visual do botão no quadro. */
  enfase: 'primaria' | 'secundaria' | 'destrutiva'
}

export const ORDER_ACTION_INFO: Record<OrderAction, DescricaoDaAcao> = {
  accept: {
    de: ['pending'],
    para: 'confirmed',
    permissao: 'orders:accept',
    motivo: null,
    rotulo: 'Aceitar',
    confirmar: false,
    enfase: 'primaria',
  },
  reject: {
    de: ['pending'],
    para: 'rejected',
    permissao: 'orders:reject',
    motivo: 'REJ',
    rotulo: 'Recusar',
    confirmar: true,
    enfase: 'destrutiva',
  },
  preparing: {
    de: ['confirmed'],
    para: 'preparing',
    permissao: 'orders:accept',
    motivo: null,
    rotulo: 'Iniciar preparo',
    confirmar: false,
    enfase: 'primaria',
  },
  ready: {
    de: ['preparing'],
    para: 'ready',
    permissao: 'orders:ready',
    motivo: null,
    rotulo: 'Pronto',
    confirmar: false,
    enfase: 'primaria',
  },
  dispatch: {
    de: ['ready'],
    para: 'awaiting_courier',
    permissao: 'orders:dispatch',
    motivo: null,
    rotulo: 'Despachar',
    confirmar: false,
    enfase: 'primaria',
  },
  deliver: {
    de: ['ready', 'awaiting_courier', 'out_for_delivery', 'customer_not_found'],
    para: 'delivered',
    permissao: 'orders:dispatch',
    motivo: null,
    rotulo: 'Entregue',
    confirmar: false,
    enfase: 'primaria',
  },
  'delivery-failed': {
    de: ['out_for_delivery'],
    para: 'delivery_failed',
    permissao: 'orders:delivery:fail',
    motivo: 'ENT',
    rotulo: 'Falha na entrega',
    confirmar: true,
    enfase: 'destrutiva',
  },
  'customer-not-found': {
    de: ['out_for_delivery'],
    para: 'customer_not_found',
    permissao: 'orders:delivery:fail',
    motivo: 'ENT',
    rotulo: 'Cliente não localizado',
    confirmar: true,
    enfase: 'destrutiva',
  },
  'retry-delivery': {
    de: ['delivery_failed', 'customer_not_found'],
    para: 'out_for_delivery',
    permissao: 'orders:dispatch',
    motivo: null,
    rotulo: 'Nova tentativa',
    confirmar: false,
    enfase: 'secundaria',
  },
  cancel: {
    de: [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'awaiting_courier',
      'out_for_delivery',
      'delivery_failed',
      'customer_not_found',
    ],
    para: 'cancelled',
    permissao: 'orders:cancel',
    motivo: 'CAN',
    rotulo: 'Cancelar',
    confirmar: true,
    enfase: 'destrutiva',
  },
}

/** Estados a partir dos quais cancelar exige `orders:cancel:any`. */
export const CANCELAR_EXIGE_PERMISSAO_AMPLIADA: ReadonlyArray<OrderStatus> = [
  'out_for_delivery',
  'delivery_failed',
  'customer_not_found',
]

export const PERMISSAO_CANCELAR_QUALQUER = 'orders:cancel:any'

export interface ContextoDoPedido {
  status: OrderStatus
  deliveryType: 'delivery' | 'pickup'
}

/**
 * As ações que fazem sentido oferecer para este pedido, para este usuário.
 *
 * Três filtros, nesta ordem: a máquina de estados, o tipo de entrega e a
 * permissão. Um pedido de retirada nunca mostra "Despachar" — quem entrega é o
 * balcão, e a API responde 409 se tentarem.
 */
export function acoesDisponiveis(
  pedido: ContextoDoPedido,
  permissoes: ReadonlySet<string>
): OrderAction[] {
  return ORDER_ACTIONS.filter((acao) => {
    const info = ORDER_ACTION_INFO[acao]

    if (!info.de.includes(pedido.status)) return false
    if (acao === 'dispatch' && pedido.deliveryType === 'pickup') return false
    if (!permissoes.has(info.permissao)) return false

    if (
      acao === 'cancel' &&
      CANCELAR_EXIGE_PERMISSAO_AMPLIADA.includes(pedido.status) &&
      !permissoes.has(PERMISSAO_CANCELAR_QUALQUER)
    ) {
      return false
    }

    return true
  })
}
