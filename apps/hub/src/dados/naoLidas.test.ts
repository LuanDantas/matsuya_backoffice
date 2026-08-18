import { describe, expect, it } from 'vitest'
import type { MensagemDoChat } from '@matsuya/api-client'
import { agregarNaoLidas, contarChegada, somar, zerarPedido } from './naoLidas'

function msg(over: Partial<MensagemDoChat> = {}): MensagemDoChat {
  return {
    id: 1,
    orderId: 42,
    authorType: 'customer',
    authorUserId: null,
    authorLabel: null,
    body: 'cadê meu pedido?',
    hidden: false,
    readByStaff: false,
    createdAt: '2026-08-18T15:00:00.000Z',
    ...over,
  }
}

describe('agregarNaoLidas', () => {
  it('soma as lojas selecionadas', () => {
    const saida = agregarNaoLidas([
      { unityId: 1, porPedido: { '10': 2 } },
      { unityId: 2, porPedido: { '20': 1, '21': 3 } },
    ])

    expect(saida.total).toBe(6)
    expect(saida.porPedido.get(21)).toBe(3)
  })

  it('reporta a loja que falhou em vez de contá-la como zero', () => {
    /*
     * O defeito que este teste guarda: tratar falha como zero faz a insígnia
     * dizer 2 quando a realidade pode ser 20, e sem nenhum sinal de que a
     * pergunta não foi respondida.
     */
    const saida = agregarNaoLidas([
      { unityId: 1, porPedido: { '10': 2 } },
      { unityId: 2, porPedido: null },
    ])

    expect(saida.total).toBe(2)
    expect(saida.lojasComFalha).toEqual([2])
  })

  it('distingue "a loja falhou" de "a loja respondeu nenhuma"', () => {
    const respondeuZero = agregarNaoLidas([{ unityId: 1, porPedido: {} }])
    expect(respondeuZero.total).toBe(0)
    expect(respondeuZero.lojasComFalha).toEqual([])

    const falhou = agregarNaoLidas([{ unityId: 1, porPedido: null }])
    expect(falhou.total).toBe(0)
    expect(falhou.lojasComFalha).toEqual([1])
  })

  it('não conta contagens inválidas', () => {
    const saida = agregarNaoLidas([
      { unityId: 1, porPedido: { '10': 0, naoNumero: 5, '11': 2 } },
    ])
    expect(saida.total).toBe(2)
  })

  it('é zero sem nenhuma loja', () => {
    expect(agregarNaoLidas([]).total).toBe(0)
  })
})

describe('contarChegada', () => {
  it('conta mensagem do cliente', () => {
    const saida = contarChegada(new Map(), 42, msg())
    expect(saida.get(42)).toBe(1)
  })

  it('NÃO conta mensagem da própria loja', () => {
    /*
     * A insígnia segue a semântica do servidor, que conta só cliente. Contar
     * mensagem de outro tablet a faria aparecer e sumir na próxima releitura —
     * e uma insígnia que mente ensina o operador a ignorá-la para sempre.
     */
    const saida = contarChegada(new Map(), 42, msg({ authorType: 'staff' }))
    expect(saida.get(42)).toBeUndefined()
  })

  it('NÃO conta aviso do sistema', () => {
    const saida = contarChegada(new Map(), 42, msg({ authorType: 'system' }))
    expect(saida.get(42)).toBeUndefined()
  })

  it('acumula sobre o que já havia', () => {
    const saida = contarChegada(new Map([[42, 2]]), 42, msg())
    expect(saida.get(42)).toBe(3)
  })
})

describe('zerarPedido', () => {
  it('zera só o pedido pedido', () => {
    const saida = zerarPedido(new Map([[42, 3], [43, 1]]), 42)
    expect(saida.has(42)).toBe(false)
    expect(saida.get(43)).toBe(1)
  })

  it('não quebra num pedido que não estava contado', () => {
    expect(somar(zerarPedido(new Map(), 42))).toBe(0)
  })
})
