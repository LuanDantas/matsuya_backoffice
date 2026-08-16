import {
  respostaDeMudancasSchema,
  type OrderAction,
  type OrderStatus,
  type RespostaDeMudancas,
} from '@matsuya/contracts'
import type { ApiClient } from './cliente'

/**
 * Endpoints de pedido.
 *
 * Uma função por rota, com o tipo do retorno declarado. O ganho não é
 * digitação: é que renomear um campo no contrato quebra a compilação aqui, em
 * vez de virar `undefined` numa célula da tabela.
 */

export interface PedidoDoQuadro {
  id: number
  code: string | null
  /**
   * Primeiro nome e inicial do sobrenome, montados pela API.
   *
   * `null` quando o pedido não tem cliente carregado — o cartão simplesmente
   * omite a linha em vez de mostrar um espaço reservado.
   */
  customerLabel: string | null
  status: OrderStatus
  version: number
  unityId: number
  deliveryType: 'delivery' | 'pickup'
  paymentMethod: string
  paymentStatus: string
  subtotal: number
  deliveryFee: number
  total: number
  notes?: string | null
  etaAt: string | null
  slaExpiresAt: string | null
  slaExpiredAt: string | null
  hasPartialCancellation: boolean
  createdAt: string
  addressSnapshot: Record<string, unknown> | null
  /**
   * Previsão de entrega ao cliente, do prazo da zona congelado no checkout.
   *
   * **Não é o ETA do entregador** — esse não existe na API. Nulo em retirada e
   * em pedido anterior à coluna, e aí a tela mostra tempo decorrido em vez de
   * um horário que ninguém pode cumprir.
   */
  estimatedDeliveryAt: string | null
  deliveryEtaMinutes: number | null
  /** Carimbo do aceite. É o fato que diz se a comanda deste pedido já saiu. */
  acceptedAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  /** Prazo derivado pela API — ver `modules/orders/prazos.ts` lá. */
  deadlineAt: string | null
  deadlineKind: 'aceite' | 'preparo' | null
  /** Janela cheia do prazo, para a barra do cartão de aceite saber o 100%. */
  deadlineTotalMinutes: number | null
  items?: Array<{
    id: number
    productName: string
    qty: number
    cancelledQty?: number
    unitPrice: number
    lineTotal?: number
    /** Opções escolhidas, congeladas no momento do pedido. */
    optionsSnapshot?: Array<{
      groupId: number
      groupName: string
      optionId: number
      optionName: string
      priceDelta: number
    }>
  }>
}

export interface QuadroDaLoja {
  orders: PedidoDoQuadro[]
  /** Cursor do diário, no mesmo corpo do snapshot — sem janela entre os dois. */
  cursor: number
}

export interface ResultadoDeTransicao {
  order: PedidoDoQuadro
  seq: number
  transition: { from: OrderStatus; to: OrderStatus }
}

export interface EntradaDeTransicao {
  orderId: number
  acao: OrderAction
  reasonCode?: string
  reasonNote?: string
  /** Versão sobre a qual o operador viu a tela. Vira `If-Match`. */
  versaoEsperada?: number
}

export function criarApiDePedidos(cliente: ApiClient) {
  return {
    quadroDaLoja: (params: {
      unityId: number
      status?: OrderStatus[]
      limite?: number
      cursor?: number
      signal?: AbortSignal
    }) =>
      cliente.requisitar<QuadroDaLoja>(`/stores/${params.unityId}/orders`, {
        query: {
          status: params.status?.join(','),
          limit: params.limite,
          cursor: params.cursor,
        },
        signal: params.signal,
      }),

    /**
     * O intervalo de mudanças desde um cursor.
     *
     * Validado com zod na chegada: é a resposta de que depende a correção do
     * quadro, e aceitar um corpo com formato inesperado aqui significaria
     * avançar o cursor sem ter aplicado nada — perdendo, em silêncio,
     * exatamente os eventos que a chamada existia para recuperar.
     */
    async mudancas(params: {
      unityId: number
      since: number
      limit?: number
      signal?: AbortSignal
    }): Promise<RespostaDeMudancas> {
      const bruto = await cliente.requisitar<unknown>(
        `/stores/${params.unityId}/orders/changes`,
        { query: { since: params.since, limit: params.limit }, signal: params.signal }
      )
      return respostaDeMudancasSchema.parse(bruto)
    },

    transicionar: (entrada: EntradaDeTransicao) =>
      cliente.requisitar<ResultadoDeTransicao>(
        `/orders/${entrada.orderId}/${entrada.acao}`,
        {
          metodo: 'POST',
          corpo: {
            reasonCode: entrada.reasonCode,
            reasonNote: entrada.reasonNote,
          },
          versaoEsperada: entrada.versaoEsperada,
        }
      ),
  }
}

export type ApiDePedidos = ReturnType<typeof criarApiDePedidos>
