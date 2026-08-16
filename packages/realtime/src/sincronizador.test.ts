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

interface Cenario {
  sincronizador: Sincronizador
  aplicados: number[]
  estados: EstadoDeSincronia[]
  recargas: number
  buscar: ReturnType<typeof vi.fn>
}

function montar(
  respostas: RespostaDeMudancas[] = [],
  opcoes: { limite?: number; maximoDePaginas?: number } = {}
): Cenario {
  const aplicados: number[] = []
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
    estados,
    get recargas() {
      return recargas
    },
    buscar,
  } as Cenario

  cenario.sincronizador = new Sincronizador({
    unityId: UNIDADE,
    buscarMudancas: buscar,
    aplicar: (m) => aplicados.push(m.seq),
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
})
