import { describe, expect, it } from 'vitest'
import type { EstadoDaCorrida, PedidoDoQuadro } from '@matsuya/api-client'
import {
  abaDoPedido,
  idadeDaPosicao,
  partirPorAba,
  progressoDoTrecho,
} from './rota'

const AGORA = new Date('2026-08-18T12:00:00.000Z').getTime()
const atras = (minutos: number) => new Date(AGORA - minutos * 60_000).toISOString()

/** Um pedido com corrida no estado pedido. `undefined` = corrida não veio. */
function pedido(id: number, estado?: EstadoDaCorrida | null): PedidoDoQuadro {
  return {
    id,
    entrega:
      estado === undefined
        ? undefined
        : estado === null
          ? null
          : {
              estado,
              entregador: null,
              etaLojaMinutos: null,
              chegouLojaEm: null,
              fotoUrl: null,
              nota: null,
              notaDeQuantas: null,
              posicao: null,
            },
  } as unknown as PedidoDoQuadro
}

describe('a que aba o pedido pertence', () => {
  /**
   * Os três estados de coleta são situações diferentes com providências
   * diferentes — "procurando alguém", "alguém vem vindo" e "alguém parado no
   * balcão" —, mas todas têm a comida na loja. É isso que a aba agrupa.
   */
  it('põe em coleta tudo o que ainda não saiu', () => {
    expect(abaDoPedido(pedido(1, 'buscando'))).toBe('coleta')
    expect(abaDoPedido(pedido(2, 'a_caminho'))).toBe('coleta')
    expect(abaDoPedido(pedido(3, 'na_loja'))).toBe('coleta')
  })

  it('põe em entrega só o que está a caminho do cliente', () => {
    expect(abaDoPedido(pedido(4, 'em_rota'))).toBe('entrega')
  })

  it('deixa de fora o que já terminou', () => {
    expect(abaDoPedido(pedido(5, 'entregue'))).toBeNull()
    expect(abaDoPedido(pedido(6, 'falhou'))).toBeNull()
  })

  /**
   * Duas ausências diferentes, e as duas saem da tela: `null` é resposta —
   * retirada no balcão ou pedido não aceito, não há corrida. `undefined` é a
   * falta de uma: o resumo do socket é enxuto e não trouxe o campo.
   */
  it('deixa de fora quem não tem corrida, e quem não a trouxe', () => {
    expect(abaDoPedido(pedido(7, null))).toBeNull()
    expect(abaDoPedido(pedido(8))).toBeNull()
  })
})

describe('partição', () => {
  it('separa nas duas listas, na ordem recebida', () => {
    const { coleta, entrega } = partirPorAba([
      pedido(1, 'em_rota'),
      pedido(2, 'buscando'),
      pedido(3, 'em_rota'),
      pedido(4, 'na_loja'),
      pedido(5, 'entregue'),
      pedido(6, null),
    ])

    expect(coleta.map((p) => p.id)).toEqual([2, 4])
    expect(entrega.map((p) => p.id)).toEqual([1, 3])
  })

  it('devolve as duas chaves mesmo sem nada na rua', () => {
    expect(partirPorAba([])).toEqual({ coleta: [], entrega: [] })
  })
})

describe('progresso do trecho', () => {
  it('mede a fração do tempo previsto que já passou', () => {
    expect(progressoDoTrecho(atras(5), 10, AGORA)).toBe(0.5)
    expect(progressoDoTrecho(atras(2), 8, AGORA)).toBe(0.25)
  })

  /** Atrasado não está a 140% do caminho — está atrasado, e o relógio diz isso. */
  it('satura em 1 quando o tempo estoura', () => {
    expect(progressoDoTrecho(atras(20), 10, AGORA)).toBe(1)
  })

  it('não volta no tempo com carimbo no futuro', () => {
    const daqui = new Date(AGORA + 60_000).toISOString()
    expect(progressoDoTrecho(daqui, 10, AGORA)).toBe(0)
  })

  /** Sem previsão não há fração: o chip diz "a caminho" sem barra. */
  it('devolve nulo sem início ou sem previsão', () => {
    expect(progressoDoTrecho(null, 10, AGORA)).toBeNull()
    expect(progressoDoTrecho(atras(5), null, AGORA)).toBeNull()
    expect(progressoDoTrecho(atras(5), 0, AGORA)).toBeNull()
  })
})

describe('idade da posição', () => {
  it('conta em minutos inteiros', () => {
    expect(idadeDaPosicao(atras(0), AGORA)).toBe(0)
    expect(idadeDaPosicao(atras(7), AGORA)).toBe(7)
  })

  it('não fica negativa com relógio adiantado', () => {
    expect(idadeDaPosicao(new Date(AGORA + 30_000).toISOString(), AGORA)).toBe(0)
  })
})
