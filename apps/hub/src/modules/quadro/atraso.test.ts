import { describe, expect, it } from 'vitest'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { contarAtrasados, estaAtrasado } from './Quadros'

const AGORA = new Date('2026-08-16T12:00:00.000Z').getTime()

function pedido(id: number, deadlineEmMinutos: number | null): PedidoDoQuadro {
  return {
    id,
    deadlineAt:
      deadlineEmMinutos === null
        ? null
        : new Date(AGORA + deadlineEmMinutos * 60_000).toISOString(),
  } as PedidoDoQuadro
}

describe('atraso no quadro', () => {
  it('está atrasado quando o prazo já passou', () => {
    expect(estaAtrasado(pedido(1, -1), AGORA)).toBe(true)
  })

  it('não está atrasado enquanto o prazo corre', () => {
    expect(estaAtrasado(pedido(1, 5), AGORA)).toBe(false)
  })

  /**
   * Sem prazo não há atraso. Os estados em que a próxima ação é do entregador
   * não têm relógio de propósito — cobrar da loja um tempo que não depende
   * dela é o jeito mais rápido de ensinar alguém a ignorar o alarme.
   */
  it('sem prazo, nunca está atrasado', () => {
    expect(estaAtrasado(pedido(1, null), AGORA)).toBe(false)
  })

  /**
   * A garantia que sustenta o filtro: o chip conta com a mesma regra que a
   * lista filtra. Se divergissem, o chip diria "3 atrasados" e abriria uma
   * coluna com dois — e o operador pararia de confiar nos dois números.
   */
  it('a contagem do chip é exatamente o que o filtro mostra', () => {
    const lista = [
      pedido(1, -10),
      pedido(2, 3),
      pedido(3, -1),
      pedido(4, null),
      pedido(5, 30),
    ]

    const filtrados = lista.filter((p) => estaAtrasado(p, AGORA))

    expect(contarAtrasados(lista, AGORA)).toBe(filtrados.length)
    expect(filtrados.map((p) => p.id)).toEqual([1, 3])
  })

  it('conta zero numa coluna inteira dentro do prazo', () => {
    expect(contarAtrasados([pedido(1, 5), pedido(2, null)], AGORA)).toBe(0)
  })
})
