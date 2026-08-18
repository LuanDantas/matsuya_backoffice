import { describe, expect, it } from 'vitest'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import type { OrderStatus } from '@matsuya/contracts'
import { apurarExcecoes, contarPorMotivo } from './Excecoes'

const AGORA = new Date('2026-08-18T12:00:00.000Z').getTime()
const atras = (minutos: number) => new Date(AGORA - minutos * 60000).toISOString()

/**
 * Um pedido do quadro com o mínimo que a apuração lê.
 *
 * O resto do `PedidoDoQuadro` é irrelevante aqui e vem de um molde só — se a
 * apuração passar a depender de outro campo, o molde tem de crescer junto, e é
 * exatamente esse acoplamento que se quer ver quebrar.
 */
function pedido(parcial: Partial<PedidoDoQuadro> & { id: number }): PedidoDoQuadro {
  return {
    code: null,
    customerLabel: null,
    status: 'pending' as OrderStatus,
    version: 0,
    unityId: 2,
    deliveryType: 'delivery',
    paymentMethod: 'pix',
    paymentStatus: 'paid',
    subtotal: 0,
    deliveryFee: 0,
    total: 0,
    etaAt: null,
    slaExpiresAt: null,
    slaExpiredAt: null,
    hasPartialCancellation: false,
    createdAt: atras(1),
    addressSnapshot: null,
    estimatedDeliveryAt: null,
    deliveryEtaMinutes: null,
    acceptedAt: null,
    readyAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    deadlineAt: null,
    deadlineKind: null,
    deadlineTotalMinutes: null,
    ...parcial,
  } as PedidoDoQuadro
}

describe('apuração das exceções', () => {
  it('não acha exceção onde não há', () => {
    const fila = apurarExcecoes(
      [
        pedido({ id: 1, status: 'confirmed' }),
        pedido({ id: 2, status: 'preparing' }),
        pedido({ id: 3, status: 'out_for_delivery' }),
      ],
      AGORA
    )

    expect(fila).toEqual([])
  })

  describe('sem resposta da loja', () => {
    it('entra quando o SLA já foi marcado como estourado', () => {
      const fila = apurarExcecoes(
        [pedido({ id: 1, status: 'pending', slaExpiredAt: atras(3) })],
        AGORA
      )

      expect(fila).toHaveLength(1)
      expect(fila[0]!.motivo).toBe('sla')
    })

    it('entra quando o prazo já passou, mesmo sem ninguém ter marcado', () => {
      const fila = apurarExcecoes(
        [pedido({ id: 1, status: 'pending', slaExpiresAt: atras(1) })],
        AGORA
      )

      expect(fila[0]?.motivo).toBe('sla')
    })

    /**
     * Prazo no futuro é pedido novo dentro do combinado, não exceção. Antes de
     * estourar, quem cobra é o cronômetro do cartão no quadro.
     */
    it('fica de fora enquanto o prazo não venceu', () => {
      const daqui = new Date(AGORA + 4 * 60000).toISOString()

      expect(
        apurarExcecoes([pedido({ id: 1, status: 'pending', slaExpiresAt: daqui })], AGORA)
      ).toEqual([])
    })

    /**
     * Idade sozinha não basta: a apuração lê as colunas de prazo, não o relógio.
     * Um pedido antigo que a loja aceitou não está sem resposta.
     */
    it('não entra só por ser antigo', () => {
      expect(
        apurarExcecoes([pedido({ id: 1, status: 'pending', createdAt: atras(90) })], AGORA)
      ).toEqual([])
    })

    it('só vale para pedido ainda pendente', () => {
      expect(
        apurarExcecoes(
          [pedido({ id: 1, status: 'confirmed', slaExpiredAt: atras(20) })],
          AGORA
        )
      ).toEqual([])
    })
  })

  describe('problema na entrega', () => {
    it('entra na falha e no cliente não localizado', () => {
      const fila = apurarExcecoes(
        [
          pedido({ id: 1, status: 'delivery_failed' }),
          pedido({ id: 2, status: 'customer_not_found' }),
        ],
        AGORA
      )

      expect(fila.map((e) => e.motivo)).toEqual(['entrega', 'entrega'])
    })
  })

  describe('pedido alterado', () => {
    it('entra com cancelamento parcial', () => {
      const fila = apurarExcecoes(
        [pedido({ id: 1, status: 'preparing', hasPartialCancellation: true })],
        AGORA
      )

      expect(fila[0]?.motivo).toBe('parcial')
    })
  })

  /**
   * A regra que a ordem dos `if` implementa, e que é fácil de quebrar sem
   * perceber ao mexer neles: um pedido nunca aparece duas vezes na fila.
   */
  describe('um pedido, uma linha', () => {
    it('escolhe o motivo mais grave quando dois valem ao mesmo tempo', () => {
      const fila = apurarExcecoes(
        [
          pedido({
            id: 1,
            status: 'pending',
            slaExpiredAt: atras(5),
            hasPartialCancellation: true,
          }),
        ],
        AGORA
      )

      expect(fila).toHaveLength(1)
      expect(fila[0]!.motivo).toBe('sla')
    })

    it('entrega vence alteração', () => {
      const fila = apurarExcecoes(
        [pedido({ id: 1, status: 'delivery_failed', hasPartialCancellation: true })],
        AGORA
      )

      expect(fila).toHaveLength(1)
      expect(fila[0]!.motivo).toBe('entrega')
    })
  })

  describe('ordem da fila', () => {
    /**
     * Mais antigo primeiro: quem espera há mais tempo é quem está mais perto de
     * desistir. A ordem é o que faz "tratar o mais antigo" significar algo.
     */
    it('põe o mais antigo na frente, independente do motivo', () => {
      const fila = apurarExcecoes(
        [
          pedido({ id: 1, status: 'delivery_failed', createdAt: atras(10) }),
          pedido({ id: 2, status: 'pending', slaExpiredAt: atras(1), createdAt: atras(40) }),
          pedido({ id: 3, status: 'preparing', hasPartialCancellation: true, createdAt: atras(25) }),
        ],
        AGORA
      )

      expect(fila.map((e) => e.pedido.id)).toEqual([2, 3, 1])
      expect(fila.map((e) => e.minutos)).toEqual([40, 25, 10])
    })
  })
})

describe('contagem por motivo', () => {
  it('devolve os três motivos mesmo quando não há nenhum', () => {
    expect(contarPorMotivo([])).toEqual({ sla: 0, entrega: 0, parcial: 0 })
  })

  it('conta cada motivo separadamente', () => {
    const fila = apurarExcecoes(
      [
        pedido({ id: 1, status: 'pending', slaExpiredAt: atras(2) }),
        pedido({ id: 2, status: 'pending', slaExpiredAt: atras(9) }),
        pedido({ id: 3, status: 'delivery_failed' }),
        pedido({ id: 4, status: 'customer_not_found' }),
        pedido({ id: 5, status: 'delivery_failed' }),
        pedido({ id: 6, status: 'preparing', hasPartialCancellation: true }),
      ],
      AGORA
    )

    expect(contarPorMotivo(fila)).toEqual({ sla: 2, entrega: 3, parcial: 1 })
  })

  it('a soma das contagens é o tamanho da fila', () => {
    const fila = apurarExcecoes(
      [
        pedido({ id: 1, status: 'pending', slaExpiredAt: atras(2), hasPartialCancellation: true }),
        pedido({ id: 2, status: 'delivery_failed' }),
      ],
      AGORA
    )

    const contagem = contarPorMotivo(fila)
    expect(contagem.sla + contagem.entrega + contagem.parcial).toBe(fila.length)
  })
})
