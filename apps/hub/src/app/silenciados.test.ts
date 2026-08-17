import { describe, expect, it } from 'vitest'
import {
  comSilencio,
  estaSilenciado,
  semSilencio,
  semVencidos,
  type MapaDeSilencio,
} from './silenciados'

const AGORA = new Date('2026-08-16T12:00:00.000Z').getTime()
const QUATRO_HORAS = 4 * 60 * 60 * 1000

const com = (itens: Array<{ chave: string; contagem: number }>, em = AGORA): MapaDeSilencio =>
  comSilencio({}, itens, em)

describe('alertas dados por vistos', () => {
  it('some depois de silenciado', () => {
    const mapa = com([{ chave: '2:atrasados', contagem: 3 }])
    expect(estaSilenciado({}, '2:atrasados', 3, AGORA)).toBe(false)
    expect(estaSilenciado(mapa, '2:atrasados', 3, AGORA)).toBe(true)
  })

  /**
   * A regra que segura o risco desta funcionalidade inteira. Silenciar "3
   * atrasados" dispensa uma situação conhecida; não desliga o sensor. Se este
   * teste cair, o farol vira um botão de fazer problema sumir.
   */
  it('volta sozinho quando piora', () => {
    const mapa = com([{ chave: '2:atrasados', contagem: 3 }])
    expect(estaSilenciado(mapa, '2:atrasados', 4, AGORA)).toBe(false)
  })

  it('continua calado se melhorar', () => {
    const mapa = com([{ chave: '2:atrasados', contagem: 3 }])
    expect(estaSilenciado(mapa, '2:atrasados', 1, AGORA)).toBe(true)
  })

  /** Um turno começa com o quadro limpo, e nada fica calado de ontem. */
  it('vence em quatro horas', () => {
    const mapa = com([{ chave: '2:atrasados', contagem: 3 }])

    expect(estaSilenciado(mapa, '2:atrasados', 3, AGORA + QUATRO_HORAS - 1000)).toBe(true)
    expect(estaSilenciado(mapa, '2:atrasados', 3, AGORA + QUATRO_HORAS + 1000)).toBe(false)
  })

  it('não confunde uma loja com outra', () => {
    const mapa = com([{ chave: '2:atrasados', contagem: 3 }])
    expect(estaSilenciado(mapa, '6:atrasados', 3, AGORA)).toBe(false)
  })

  it('não confunde uma categoria com outra', () => {
    const mapa = com([{ chave: '2:atrasados', contagem: 3 }])
    expect(estaSilenciado(mapa, '2:pausados', 3, AGORA)).toBe(false)
  })

  it('silencia vários de uma vez', () => {
    const mapa = com([
      { chave: '2:atrasados', contagem: 3 },
      { chave: '2:pausados', contagem: 1 },
    ])

    expect(estaSilenciado(mapa, '2:atrasados', 3, AGORA)).toBe(true)
    expect(estaSilenciado(mapa, '2:pausados', 1, AGORA)).toBe(true)
  })

  it('reativa um e mantém os outros', () => {
    const mapa = semSilencio(
      com([
        { chave: '2:atrasados', contagem: 3 },
        { chave: '2:pausados', contagem: 1 },
      ]),
      '2:atrasados'
    )

    expect(estaSilenciado(mapa, '2:atrasados', 3, AGORA)).toBe(false)
    expect(estaSilenciado(mapa, '2:pausados', 1, AGORA)).toBe(true)
  })

  it('silenciar de novo renova o prazo e a contagem', () => {
    const antes = com([{ chave: '2:atrasados', contagem: 3 }])
    const depois = comSilencio(antes, [{ chave: '2:atrasados', contagem: 5 }], AGORA + 60_000)

    expect(estaSilenciado(depois, '2:atrasados', 5, AGORA + 60_000)).toBe(true)
    expect(estaSilenciado(depois, '2:atrasados', 6, AGORA + 60_000)).toBe(false)
  })

  it('a limpeza descarta o vencido e preserva o resto', () => {
    const mapa: MapaDeSilencio = {
      ...com([{ chave: 'novo', contagem: 1 }]),
      velho: { contagem: 1, em: AGORA - QUATRO_HORAS - 1000 },
    }

    const limpo = semVencidos(mapa, AGORA)
    expect(Object.keys(limpo)).toEqual(['novo'])
  })
})
