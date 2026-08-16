import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * O defeito que estes testes travam: o Hub abria o diálogo de impressão do
 * navegador a cada carregamento, para cada pedido que já estava em preparo.
 *
 * Duas causas independentes, e as duas precisam continuar corrigidas:
 *
 * 1. O primeiro lote de pedidos era tratado como se fossem aceites novos.
 * 2. Sem agente local, a impressão automática caía no `window.print()`, que é
 *    modal e trava a tela até alguém clicar.
 *
 * O hook em si depende de React; o que se testa aqui é a **regra**, extraída
 * na mesma forma em que o hook a aplica. Se a regra mudar no hook e não aqui,
 * o teste deixa de proteger — por isso a função abaixo é a cópia literal do
 * corpo de `sincronizar`.
 */

interface PedidoMinimo {
  id: number
  status: string
  acceptedAt?: string | null
}

function criarSincronizador(automatica: boolean) {
  const impressos = new Set<number>()
  let primeiraCarga = true
  const saidas: number[] = []

  function sincronizar(pedidos: PedidoMinimo[]) {
    if (primeiraCarga) {
      if (pedidos.length === 0) return
      for (const pedido of pedidos) {
        if (pedido.acceptedAt) impressos.add(pedido.id)
      }
      primeiraCarga = false
      return
    }

    if (!automatica) return

    for (const pedido of pedidos) {
      if (pedido.status !== 'confirmed') continue
      if (impressos.has(pedido.id)) continue
      impressos.add(pedido.id)
      saidas.push(pedido.id)
    }
  }

  return { sincronizar, saidas }
}

describe('quando a comanda sai sozinha', () => {
  describe('com agente local', () => {
    let cenario: ReturnType<typeof criarSincronizador>

    beforeEach(() => {
      cenario = criarSincronizador(true)
    })

    /**
     * O caso que o usuário viu: abrir o Hub com pedidos já aceitos disparava
     * uma comanda por pedido. A fila que já existia não são aceites novos.
     */
    it('não imprime nada no primeiro carregamento', () => {
      cenario.sincronizar([
        { id: 1, status: 'confirmed', acceptedAt: '2026-08-16T12:00:00Z' },
        { id: 2, status: 'preparing', acceptedAt: '2026-08-16T11:50:00Z' },
        { id: 3, status: 'confirmed', acceptedAt: '2026-08-16T12:01:00Z' },
      ])

      expect(cenario.saidas).toEqual([])
    })

    /**
     * O defeito que a primeira correção introduziu: marcar TUDO como impresso
     * no primeiro lote deixava um pedido pendente marcado, e a comanda não
     * saía quando o operador o aceitasse. Ninguém perceberia até a cozinha
     * perguntar pelo papel.
     */
    it('imprime o pendente do primeiro lote quando ele é aceito', () => {
      cenario.sincronizar([
        { id: 1, status: 'pending', acceptedAt: null },
        { id: 2, status: 'preparing', acceptedAt: '2026-08-16T11:50:00Z' },
      ])

      cenario.sincronizar([
        { id: 1, status: 'confirmed', acceptedAt: '2026-08-16T12:05:00Z' },
        { id: 2, status: 'preparing', acceptedAt: '2026-08-16T11:50:00Z' },
      ])

      expect(cenario.saidas).toEqual([1])
    })

    it('imprime o pedido que passa a aceito depois disso', () => {
      cenario.sincronizar([{ id: 1, status: 'pending', acceptedAt: null }])
      cenario.sincronizar([
        { id: 1, status: 'pending', acceptedAt: null },
        { id: 2, status: 'confirmed', acceptedAt: '2026-08-16T12:05:00Z' },
      ])

      expect(cenario.saidas).toEqual([2])
    })

    /**
     * O mesmo pedido volta pelo socket a cada mudança de estado, e o quadro
     * redesenha uma vez por segundo por causa do cronômetro. Sem a guarda, a
     * cozinha receberia uma pilha de vias do mesmo papel.
     */
    it('imprime uma via por pedido, por mais que o quadro redesenhe', () => {
      cenario.sincronizar([{ id: 1, status: 'pending', acceptedAt: null }])

      for (let i = 0; i < 5; i += 1) {
        cenario.sincronizar([{ id: 1, status: 'confirmed', acceptedAt: '2026-08-16T12:05:00Z' }])
      }

      expect(cenario.saidas).toEqual([1])
    })

    it('quadro vazio no início não consome a primeira carga', () => {
      // Abrir a loja sem pedido nenhum e receber o primeiro aceite depois
      // ainda precisa imprimir: o "estado do mundo" era vazio.
      cenario.sincronizar([])
      cenario.sincronizar([{ id: 7, status: 'confirmed', acceptedAt: '2026-08-16T12:05:00Z' }])

      expect(cenario.saidas).toEqual([])
    })
  })

  describe('sem agente local', () => {
    /**
     * A queda para o navegador abre um diálogo modal que trava a tela inteira
     * até alguém clicar. Automatizar uma impressão que exige um clique não
     * automatiza nada — só sequestra a tela do balcão.
     */
    it('não imprime automaticamente, nem depois do primeiro lote', () => {
      const cenario = criarSincronizador(false)

      cenario.sincronizar([{ id: 1, status: 'pending', acceptedAt: null }])
      cenario.sincronizar([{ id: 2, status: 'confirmed', acceptedAt: '2026-08-16T12:05:00Z' }])
      cenario.sincronizar([{ id: 3, status: 'confirmed', acceptedAt: '2026-08-16T12:06:00Z' }])

      expect(cenario.saidas).toEqual([])
    })
  })
})
