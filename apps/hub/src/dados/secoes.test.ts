import { describe, expect, it } from 'vitest'
import { ORDER_STATUSES, type OrderStatus } from '@matsuya/contracts'
import { FORA_DO_QUADRO, SECOES, secaoDoStatus } from './secoes'

describe('colunas do quadro', () => {
  /**
   * A garantia que importa: nenhum estado cai em duas colunas, e nenhum some
   * sem que a gente tenha decidido que ele some. Um estado órfão é um pedido
   * invisível — existe no banco, não existe na tela, e a loja descobre pelo
   * telefone.
   */
  it('todo estado pertence a no máximo uma coluna', () => {
    for (const status of ORDER_STATUSES) {
      const colunas = SECOES.filter((s) => s.status.includes(status))
      expect(colunas.length).toBeLessThanOrEqual(1)
    }
  })

  it('todo estado ou está numa coluna, ou está declarado fora do quadro', () => {
    for (const status of ORDER_STATUSES) {
      const naColuna = secaoDoStatus(status) !== null
      const foraDeProposito = FORA_DO_QUADRO.includes(status)
      expect(naColuna || foraDeProposito).toBe(true)
    }
  })

  /**
   * Pedido não pago não ocupa a fila da cozinha: mostrá-lo faria alguém
   * começar a preparar algo que pode nunca ser pago.
   */
  it('deixa de fora exatamente os estados de pagamento', () => {
    expect([...FORA_DO_QUADRO].sort()).toEqual(['awaiting_payment', 'payment_failed'])
  })

  it('agrupa os estados como a referência', () => {
    const porChave = (chave: string) =>
      SECOES.find((s) => s.chave === chave)?.status as OrderStatus[]

    expect(porChave('aceitar')).toEqual(['pending'])
    expect(porChave('preparo')).toEqual(['confirmed', 'preparing'])
    expect(porChave('pronto')).toEqual(['ready'])
    expect(porChave('rota')).toContain('out_for_delivery')
    expect(porChave('rota')).toContain('awaiting_courier')
    expect(porChave('finalizados')).toContain('delivered')
  })

  /**
   * Só `Aceitar` some. As outras são lugares da loja, que existem mesmo
   * desocupados; aceitar é uma pendência, e uma coluna permanente dizendo
   * "nada para aceitar" ocupa espaço sem informar.
   */
  it('só a coluna Aceitar some quando vazia', () => {
    const somem = SECOES.filter((s) => s.someQuandoVazia).map((s) => s.chave)
    expect(somem).toEqual(['aceitar'])
  })

  /**
   * Sem recorte, Finalizados cresce o turno inteiro e empurra as demais para
   * fora da tela — justamente a coluna sobre a qual ninguém precisa agir.
   */
  it('finalizados tem janela de tempo', () => {
    const finalizados = SECOES.find((s) => s.chave === 'finalizados')
    expect(finalizados?.janelaEmHoras).toBeGreaterThan(0)
  })
})
