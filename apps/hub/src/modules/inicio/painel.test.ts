import { describe, expect, it } from 'vitest'
import {
  agregarPaineis,
  alinharPorDia,
  caminhoDaArea,
  caminhoDaLinha,
  coordenadas,
  escalaY,
  marcasY,
  ordenarLojas,
  primeiroNome,
  saudacao,
  variacao,
} from './painel'

const dia = (dia: number, pedidos: number, faturado = pedidos * 10) => ({
  dia,
  pedidos,
  faturado,
})

describe('variação contra o mesmo período', () => {
  it('mede alta, baixa e empate', () => {
    expect(variacao(12, 8).sentido).toBe('alta')
    expect(variacao(8, 12).sentido).toBe('baixa')
    expect(variacao(8, 8).sentido).toBe('igual')
  })

  it('devolve a diferença absoluta junto da fração', () => {
    expect(variacao(12, 8)).toEqual({ delta: 4, fracao: 0.5, sentido: 'alta' })
  })

  /**
   * Sair de zero é aumento sem porcentagem definida. "+∞%" é ruído e "+100%"
   * afirma que dobrou — as duas formas comuns de mentir sobre a mesma coisa.
   */
  it('não inventa porcentagem quando a base é zero', () => {
    expect(variacao(9, 0).fracao).toBeNull()
    expect(variacao(9, 0).delta).toBe(9)
    expect(variacao(0, 0)).toEqual({ delta: 0, fracao: null, sentido: 'igual' })
  })

  it('mede queda em fração negativa', () => {
    expect(variacao(5, 10).fracao).toBe(-0.5)
  })
})

describe('alinhamento das duas séries por dia do mês', () => {
  /**
   * A API só devolve dias com pedido. Sem preencher, o traço ligaria o dia 1
   * direto no dia 4 e afirmaria venda nos dois dias parados do meio.
   */
  it('preenche com zero os dias sem pedido', () => {
    const curva = alinharPorDia([dia(1, 3), dia(4, 5)], [], 'pedidos')

    expect(curva.map((d) => d.atual)).toEqual([3, 0, 0, 5])
  })

  it('sobrepõe o mesmo dia do mês anterior', () => {
    const curva = alinharPorDia([dia(1, 3), dia(2, 4)], [dia(1, 9), dia(2, 1)], 'pedidos')

    expect(curva).toEqual([
      { dia: 1, atual: 3, anterior: 9 },
      { dia: 2, atual: 4, anterior: 1 },
    ])
  })

  /**
   * O recorte do mês anterior para no dia de hoje. Continuar a linha cinza em
   * zero afirmaria que a loja não vendeu naquele dia, quando o que houve é que
   * o dia ainda não chegou.
   */
  it('corta a série anterior onde o recorte dela termina', () => {
    const curva = alinharPorDia([dia(1, 3), dia(2, 4), dia(3, 5)], [dia(1, 9)], 'pedidos')

    expect(curva.map((d) => d.anterior)).toEqual([9, null, null])
  })

  it('lê a medida pedida', () => {
    expect(alinharPorDia([dia(1, 3, 250)], [], 'faturado')[0]!.atual).toBe(250)
  })

  it('vai até o maior dia visto, e não até 31', () => {
    expect(alinharPorDia([dia(1, 1)], [dia(6, 1)], 'pedidos')).toHaveLength(6)
  })

  it('devolve vazio quando não há nada nos dois meses', () => {
    expect(alinharPorDia([], [], 'pedidos')).toEqual([])
  })
})

describe('escala do eixo', () => {
  it('sobe para um número que se lê', () => {
    expect(escalaY(87)).toBe(100)
    expect(escalaY(12)).toBe(20)
    expect(escalaY(4)).toBe(5)
    expect(escalaY(230)).toBe(250)
  })

  it('não encolhe abaixo do maior valor', () => {
    for (const v of [1, 3, 7, 19, 44, 99, 101, 999, 1001]) {
      expect(escalaY(v)).toBeGreaterThanOrEqual(v)
    }
  })

  it('tem teto mesmo com série toda zerada', () => {
    expect(escalaY(0)).toBe(1)
    expect(escalaY(-5)).toBe(1)
  })

  it('dá três marcas: base, meio e teto', () => {
    expect(marcasY(100)).toEqual([0, 50, 100])
  })
})

describe('geometria da curva', () => {
  const caixa = { largura: 100, altura: 50 }

  it('começa na esquerda e termina na direita', () => {
    const pontos = coordenadas([0, 5, 10], 10, caixa)

    expect(pontos[0]![0]).toBe(0)
    expect(pontos[2]![0]).toBe(100)
  })

  /** Y é invertido: valor maior fica mais alto, ou seja, mais perto de zero. */
  it('inverte o eixo vertical', () => {
    const pontos = coordenadas([0, 10], 10, caixa)

    expect(pontos[0]![1]).toBe(50)
    expect(pontos[1]![1]).toBe(0)
  })

  it('põe o ponto único no meio, e não colado no eixo', () => {
    expect(coordenadas([5], 10, caixa)[0]![0]).toBe(50)
  })

  it('pula os dias sem par no mês anterior', () => {
    expect(coordenadas([5, null, null], 10, caixa)).toHaveLength(1)
  })

  it('desenha um caminho de retas', () => {
    expect(caminhoDaLinha([0, 10], 10, caixa)).toBe('M0 50 L100 0')
  })

  it('fecha a área na base', () => {
    expect(caminhoDaArea([0, 10], 10, caixa)).toBe('M0 50 L100 0 L100 50 L0 50 Z')
  })

  it('não devolve caminho para série vazia', () => {
    expect(caminhoDaLinha([], 10, caixa)).toBe('')
    expect(caminhoDaArea([], 10, caixa)).toBe('')
    expect(caminhoDaLinha([null, null], 10, caixa)).toBe('')
  })
})

describe('agregação de várias lojas', () => {
  const loja = (
    unidade: number,
    nome: string,
    p: {
      emAberto?: number
      atrasados?: number
      maisAntigoEm?: string | null
      atual?: number
      anterior?: number
      faturado?: number
      faturadoAnterior?: number
      porDia?: Array<{ dia: number; pedidos: number; faturado: number }>
      media?: number | null
      notas?: number
      comentarios?: Array<{ id: number; nota: number; texto: string; em: string }>
      pausados?: number
      totalCatalogo?: number
    } = {}
  ) => ({
    unidade,
    nome,
    painel: {
      operacao: {
        emAberto: p.emAberto ?? 0,
        atrasados: p.atrasados ?? 0,
        maisAntigoEm: p.maisAntigoEm ?? null,
      },
      mes: {
        atual: p.atual ?? 0,
        mesmoPeriodoMesAnterior: p.anterior ?? 0,
        faturado: p.faturado ?? 0,
        faturadoMesmoPeriodoMesAnterior: p.faturadoAnterior ?? 0,
        ticketMedio: p.atual ? (p.faturado ?? 0) / p.atual : null,
        ticketMedioMesmoPeriodoMesAnterior: null,
        porDia: p.porDia ?? [],
        porDiaMesAnterior: [],
      },
      avaliacoes: {
        media: p.media ?? null,
        total: p.notas ?? 0,
        comentarios: p.comentarios ?? [],
      },
      catalogo: { pausados: p.pausados ?? 0, total: p.totalCatalogo ?? 0 },
    },
  })

  it('soma contagem, dinheiro e catálogo', () => {
    const junto = agregarPaineis([
      loja(1, 'Mooca', { emAberto: 4, atrasados: 1, atual: 91, faturado: 8917, pausados: 1, totalCatalogo: 13 }),
      loja(2, 'Santana', { emAberto: 23, atrasados: 16, atual: 154, faturado: 15061.8, pausados: 0, totalCatalogo: 13 }),
    ])

    expect(junto.operacao.emAberto).toBe(27)
    expect(junto.operacao.atrasados).toBe(17)
    expect(junto.mes.atual).toBe(245)
    expect(junto.mes.faturado).toBe(23978.8)
    expect(junto.catalogo).toEqual({ pausados: 1, total: 26 })
  })

  /**
   * O erro clássico. 150 pedidos a R$ 90 e 5 a R$ 200 dão média das médias
   * R$ 145 — e ticket real R$ 93,55. A média das médias trata lojas de tamanhos
   * diferentes como se pesassem igual.
   */
  it('calcula ticket médio pelos totais, não pela média das médias', () => {
    const junto = agregarPaineis([
      loja(1, 'Grande', { atual: 150, faturado: 13500 }),
      loja(2, 'Pequena', { atual: 5, faturado: 1000 }),
    ])

    expect(junto.mes.ticketMedio).toBe(93.55)
    expect(junto.mes.ticketMedio).not.toBe(145)
  })

  it('pondera a nota média pela quantidade de notas', () => {
    const junto = agregarPaineis([
      loja(1, 'Muitas', { media: 4.0, notas: 100 }),
      loja(2, 'Poucas', { media: 5.0, notas: 10 }),
    ])

    // (4,0×100 + 5,0×10) / 110 = 4,09 → 4,1. A média das médias diria 4,5.
    expect(junto.avaliacoes.media).toBe(4.1)
    expect(junto.avaliacoes.total).toBe(110)
  })

  it('não divide por zero quando não há pedido nem nota', () => {
    const junto = agregarPaineis([loja(1, 'Parada'), loja(2, 'Nova')])

    expect(junto.mes.ticketMedio).toBeNull()
    expect(junto.avaliacoes.media).toBeNull()
  })

  it('pega o pedido que espera há mais tempo em qualquer loja', () => {
    const junto = agregarPaineis([
      loja(1, 'A', { maisAntigoEm: '2026-08-18T10:00:00.000Z' }),
      loja(2, 'B', { maisAntigoEm: '2026-08-18T08:00:00.000Z' }),
      loja(3, 'C', { maisAntigoEm: null }),
    ])

    expect(junto.operacao.maisAntigoEm).toBe('2026-08-18T08:00:00.000Z')
  })

  it('devolve nulo quando nenhuma loja tem fila', () => {
    expect(agregarPaineis([loja(1, 'A'), loja(2, 'B')]).operacao.maisAntigoEm).toBeNull()
  })

  it('soma a curva dia a dia, alinhando os dias', () => {
    const junto = agregarPaineis([
      loja(1, 'A', { porDia: [dia(1, 3), dia(2, 4)] }),
      loja(2, 'B', { porDia: [dia(2, 5), dia(4, 6)] }),
    ])

    expect(junto.mes.porDia).toEqual([
      { dia: 1, pedidos: 3, faturado: 30 },
      { dia: 2, pedidos: 9, faturado: 90 },
      { dia: 4, pedidos: 6, faturado: 60 },
    ])
  })

  /** Três do conjunto, e não três de cada loja. */
  it('reúne os comentários mais recentes de todas as lojas', () => {
    const c = (id: number, em: string) => ({ id, nota: 5, texto: 'oi', em })
    const junto = agregarPaineis([
      loja(1, 'A', { comentarios: [c(1, '2026-08-10T00:00:00Z'), c(2, '2026-08-01T00:00:00Z')] }),
      loja(2, 'B', { comentarios: [c(3, '2026-08-17T00:00:00Z'), c(4, '2026-08-05T00:00:00Z')] }),
    ])

    expect(junto.avaliacoes.comentarios.map((x) => x.id)).toEqual([3, 1, 4])
  })

  it('com uma loja só, devolve os mesmos números', () => {
    const uma = loja(2, 'Santana', { emAberto: 23, atual: 154, faturado: 15061.8, media: 4.5, notas: 65 })
    const junto = agregarPaineis([uma])

    expect(junto.operacao.emAberto).toBe(23)
    expect(junto.mes.faturado).toBe(15061.8)
    expect(junto.avaliacoes.media).toBe(4.5)
  })
})

describe('ordenação da quebra por loja', () => {
  const l = (nome: string, emAberto: number, faturado: number) => ({
    unidade: 1,
    nome,
    painel: {
      operacao: { emAberto, atrasados: 0, maisAntigoEm: null },
      mes: {
        atual: 0,
        mesmoPeriodoMesAnterior: 0,
        faturado,
        faturadoMesmoPeriodoMesAnterior: 0,
        ticketMedio: null,
        ticketMedioMesmoPeriodoMesAnterior: null,
        porDia: [],
        porDiaMesAnterior: [],
      },
      avaliacoes: { media: null, total: 0, comentarios: [] },
      catalogo: { pausados: 0, total: 0 },
    },
  })

  const lojas = [l('Perdizes', 1, 7186), l('Santana', 23, 15061.8), l('Moema', 5, 10773)]

  /** Número desce por padrão: numa tabela de operação, procura-se o maior. */
  it('põe o maior número primeiro', () => {
    expect(ordenarLojas(lojas, 'faturado', false).map((x) => x.nome)).toEqual([
      'Santana',
      'Moema',
      'Perdizes',
    ])
  })

  it('inverte quando pedido', () => {
    expect(ordenarLojas(lojas, 'emAberto', true).map((x) => x.nome)).toEqual([
      'Perdizes',
      'Moema',
      'Santana',
    ])
  })

  it('ordena nome em ordem alfabética', () => {
    expect(ordenarLojas(lojas, 'nome', false).map((x) => x.nome)).toEqual([
      'Moema',
      'Perdizes',
      'Santana',
    ])
  })

  it('não altera a lista recebida', () => {
    const original = [...lojas]
    ordenarLojas(lojas, 'faturado', false)
    expect(lojas).toEqual(original)
  })
})

describe('saudação', () => {
  const as = (hora: number) => new Date(2026, 7, 18, hora, 30).getTime()

  it('muda com a hora do dia', () => {
    expect(saudacao(as(8))).toBe('Bom dia')
    expect(saudacao(as(14))).toBe('Boa tarde')
    expect(saudacao(as(21))).toBe('Boa noite')
  })

  /** A tarde começa ao meio-dia, não às 13h — é o uso corrente em pt-BR. */
  it('vira a tarde ao meio-dia', () => {
    expect(saudacao(as(11))).toBe('Bom dia')
    expect(saudacao(as(12))).toBe('Boa tarde')
  })

  it('vira a noite às 18h', () => {
    expect(saudacao(as(17))).toBe('Boa tarde')
    expect(saudacao(as(18))).toBe('Boa noite')
  })

  /** Madrugada conta como noite: ninguém diz "bom dia" às três da manhã. */
  it('trata a madrugada como noite', () => {
    expect(saudacao(as(2))).toBe('Boa noite')
    expect(saudacao(as(4))).toBe('Boa noite')
    expect(saudacao(as(5))).toBe('Bom dia')
  })
})

describe('primeiro nome', () => {
  it('corta no primeiro espaço', () => {
    expect(primeiroNome('Luan Dantas')).toBe('Luan')
    expect(primeiroNome('Ana Carolina de Souza')).toBe('Ana')
  })

  it('devolve o nome inteiro quando não há o que cortar', () => {
    expect(primeiroNome('Administrador')).toBe('Administrador')
  })

  it('aguenta espaço sobrando', () => {
    expect(primeiroNome('  Luan   Dantas  ')).toBe('Luan')
  })

  /** Sem nome, quem chama decide — "Olá, " é pior que saudação nenhuma. */
  it('devolve vazio para nome vazio', () => {
    expect(primeiroNome('')).toBe('')
    expect(primeiroNome('   ')).toBe('')
  })
})
