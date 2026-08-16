import { describe, expect, it } from 'vitest'
import { conflitoEhSucesso, filaOffline, VALIDADE_EM_MINUTOS, type AcaoEnfileirada } from './fila'

const acao = (extras: Partial<AcaoEnfileirada> = {}): AcaoEnfileirada => ({
  id: '1:accept',
  unityId: 2,
  orderId: 1,
  codigoDoPedido: 'M-1',
  acao: 'accept',
  statusAlvo: 'confirmed',
  versaoEsperada: 3,
  criadaEm: Date.now(),
  tentativas: 0,
  ...extras,
})

describe('fila offline', () => {
  describe('conflito que na verdade é sucesso', () => {
    /**
     * O caso que importa: a requisição chegou ao servidor, foi aplicada, e a
     * resposta se perdeu na volta. O reenvio recebe 409 — mas o pedido está
     * exatamente no estado que a ação queria.
     *
     * Tratar isso como falha faria o Hub dizer ao operador que o aceite não
     * funcionou, quando funcionou. Ele refaria a ação, receberia outro erro, e
     * concluiria que o sistema está quebrado.
     */
    it('reconhece a ação já aplicada antes da queda', () => {
      expect(conflitoEhSucesso(acao(), { currentStatus: 'confirmed' })).toBe(true)
    })

    it('não confunde com pedido que outra pessoa moveu', () => {
      expect(conflitoEhSucesso(acao(), { currentStatus: 'cancelled' })).toBe(false)
      expect(conflitoEhSucesso(acao(), { currentStatus: 'preparing' })).toBe(false)
    })

    it('trata conflito sem detalhe como falha, não como sucesso', () => {
      // Na dúvida, avisar o operador. O contrário esconderia uma ação perdida.
      expect(conflitoEhSucesso(acao(), null)).toBe(false)
      expect(conflitoEhSucesso(acao(), undefined)).toBe(false)
      expect(conflitoEhSucesso(acao(), {})).toBe(false)
    })
  })

  describe('validade', () => {
    const agora = 1_800_000_000_000
    const minutos = (n: number) => n * 60 * 1000

    it('mantém o que ainda está dentro da janela', () => {
      const recente = acao({ criadaEm: agora - minutos(VALIDADE_EM_MINUTOS - 1) })
      expect(filaOffline.vigentes([recente], agora)).toHaveLength(1)
      expect(filaOffline.vencidas([recente], agora)).toHaveLength(0)
    })

    /**
     * Depois de meia hora, reenviar deixa de ser recuperação e vira risco: o
     * pedido já pode ter sido tratado por outra tablete, cancelado ou entregue.
     * A intenção velha vai para conferência humana, não para a API.
     */
    it('separa o que passou da janela', () => {
      const velha = acao({ criadaEm: agora - minutos(VALIDADE_EM_MINUTOS + 1) })
      expect(filaOffline.vencidas([velha], agora)).toHaveLength(1)
      expect(filaOffline.vigentes([velha], agora)).toHaveLength(0)
    })

    it('não perde nem duplica ação ao separar as duas listas', () => {
      const lista = [
        acao({ id: 'a', criadaEm: agora - minutos(1) }),
        acao({ id: 'b', criadaEm: agora - minutos(45) }),
        acao({ id: 'c', criadaEm: agora - minutos(29) }),
      ]
      const vigentes = filaOffline.vigentes(lista, agora)
      const vencidas = filaOffline.vencidas(lista, agora)

      expect(vigentes.length + vencidas.length).toBe(lista.length)
      expect([...vigentes, ...vencidas].map((a) => a.id).sort()).toEqual(['a', 'b', 'c'])
    })
  })
})
