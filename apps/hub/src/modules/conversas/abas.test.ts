import { describe, expect, it } from 'vitest'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import {
  abaDaConversa,
  abaEfetiva,
  abaVizinha,
  aplicarFixacao,
  contagens,
  outraAba,
} from './abas'
import type { LinhaDeConversa, ListaDeConversas } from './lista'

function linha(id: number, naoLidas = 0): LinhaDeConversa {
  return {
    pedido: { id, code: `DM-${id}`, customerLabel: 'Ana P.', unityId: 1 } as PedidoDoQuadro,
    loja: 'Santana',
    naoLidas,
    temNovidade: false,
  }
}

const lista = (aguardando: LinhaDeConversa[], emAberto: LinhaDeConversa[]): ListaDeConversas => ({
  aguardando,
  emAberto,
})

describe('abaDaConversa', () => {
  const l = lista([linha(1, 2)], [linha(2)])

  it('acha em qual aba o pedido está', () => {
    expect(abaDaConversa(l, 1)).toBe('aguardando')
    expect(abaDaConversa(l, 2)).toBe('emAberto')
  })

  it('é nulo sem seleção ou para pedido que saiu do quadro', () => {
    expect(abaDaConversa(l, null)).toBeNull()
    expect(abaDaConversa(l, 99)).toBeNull()
  })
})

describe('aplicarFixacao', () => {
  it('segura a linha lida na aba de onde foi aberta', () => {
    /*
     * O defeito que isto evita: abrir uma conversa de "Aguardando" a marca como
     * lida, a contagem zera, e a linha passa a pertencer à outra aba — sumindo
     * debaixo de quem está lendo. E some segundos DEPOIS do clique, porque a
     * marcação dispara ao rolar a thread.
     */
    const depoisDeLer = lista([], [linha(1), linha(2)])
    const presa = aplicarFixacao(depoisDeLer, { pedido: 1, aba: 'aguardando', indice: 0 })

    expect(presa.aguardando.map((l) => l.pedido.id)).toEqual([1])
    expect(presa.emAberto.map((l) => l.pedido.id)).toEqual([2])
  })

  it('nunca deixa a linha nas DUAS abas', () => {
    // Duplicar faria as contagens dos chips somarem mais do que existe, que lê
    // como defeito imediatamente.
    const presa = aplicarFixacao(lista([], [linha(1)]), {
      pedido: 1,
      aba: 'aguardando',
      indice: 0,
    })
    expect(presa.aguardando).toHaveLength(1)
    expect(presa.emAberto).toHaveLength(0)
  })

  it('devolve a linha ao índice em que ela estava', () => {
    // Sem o índice, a linha lida afunda para o fim da própria aba assim que é
    // lida — as vizinhas têm não-lidas e ela passa a ter zero.
    const depois = lista([linha(7, 3), linha(8, 1)], [linha(1)])
    const presa = aplicarFixacao(depois, { pedido: 1, aba: 'aguardando', indice: 1 })

    expect(presa.aguardando.map((l) => l.pedido.id)).toEqual([7, 1, 8])
  })

  it('acrescenta quando o índice guardado ficou além do fim', () => {
    const presa = aplicarFixacao(lista([linha(7, 1)], [linha(1)]), {
      pedido: 1,
      aba: 'aguardando',
      indice: 9,
    })
    expect(presa.aguardando.map((l) => l.pedido.id)).toEqual([7, 1])
  })

  it('protege o sentido inverso: conversa aberta que RECEBE mensagem', () => {
    // Ela saltaria de "em aberto" para "aguardando" na cara de quem está lendo.
    const chegou = lista([linha(1, 1)], [])
    const presa = aplicarFixacao(chegou, { pedido: 1, aba: 'emAberto', indice: 0 })

    expect(presa.emAberto.map((l) => l.pedido.id)).toEqual([1])
    expect(presa.aguardando).toHaveLength(0)
  })

  it('não faz nada sem pino, e não muda o que recebeu', () => {
    const original = lista([linha(1, 1)], [linha(2)])
    expect(aplicarFixacao(original, null)).toBe(original)
    expect(original.aguardando).toHaveLength(1)
  })

  it('não faz nada quando a linha já está na aba presa', () => {
    const l = lista([linha(1, 1)], [])
    expect(aplicarFixacao(l, { pedido: 1, aba: 'aguardando', indice: 0 })).toBe(l)
  })

  it('não faz nada com pedido que saiu do quadro', () => {
    const l = lista([], [linha(2)])
    expect(aplicarFixacao(l, { pedido: 99, aba: 'aguardando', indice: 0 })).toBe(l)
  })
})

describe('abaEfetiva', () => {
  const vazia = { aguardando: 0, emAberto: 5 }

  it('NÃO cai para a outra aba quando a escolhida está vazia', () => {
    /*
     * O teste anti-"Em rota". Lá a queda está certa: duas filas transitórias de
     * peso parecido. Aqui "Aguardando" é estruturalmente vazia hoje — nada cria
     * mensagem de cliente — então cair faria o clique na aba parecer não
     * funcionar, e levaria embora o estado vazio que explica que o cliente não
     * PODE escrever.
     */
    expect(abaEfetiva('aguardando', null, vazia)).toBe('aguardando')
  })

  it('a escolha explícita ganha até da conversa aberta', () => {
    expect(abaEfetiva('emAberto', 'aguardando', { aguardando: 3, emAberto: 1 })).toBe('emAberto')
  })

  it('sem escolha, segue a aba da conversa aberta', () => {
    // Cobre a entrada pelo drawer do pedido: a seleção chega de fora, e sem esta
    // regra a conversa apareceria à direita sem linha nenhuma à esquerda.
    expect(abaEfetiva(null, 'emAberto', { aguardando: 3, emAberto: 1 })).toBe('emAberto')
  })

  it('sem escolha nem seleção, promove quem espera resposta', () => {
    expect(abaEfetiva(null, null, { aguardando: 2, emAberto: 5 })).toBe('aguardando')
  })

  it('sem ninguém esperando, abre em pedidos', () => {
    expect(abaEfetiva(null, null, vazia)).toBe('emAberto')
  })

  it('abre em pedidos com o quadro ainda vazio', () => {
    // `pedidos` chega vazio e só depois é preenchido pelo socket — é por isso
    // que esta função é derivada a cada render, e não fixada na montagem.
    expect(abaEfetiva(null, null, { aguardando: 0, emAberto: 0 })).toBe('emAberto')
  })
})

describe('abaVizinha', () => {
  it('as setas dão a volta', () => {
    expect(abaVizinha('aguardando', 'ArrowRight')).toBe('emAberto')
    expect(abaVizinha('emAberto', 'ArrowRight')).toBe('aguardando')
    expect(abaVizinha('emAberto', 'ArrowLeft')).toBe('aguardando')
  })

  it('Home e End vão às pontas', () => {
    expect(abaVizinha('emAberto', 'Home')).toBe('aguardando')
    expect(abaVizinha('aguardando', 'End')).toBe('emAberto')
  })

  it('é nula para tecla que não navega', () => {
    // Devolver a aba atual faria o componente reposicionar o foco a cada tecla
    // digitada, inclusive nas que deveriam simplesmente passar.
    expect(abaVizinha('aguardando', 'a')).toBeNull()
    expect(abaVizinha('aguardando', 'Enter')).toBeNull()
    expect(abaVizinha('aguardando', 'ArrowDown')).toBeNull()
  })
})

describe('contagens e outraAba', () => {
  it('conta as linhas de cada aba', () => {
    expect(contagens(lista([linha(1, 1)], [linha(2), linha(3)]))).toEqual({
      aguardando: 1,
      emAberto: 2,
    })
  })

  it('outraAba alterna', () => {
    expect(outraAba('aguardando')).toBe('emAberto')
    expect(outraAba('emAberto')).toBe('aguardando')
  })
})
