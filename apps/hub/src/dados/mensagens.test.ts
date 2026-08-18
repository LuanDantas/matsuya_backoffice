import { beforeEach, describe, expect, it } from 'vitest'
import type { Mudanca } from '@matsuya/contracts'
import type { MensagemDoChat } from '@matsuya/api-client'
import {
  agruparPorAutor,
  agruparPorDia,
  aplicarChegada,
  casarOtimista,
  janelaDeMensagens,
  marcarFalha,
  mensagemDaMudanca,
  mesclarMensagem,
  ordenarMensagens,
  podarThreads,
  proximoIdLocal,
  reiniciarIdLocal,
  ultimaDoCliente,
  type MensagemLocal,
} from './mensagens'

const AGORA = new Date('2026-08-18T15:00:00.000Z').getTime()
const atras = (s: number) => new Date(AGORA - s * 1000).toISOString()

function msg(over: Partial<MensagemLocal> = {}): MensagemLocal {
  return {
    id: 1,
    orderId: 42,
    authorType: 'staff',
    authorUserId: 7,
    authorLabel: 'ana@matsuya',
    body: 'oi',
    hidden: false,
    readByStaff: false,
    createdAt: atras(0),
    ...over,
  }
}

beforeEach(() => reiniciarIdLocal())

describe('proximoIdLocal', () => {
  it('não colide consigo mesmo no mesmo milissegundo', () => {
    // Era `-Date.now()`: dois envios no mesmo milissegundo davam o MESMO id — e
    // como o id é chave de dedupe, isso fundia duas mensagens distintas em uma.
    const ids = [proximoIdLocal(), proximoIdLocal(), proximoIdLocal()]
    expect(new Set(ids).size).toBe(3)
  })

  it('é sempre negativo, para nunca colidir com id de servidor', () => {
    expect(proximoIdLocal()).toBeLessThan(0)
  })
})

describe('ordenarMensagens', () => {
  it('põe as confirmadas em ordem de id', () => {
    const fora = [msg({ id: 3 }), msg({ id: 1 }), msg({ id: 2 })]
    expect(ordenarMensagens(fora).map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('mantém as pendentes no fim e na ordem de envio', () => {
    /*
     * A armadilha silenciosa. O id local é negativo e decrescente, então a
     * pendente MAIS NOVA tem o id MENOR: ordenar tudo por id crescente inverte
     * as duas últimas mensagens que a pessoa digitou. Só aparece a partir do
     * segundo envio antes de o primeiro resolver.
     */
    const primeira = msg({ id: proximoIdLocal(), body: 'primeira', pendente: true })
    const segunda = msg({ id: proximoIdLocal(), body: 'segunda', pendente: true })

    const ordenada = ordenarMensagens([msg({ id: 5 }), primeira, segunda])
    expect(ordenada.map((m) => m.body)).toEqual(['oi', 'primeira', 'segunda'])
  })

  it('não usa o carimbo de tempo para ordenar', () => {
    // O `createdAt` da otimista vem do relógio do tablet, que erra por minutos.
    // Se ele ordenasse, a mensagem recém-digitada subiria a conversa.
    const antiga = msg({ id: 2, createdAt: atras(600) })
    const nova = msg({ id: 1, createdAt: atras(0) })
    expect(ordenarMensagens([antiga, nova]).map((m) => m.id)).toEqual([1, 2])
  })
})

describe('mesclarMensagem', () => {
  it('insere o que não existe', () => {
    const lista = [msg({ id: 1 })]
    expect(mesclarMensagem(lista, msg({ id: 2 }))).toHaveLength(2)
  })

  it('substitui por id em vez de duplicar', () => {
    const lista = [msg({ id: 1, body: 'antes' })]
    const saida = mesclarMensagem(lista, msg({ id: 1, body: 'depois' }))
    expect(saida).toHaveLength(1)
    expect(saida[0]!.body).toBe('depois')
  })

  it('devolve a mesma referência quando nada muda', () => {
    // O efeito de rolagem depende de `[mensagens]`. Referência nova a cada
    // evento faria a tela reagir a uma mudança que não aconteceu.
    const lista = [msg({ id: 1 })]
    expect(mesclarMensagem(lista, msg({ id: 1 }))).toBe(lista)
  })
})

describe('casarOtimista', () => {
  const pendente = () =>
    msg({ id: -1, body: 'já vai sair', pendente: true, createdAt: atras(2) })

  it('reconhece o eco do próprio envio', () => {
    const eco = msg({ id: 90, body: 'já vai sair', authorUserId: 7 })
    expect(casarOtimista([pendente()], eco, 7, AGORA)).toBe(-1)
  })

  it('ignora mensagem de outro operador com o mesmo texto', () => {
    const deOutro = msg({ id: 90, body: 'já vai sair', authorUserId: 9 })
    expect(casarOtimista([pendente()], deOutro, 7, AGORA)).toBeNull()
  })

  it('ignora mensagem do cliente', () => {
    const doCliente = msg({ id: 90, body: 'já vai sair', authorType: 'customer' })
    expect(casarOtimista([pendente()], doCliente, 7, AGORA)).toBeNull()
  })

  it('não casa fora da janela', () => {
    const velha = msg({ id: -1, body: 'x', pendente: true, createdAt: atras(600) })
    const eco = msg({ id: 90, body: 'x', authorUserId: 7 })
    expect(casarOtimista([velha], eco, 7, AGORA)).toBeNull()
  })

  it('casa a pendente mais antiga primeiro', () => {
    // Dois "ok" seguidos: o primeiro eco tem de confirmar a primeira bolha,
    // senão elas trocam de lugar na tela.
    const a = msg({ id: -1, body: 'ok', pendente: true, createdAt: atras(4) })
    const b = msg({ id: -2, body: 'ok', pendente: true, createdAt: atras(2) })
    const eco = msg({ id: 90, body: 'ok', authorUserId: 7 })
    expect(casarOtimista([a, b], eco, 7, AGORA)).toBe(-1)
  })
})

describe('aplicarChegada', () => {
  it('colapsa a otimista numa bolha só', () => {
    const lista = [msg({ id: -1, body: 'saiu', pendente: true, createdAt: atras(1) })]
    const saida = aplicarChegada(lista, msg({ id: 90, body: 'saiu' }), 7, AGORA)

    expect(saida).toHaveLength(1)
    expect(saida[0]!.id).toBe(90)
    expect(saida[0]!.pendente).toBeUndefined()
  })

  it('termina em uma bolha com o eco chegando antes da resposta HTTP', () => {
    const lista = [msg({ id: -1, body: 'saiu', pendente: true, createdAt: atras(1) })]
    const real = msg({ id: 90, body: 'saiu' })

    // Socket primeiro…
    const depoisDoEco = aplicarChegada(lista, real, 7, AGORA)
    // …e o POST resolvendo em seguida, com a MESMA mensagem.
    const depoisDoPost = aplicarChegada(depoisDoEco, real, 7, AGORA)

    expect(depoisDoPost).toHaveLength(1)
  })

  it('termina em duas bolhas quando o casamento foi falso, sem perder nada', () => {
    /*
     * Dois tablets no mesmo login mandam "ok" quase juntos. O eco do tablet A
     * pode casar com a pendente do tablet B. A cura é a resolução do POST
     * trazer a mensagem real com OUTRO id — e por isso ela precisa ser mescla,
     * nunca um `filter` seco.
     */
    const lista = [msg({ id: -1, body: 'ok', pendente: true, createdAt: atras(1) })]
    const doOutroTablet = msg({ id: 90, body: 'ok' })
    const minha = msg({ id: 91, body: 'ok' })

    let saida = aplicarChegada(lista, doOutroTablet, 7, AGORA)
    saida = aplicarChegada(saida, minha, 7, AGORA)

    expect(saida.map((m) => m.id)).toEqual([90, 91])
  })
})

describe('mensagemDaMudanca', () => {
  const linha = (summary: Record<string, unknown>): Mudanca => ({
    seq: 5,
    entityType: 'chat_message',
    entityId: 42,
    op: 'created',
    version: 1,
    summary,
    occurredAt: atras(0),
  })

  it('lê a mensagem da linha do diário', () => {
    const m = mensagemDaMudanca(linha({ ...msg({ id: 90 }) } as Record<string, unknown>))
    expect(m?.id).toBe(90)
    expect(m?.authorType).toBe('staff')
  })

  it('recusa o que não é mensagem', () => {
    // `summary` é `Record<string, unknown>` no contrato — o tipo não promete
    // nada, e isto chega de rede pelos dois transportes.
    expect(mensagemDaMudanca(linha({}))).toBeNull()
    expect(mensagemDaMudanca(linha({ id: 1 }))).toBeNull()
    expect(mensagemDaMudanca(linha({ id: 1, body: 'x', authorType: 'gerente' }))).toBeNull()
  })

  it('ignora linha que não é de chat', () => {
    const pedido = { ...linha({}), entityType: 'order' as const }
    expect(mensagemDaMudanca(pedido)).toBeNull()
  })
})

describe('janelaDeMensagens', () => {
  const muitas = (n: number) =>
    Array.from({ length: n }, (_, i) => msg({ id: i + 1, body: String(i + 1) }))

  it('não corta nada abaixo do limite', () => {
    const { visiveis, restantes } = janelaDeMensagens(muitas(50), 200)
    expect(visiveis).toHaveLength(50)
    expect(restantes).toBe(0)
  })

  it('mantém as ÚLTIMAS, que é onde a conversa está', () => {
    const { visiveis, restantes } = janelaDeMensagens(muitas(250), 200)
    expect(visiveis).toHaveLength(200)
    expect(visiveis[visiveis.length - 1]!.body).toBe('250')
    expect(restantes).toBe(50)
  })

  it('some com as ocultas', () => {
    const lista = [msg({ id: 1 }), msg({ id: 2, hidden: true }), msg({ id: 3 })]
    expect(janelaDeMensagens(lista, 200).visiveis.map((m) => m.id)).toEqual([1, 3])
  })
})

describe('agruparPorDia', () => {
  it('quebra quando o dia local vira', () => {
    const lista = [
      msg({ id: 1, createdAt: '2026-08-17T14:00:00.000Z' }),
      msg({ id: 2, createdAt: '2026-08-18T14:00:00.000Z' }),
      msg({ id: 3, createdAt: '2026-08-18T15:00:00.000Z' }),
    ]
    const grupos = agruparPorDia(lista)
    expect(grupos).toHaveLength(2)
    expect(grupos[1]!.mensagens).toHaveLength(2)
  })
})

describe('agruparPorAutor', () => {
  it('junta mensagens seguidas de quem fala', () => {
    const lista = [
      msg({ id: 1, authorType: 'staff', authorUserId: 7 }),
      msg({ id: 2, authorType: 'staff', authorUserId: 7 }),
      msg({ id: 3, authorType: 'customer', authorUserId: null }),
    ]
    expect(agruparPorAutor(lista).map((g) => g.length)).toEqual([2, 1])
  })

  it('separa operadores diferentes da mesma loja', () => {
    // Num turno de quatro pessoas, "a loja respondeu" não diz quem.
    const lista = [
      msg({ id: 1, authorUserId: 7 }),
      msg({ id: 2, authorUserId: 9 }),
    ]
    expect(agruparPorAutor(lista)).toHaveLength(2)
  })

  it('nunca agrupa avisos do sistema', () => {
    const lista = [
      msg({ id: 1, authorType: 'system', authorUserId: null }),
      msg({ id: 2, authorType: 'system', authorUserId: null }),
    ]
    expect(agruparPorAutor(lista)).toHaveLength(2)
  })

  it('não junta pendente com confirmada', () => {
    // A pendente precisa poder falhar sozinha, com o próprio botão de reenviar.
    const lista = [msg({ id: 1 }), msg({ id: -1, pendente: true })]
    expect(agruparPorAutor(lista)).toHaveLength(2)
  })
})

describe('ultimaDoCliente', () => {
  it('devolve a última mensagem do cliente', () => {
    const lista = [
      msg({ id: 1, authorType: 'customer' }),
      msg({ id: 2, authorType: 'customer' }),
      msg({ id: 3, authorType: 'staff' }),
    ]
    expect(ultimaDoCliente(lista)).toBe(2)
  })

  it('é nulo quando o cliente não escreveu', () => {
    // Mandar o id de uma mensagem nossa marcaria um intervalo que não é nosso.
    expect(ultimaDoCliente([msg({ id: 1, authorType: 'staff' })])).toBeNull()
  })

  it('ignora pendentes', () => {
    expect(ultimaDoCliente([msg({ id: -1, authorType: 'customer' })])).toBeNull()
  })
})

describe('marcarFalha', () => {
  it('deixa a mensagem visível, e não pendente', () => {
    // Some da tela e o operador acha que respondeu — e o cliente continua
    // esperando.
    const saida = marcarFalha([msg({ id: -1, pendente: true })], -1)
    expect(saida).toHaveLength(1)
    expect(saida[0]!.falhou).toBe(true)
    expect(saida[0]!.pendente).toBe(false)
  })
})

describe('podarThreads', () => {
  const threads = (n: number) =>
    new Map(Array.from({ length: n }, (_, i) => [i + 1, { tocadaEm: i + 1 }]))

  it('não poda abaixo do limite', () => {
    expect(podarThreads(threads(3), 10).size).toBe(3)
  })

  it('mantém as mais recentes', () => {
    const podadas = podarThreads(threads(12), 10)
    expect(podadas.size).toBe(10)
    expect(podadas.has(1)).toBe(false)
    expect(podadas.has(12)).toBe(true)
  })

  it('nunca poda a conversa aberta agora', () => {
    // Podar por baixo de quem está lendo é o pior momento possível.
    const podadas = podarThreads(threads(12), 10, 1)
    expect(podadas.has(1)).toBe(true)
  })
})
