import { describe, expect, it, vi } from 'vitest'
import type { Mudanca, RespostaDeMudancas } from '@matsuya/contracts'
import { Sincronizador, type EstadoDeSincronia } from './sincronizador'

const UNIDADE = 7

function envelope(seq: number, extras: Record<string, unknown> = {}) {
  return {
    type: 'order.status_changed',
    v: 1,
    seq,
    unityId: UNIDADE,
    occurredAt: '2026-08-16T12:00:00.000Z',
    serverTime: '2026-08-16T12:00:00.000Z',
    actor: { userId: 1, label: 'Ana' },
    data: {
      orderId: 100 + seq,
      version: seq,
      from: 'pending',
      to: 'confirmed',
      summary: { id: 100 + seq, status: 'confirmed' },
    },
    ...extras,
  }
}

function mudanca(seq: number): Mudanca {
  return {
    seq,
    entityType: 'order',
    entityId: 100 + seq,
    op: 'updated',
    version: seq,
    summary: { id: 100 + seq, status: 'confirmed' },
    occurredAt: '2026-08-16T12:00:00.000Z',
  }
}

/**
 * Envelope de chat — outra forma de `data`, e é isso que o ramo trata.
 *
 * `data: { orderId, message }`, sem `version` e sem `summary`. Pelo caminho de
 * pedido ele viraria uma mudança com `version: 0` e `summary: {}`.
 */
function envelopeDeChat(seq: number, orderId = 42, extras: Record<string, unknown> = {}) {
  return {
    type: 'chat.message_posted',
    v: 1,
    seq,
    unityId: UNIDADE,
    occurredAt: '2026-08-16T12:00:00.000Z',
    serverTime: '2026-08-16T12:00:00.000Z',
    actor: { userId: 1, label: 'ana@matsuya' },
    data: {
      orderId,
      message: {
        id: 900 + seq,
        orderId,
        authorType: 'staff',
        authorUserId: 1,
        authorLabel: 'ana@matsuya',
        body: 'Já está saindo',
        hidden: false,
        readByStaff: false,
        createdAt: '2026-08-16T12:00:00.000Z',
      },
    },
    ...extras,
  }
}

/** A linha do diário que a recuperação HTTP devolve para a MESMA mensagem. */
function mudancaDeChat(seq: number, orderId = 42): Mudanca {
  return {
    seq,
    entityType: 'chat_message',
    entityId: orderId,
    op: 'created',
    version: 1,
    summary: {
      id: 900 + seq,
      orderId,
      authorType: 'staff',
      authorUserId: 1,
      authorLabel: 'ana@matsuya',
      body: 'Já está saindo',
      hidden: false,
      readByStaff: false,
      createdAt: '2026-08-16T12:00:00.000Z',
    },
    occurredAt: '2026-08-16T12:00:00.000Z',
  }
}

interface Cenario {
  sincronizador: Sincronizador
  aplicados: number[]
  /** As mudanças inteiras, para conferir forma e não só ordem. */
  mudancas: Mudanca[]
  estados: EstadoDeSincronia[]
  recargas: number
  buscar: ReturnType<typeof vi.fn>
}

function montar(
  respostas: RespostaDeMudancas[] = [],
  opcoes: { limite?: number; maximoDePaginas?: number } = {}
): Cenario {
  const aplicados: number[] = []
  const mudancas: Mudanca[] = []
  const estados: EstadoDeSincronia[] = []
  let recargas = 0

  const buscar = vi.fn(async () => {
    const proxima = respostas.shift()
    return (
      proxima ?? { changes: [], cursor: 0, hasMore: false, snapshotRequired: false }
    )
  })

  const cenario: Cenario = {
    aplicados,
    mudancas,
    estados,
    get recargas() {
      return recargas
    },
    buscar,
  } as Cenario

  cenario.sincronizador = new Sincronizador({
    unityId: UNIDADE,
    buscarMudancas: buscar,
    aplicar: (m) => {
      aplicados.push(m.seq)
      mudancas.push(m)
    },
    aoExigirRecarga: () => {
      recargas += 1
    },
    aoMudarEstado: (e) => estados.push(e),
    ...opcoes,
  })

  return cenario
}

describe('sincronizador de cursor', () => {
  it('aplica evento em sequência e avança o cursor', () => {
    const c = montar()
    c.sincronizador.iniciarEm(10)

    expect(c.sincronizador.aoReceberEvento(envelope(11))).toBe('aplicado')
    expect(c.sincronizador.aoReceberEvento(envelope(12))).toBe('aplicado')

    expect(c.aplicados).toEqual([11, 12])
    expect(c.sincronizador.cursorAtual).toBe(12)
    expect(c.buscar).not.toHaveBeenCalled()
  })

  // Reentrega é normal em socket. O que não pode é aplicar duas vezes.
  it('ignora duplicata sem aplicar e sem buscar', () => {
    const c = montar()
    c.sincronizador.iniciarEm(10)

    c.sincronizador.aoReceberEvento(envelope(11))
    expect(c.sincronizador.aoReceberEvento(envelope(11))).toBe('duplicata')
    expect(c.sincronizador.aoReceberEvento(envelope(5))).toBe('duplicata')

    expect(c.aplicados).toEqual([11])
    expect(c.buscar).not.toHaveBeenCalled()
  })

  // O caso central: um evento se perdeu no caminho.
  it('detecta lacuna, busca o intervalo e aplica em ordem', async () => {
    const c = montar([
      {
        changes: [mudanca(11), mudanca(12), mudanca(13)],
        cursor: 13,
        hasMore: false,
        snapshotRequired: false,
      },
    ])
    c.sincronizador.iniciarEm(10)

    expect(c.sincronizador.aoReceberEvento(envelope(13))).toBe('lacuna')
    await c.sincronizador.recuperar()

    expect(c.aplicados).toEqual([11, 12, 13])
    expect(c.sincronizador.cursorAtual).toBe(13)
    expect(c.sincronizador.estadoAtual).toBe('sincronizado')
  })

  // Se o evento que abriu a lacuna fosse descartado, ele voltaria como buraco.
  it('não perde o evento que revelou a lacuna', async () => {
    const c = montar([
      { changes: [mudanca(11)], cursor: 11, hasMore: false, snapshotRequired: false },
    ])
    c.sincronizador.iniciarEm(10)

    c.sincronizador.aoReceberEvento(envelope(12))
    await c.sincronizador.recuperar()

    // 11 veio do intervalo; 12 estava guardado e encaixou logo depois.
    expect(c.aplicados).toEqual([11, 12])
    expect(c.sincronizador.cursorAtual).toBe(12)
  })

  it('pagina enquanto houver mais', async () => {
    const c = montar([
      { changes: [mudanca(11), mudanca(12)], cursor: 12, hasMore: true, snapshotRequired: false },
      { changes: [mudanca(13)], cursor: 13, hasMore: false, snapshotRequired: false },
    ])
    c.sincronizador.iniciarEm(10)

    await c.sincronizador.recuperar()

    expect(c.aplicados).toEqual([11, 12, 13])
    expect(c.buscar).toHaveBeenCalledTimes(2)
  })

  it('pede recarga completa quando o servidor diz que o intervalo não fecha', async () => {
    const c = montar([
      { changes: [], cursor: 900, hasMore: false, snapshotRequired: true },
    ])
    c.sincronizador.iniciarEm(10)

    await c.sincronizador.recuperar()

    expect(c.recargas).toBe(1)
    expect(c.sincronizador.estadoAtual).toBe('recarga-necessaria')
    expect(c.aplicados).toEqual([])
  })

  // Uma lacuna gigantesca não pode prender a aba paginando às cegas.
  it('desiste e pede recarga quando estoura o teto de páginas', async () => {
    const respostas = Array.from({ length: 40 }, (_, i) => ({
      changes: [mudanca(11 + i)],
      cursor: 11 + i,
      hasMore: true,
      snapshotRequired: false,
    }))
    const c = montar(respostas, { maximoDePaginas: 3 })
    c.sincronizador.iniciarEm(10)

    await c.sincronizador.recuperar()

    expect(c.buscar).toHaveBeenCalledTimes(3)
    expect(c.recargas).toBe(1)
    expect(c.sincronizador.estadoAtual).toBe('recarga-necessaria')
  })

  // Duas recuperações simultâneas aplicariam o mesmo intervalo duas vezes.
  it('não roda duas recuperações em paralelo', async () => {
    let liberar: (() => void) | null = null
    const buscar = vi.fn(
      () =>
        new Promise<RespostaDeMudancas>((resolve) => {
          liberar = () =>
            resolve({ changes: [mudanca(11)], cursor: 11, hasMore: false, snapshotRequired: false })
        })
    )

    const aplicados: number[] = []
    const s = new Sincronizador({
      unityId: UNIDADE,
      buscarMudancas: buscar,
      aplicar: (m) => aplicados.push(m.seq),
      aoExigirRecarga: () => undefined,
    })
    s.iniciarEm(10)

    const a = s.recuperar()
    const b = s.recuperar()
    liberar!()
    await Promise.all([a, b])

    expect(buscar).toHaveBeenCalledTimes(1)
    expect(aplicados).toEqual([11])
  })

  describe('heartbeat', () => {
    it('dispara recuperação quando o servidor está à frente', async () => {
      const c = montar([
        { changes: [mudanca(11)], cursor: 11, hasMore: false, snapshotRequired: false },
      ])
      c.sincronizador.iniciarEm(10)

      c.sincronizador.aoReceberHeartbeat(11)
      await c.sincronizador.recuperar()

      expect(c.buscar).toHaveBeenCalled()
      expect(c.aplicados).toEqual([11])
    })

    it('fica quieto quando os cursores batem', () => {
      const c = montar()
      c.sincronizador.iniciarEm(10)

      c.sincronizador.aoReceberHeartbeat(10)
      c.sincronizador.aoReceberHeartbeat(null)

      expect(c.buscar).not.toHaveBeenCalled()
    })
  })

  describe('eventos que não devem entrar', () => {
    it('descarta envelope malformado em vez de escrever lixo no cache', () => {
      const c = montar()
      c.sincronizador.iniciarEm(10)

      expect(c.sincronizador.aoReceberEvento({ seq: 11 })).toBe('invalido')
      expect(c.sincronizador.aoReceberEvento(null)).toBe('invalido')
      expect(c.sincronizador.aoReceberEvento(envelope(11, { v: 2 }))).toBe('invalido')

      expect(c.aplicados).toEqual([])
      expect(c.sincronizador.cursorAtual).toBe(10)
    })

    // Uma aba com duas lojas abertas não pode misturar as sequências: os `seq`
    // são monotônicos por unidade, e cruzá-los corromperia os dois cursores.
    it('descarta evento de outra unidade', () => {
      const c = montar()
      c.sincronizador.iniciarEm(10)

      expect(c.sincronizador.aoReceberEvento(envelope(11, { unityId: 99 }))).toBe('invalido')
      expect(c.aplicados).toEqual([])
    })
  })

  describe('mensagens de chat', () => {
    /*
     * O motivo deste bloco existir.
     *
     * Toda mensagem grava uma linha no diário da loja e consome um `seq` da
     * MESMA sequência que o quadro usa. Enquanto o Hub não tratava
     * `chat.message_posted`, o cursor não avançava nela, e o próximo evento de
     * pedido chegava como lacuna — uma recuperação HTTP do quadro inteiro por
     * mensagem enviada, em todo Hub conectado àquela loja.
     */
    it('avança o cursor como qualquer outro evento', () => {
      const c = montar()
      c.sincronizador.iniciarEm(10)

      expect(c.sincronizador.aoReceberEvento(envelopeDeChat(11))).toBe('aplicado')
      expect(c.sincronizador.cursorAtual).toBe(11)

      // E o evento de pedido seguinte NÃO é lacuna — que é o defeito que este
      // ramo apaga.
      expect(c.sincronizador.aoReceberEvento(envelope(12))).toBe('aplicado')
      expect(c.aplicados).toEqual([11, 12])
    })

    it('traduz para a mesma forma que a recuperação HTTP devolve', () => {
      const c = montar()
      c.sincronizador.iniciarEm(10)
      c.sincronizador.aoReceberEvento(envelopeDeChat(11, 42))

      // Igualdade byte a byte com a linha do diário: é ela que permite ao
      // dedupe por `seq` tratar socket e replay como a mesma coisa.
      expect(c.mudancas[0]).toEqual(mudancaDeChat(11, 42))
    })

    it('não vira mudança de pedido com versão zero', () => {
      // O caminho antigo lia `data.version` e `data.summary`, que o envelope de
      // chat não tem — o resultado era uma mudança de pedido silenciosamente
      // vazia, que o quadro descartava e a mensagem se perdia.
      const c = montar()
      c.sincronizador.iniciarEm(0)
      c.sincronizador.aoReceberEvento(envelopeDeChat(1))

      expect(c.mudancas[0]!.entityType).toBe('chat_message')
      expect(c.mudancas[0]!.op).toBe('created')
      expect(c.mudancas[0]!.summary).not.toEqual({})
    })

    it('endereça a conversa pelo pedido, não pela mensagem', () => {
      const c = montar()
      c.sincronizador.iniciarEm(0)
      c.sincronizador.aoReceberEvento(envelopeDeChat(1, 77))

      // `entityId` é o pedido. A mensagem tem id 901 e ele não pode vazar para
      // cá — é por pedido que uma conversa é endereçada.
      expect(c.mudancas[0]!.entityId).toBe(77)
    })

    it('descarta a duplicata quando a mesma mensagem vem pelos dois caminhos', async () => {
      // Socket entrega o seq 12; a recuperação de uma lacuna anterior traz o 12
      // de novo dentro do intervalo. Sem forma igual e dedupe por seq, seriam
      // duas bolhas idênticas na tela.
      const c = montar([
        {
          changes: [mudanca(11), mudancaDeChat(12)],
          cursor: 12,
          hasMore: false,
          snapshotRequired: false,
        },
      ])
      c.sincronizador.iniciarEm(10)

      expect(c.sincronizador.aoReceberEvento(envelopeDeChat(12))).toBe('lacuna')
      await vi.waitFor(() => expect(c.aplicados).toEqual([11, 12]))

      // O 12 entrou UMA vez.
      expect(c.aplicados.filter((s) => s === 12)).toHaveLength(1)
    })

    it('mistura com eventos de pedido sem sair de ordem', async () => {
      const c = montar([
        {
          changes: [mudanca(11), mudancaDeChat(12), mudanca(13)],
          cursor: 13,
          hasMore: false,
          snapshotRequired: false,
        },
      ])
      c.sincronizador.iniciarEm(10)

      // Chega o 14 antes do intervalo: lacuna, recuperação, e tudo drena em ordem.
      expect(c.sincronizador.aoReceberEvento(envelope(14))).toBe('lacuna')
      await vi.waitFor(() => expect(c.aplicados).toEqual([11, 12, 13, 14]))
    })
  })
})
