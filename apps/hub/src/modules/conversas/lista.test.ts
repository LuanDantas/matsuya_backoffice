import { describe, expect, it } from 'vitest'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import {
  filtrarConversas,
  montarListaDeConversas,
  ordenarConversas,
  type LinhaDeConversa,
} from './lista'

const LOJAS = new Map([
  [1, 'Santana'],
  [2, 'Mooca'],
])

function pedido(over: Partial<PedidoDoQuadro> = {}): PedidoDoQuadro {
  return {
    id: 1,
    code: 'DM-1',
    customerLabel: 'Ana P.',
    unityId: 1,
    createdAt: '2026-08-18T12:00:00.000Z',
    ...over,
  } as PedidoDoQuadro
}

function linha(over: Partial<LinhaDeConversa> = {}): LinhaDeConversa {
  return {
    pedido: pedido(),
    loja: 'Santana',
    naoLidas: 0,
    temNovidade: false,
    ...over,
  }
}

describe('montarListaDeConversas', () => {
  it('separa quem espera resposta de quem não tem conversa', () => {
    const lista = montarListaDeConversas(
      [pedido({ id: 1 }), pedido({ id: 2 })],
      new Map([[1, 2]]),
      new Set(),
      LOJAS
    )

    expect(lista.aguardando.map((l) => l.pedido.id)).toEqual([1])
    expect(lista.emAberto.map((l) => l.pedido.id)).toEqual([2])
  })

  it('inclui pedidos de TODAS as lojas selecionadas', () => {
    /*
     * O defeito que isto conserta: a tela usava `unidadeFoco` para as não-lidas
     * enquanto recebia os pedidos de todas as lojas. Um pedido de outra loja
     * nunca entrava em "Aguardando resposta", mesmo com mensagem esperando —
     * subcontagem invisível por construção.
     */
    const lista = montarListaDeConversas(
      [pedido({ id: 1, unityId: 1 }), pedido({ id: 2, unityId: 2 })],
      new Map([[2, 1]]),
      new Set(),
      LOJAS
    )

    expect(lista.aguardando).toHaveLength(1)
    expect(lista.aguardando[0]!.pedido.unityId).toBe(2)
  })

  it('carrega o nome da loja DO PEDIDO', () => {
    // O drawer imprimia o nome da loja em foco para um pedido de outra loja.
    const lista = montarListaDeConversas([pedido({ unityId: 2 })], new Map(), new Set(), LOJAS)
    expect(lista.emAberto[0]!.loja).toBe('Mooca')
  })

  it('não esconde o pedido quando o nome da loja falta', () => {
    const lista = montarListaDeConversas([pedido({ unityId: 9 })], new Map(), new Set(), LOJAS)
    expect(lista.emAberto[0]!.loja).toBe('Unidade 9')
  })

  it('marca novidade sem promovê-la a não-lida', () => {
    // Novidade é local ("alguém escreveu desde que olhei"); não-lida é do
    // servidor e conta só cliente. Misturá-las faz a insígnia piscar.
    const lista = montarListaDeConversas([pedido({ id: 1 })], new Map(), new Set([1]), LOJAS)
    expect(lista.aguardando).toHaveLength(0)
    expect(lista.emAberto[0]!.temNovidade).toBe(true)
  })
})

describe('ordenarConversas', () => {
  it('põe mais não-lidas primeiro', () => {
    const saida = ordenarConversas([
      linha({ pedido: pedido({ id: 1 }), naoLidas: 1 }),
      linha({ pedido: pedido({ id: 2 }), naoLidas: 3 }),
    ])
    expect(saida.map((l) => l.pedido.id)).toEqual([2, 1])
  })

  it('desempata pelo pedido mais antigo — é uma fila, não uma timeline', () => {
    const saida = ordenarConversas([
      linha({ pedido: pedido({ id: 1, createdAt: '2026-08-18T13:00:00.000Z' }) }),
      linha({ pedido: pedido({ id: 2, createdAt: '2026-08-18T11:00:00.000Z' }) }),
    ])
    expect(saida.map((l) => l.pedido.id)).toEqual([2, 1])
  })

  it('não treme entre renders com pedidos do mesmo instante', () => {
    const mesmos = [
      linha({ pedido: pedido({ id: 5 }) }),
      linha({ pedido: pedido({ id: 3 }) }),
    ]
    expect(ordenarConversas(mesmos).map((l) => l.pedido.id)).toEqual([3, 5])
    expect(ordenarConversas([...mesmos].reverse()).map((l) => l.pedido.id)).toEqual([3, 5])
  })

  it('não muda o array recebido', () => {
    const entrada = [linha({ naoLidas: 1 }), linha({ naoLidas: 5 })]
    ordenarConversas(entrada)
    expect(entrada[0]!.naoLidas).toBe(1)
  })
})

describe('filtrarConversas', () => {
  const linhas = [
    linha({ pedido: pedido({ id: 1, code: 'DM-42', customerLabel: 'Ana Paula Sá' }) }),
    linha({ pedido: pedido({ id: 2, code: 'DM-99', customerLabel: 'Bruno Melo' }) }),
  ]

  it('devolve tudo com busca vazia', () => {
    expect(filtrarConversas(linhas, '   ')).toHaveLength(2)
  })

  it('acha por código', () => {
    expect(filtrarConversas(linhas, 'dm-99')).toHaveLength(1)
  })

  it('acha sem o acento certo', () => {
    // Ninguém digita "Sá" com acento enquanto o telefone toca.
    expect(filtrarConversas(linhas, 'sa')).toHaveLength(1)
    expect(filtrarConversas(linhas, 'ANA')).toHaveLength(1)
  })

  it('cai para o id quando o pedido não tem código', () => {
    const semCodigo = [linha({ pedido: pedido({ id: 77, code: null }) })]
    expect(filtrarConversas(semCodigo, '77')).toHaveLength(1)
  })

  it('não quebra com cliente ausente', () => {
    const anonimo = [linha({ pedido: pedido({ customerLabel: null }) })]
    expect(filtrarConversas(anonimo, 'ana')).toHaveLength(0)
  })
})
