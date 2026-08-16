import { useCallback, useEffect, useRef, useState } from 'react'
import { FalhaDaApi, FalhaDeRede, type ApiDePedidos } from '@matsuya/api-client'
import { filaOffline, conflitoEhSucesso, type AcaoEnfileirada } from './fila'

/**
 * Reenvio da fila offline, com reconciliação.
 *
 * O reenvio acontece quando a conexão volta — evento `online` do navegador, ou
 * o socket reconectando. E o resultado **nunca é aplicado em silêncio**: o
 * operador vê o que foi reenviado, o que já estava feito e o que não deu, e
 * precisa reconhecer antes da faixa sumir.
 *
 * Silenciar a reconciliação seria o pior desfecho possível: o operador ficou
 * dez minutos trabalhando offline, e não tem como saber se aquilo valeu.
 */

export type ResultadoDoReenvio = 'aplicada' | 'ja-estava' | 'recusada' | 'vencida'

export interface LinhaDaReconciliacao {
  acao: AcaoEnfileirada
  resultado: ResultadoDoReenvio
  detalhe?: string
}

export interface EstadoDaFila {
  pendentes: AcaoEnfileirada[]
  reconciliacao: LinhaDaReconciliacao[] | null
  reenviando: boolean
  disponivel: boolean
  enfileirar: (acao: Omit<AcaoEnfileirada, 'id' | 'criadaEm' | 'tentativas'>) => Promise<void>
  reenviar: () => Promise<void>
  reconhecer: () => void
}

export function useFilaOffline(
  unityId: number,
  api: ApiDePedidos,
  aoConcluir: () => void
): EstadoDaFila {
  const [pendentes, definirPendentes] = useState<AcaoEnfileirada[]>([])
  const [reconciliacao, definirReconciliacao] = useState<LinhaDaReconciliacao[] | null>(null)
  const [reenviando, definirReenviando] = useState(false)
  const disponivel = filaOffline.disponivel()
  const emCurso = useRef(false)

  const recarregarPendentes = useCallback(async () => {
    if (!disponivel) return
    definirPendentes(await filaOffline.listar(unityId))
  }, [disponivel, unityId])

  useEffect(() => {
    void recarregarPendentes()
  }, [recarregarPendentes])

  const enfileirar = useCallback(
    async (acao: Omit<AcaoEnfileirada, 'id' | 'criadaEm' | 'tentativas'>) => {
      if (!disponivel) return
      await filaOffline.enfileirar(acao)
      await recarregarPendentes()
    },
    [disponivel, recarregarPendentes]
  )

  const reenviar = useCallback(async () => {
    if (!disponivel || emCurso.current) return

    const todas = await filaOffline.listar(unityId)
    if (todas.length === 0) return

    emCurso.current = true
    definirReenviando(true)

    const linhas: LinhaDaReconciliacao[] = []
    const agora = Date.now()

    for (const acao of filaOffline.vencidas(todas, agora)) {
      linhas.push({
        acao,
        resultado: 'vencida',
        detalhe: 'Passou de 30 minutos. Confira o pedido antes de repetir.',
      })
      await filaOffline.remover(acao.id)
    }

    for (const acao of filaOffline.vigentes(todas, agora)) {
      try {
        await api.transicionar({
          orderId: acao.orderId,
          acao: acao.acao,
          reasonCode: acao.reasonCode,
          reasonNote: acao.reasonNote,
          versaoEsperada: acao.versaoEsperada,
        })
        linhas.push({ acao, resultado: 'aplicada' })
        await filaOffline.remover(acao.id)
      } catch (falha) {
        // Rede ainda fora: a ação fica na fila para a próxima tentativa. Não
        // entra na reconciliação porque nada foi decidido sobre ela.
        if (falha instanceof FalhaDeRede) {
          await filaOffline.atualizar({ ...acao, tentativas: acao.tentativas + 1 })
          continue
        }

        if (falha instanceof FalhaDaApi && falha.code === 'ORDER_STATUS_CONFLICT') {
          // Resposta perdida na volta: o servidor já tinha aplicado.
          if (conflitoEhSucesso(acao, falha.details)) {
            linhas.push({
              acao,
              resultado: 'ja-estava',
              detalhe: 'Já tinha sido registrada antes da queda.',
            })
          } else {
            const detalhes = falha.details as { currentStatus?: string } | undefined
            linhas.push({
              acao,
              resultado: 'recusada',
              detalhe: detalhes?.currentStatus
                ? `O pedido está em "${detalhes.currentStatus}" — outra pessoa mexeu nele.`
                : 'O pedido mudou enquanto você estava sem conexão.',
            })
          }
          await filaOffline.remover(acao.id)
          continue
        }

        linhas.push({
          acao,
          resultado: 'recusada',
          detalhe: falha instanceof FalhaDaApi ? falha.message : 'Falha desconhecida.',
        })
        await filaOffline.remover(acao.id)
      }
    }

    await recarregarPendentes()
    definirReenviando(false)
    emCurso.current = false

    if (linhas.length > 0) {
      definirReconciliacao(linhas)
      aoConcluir()
    }
  }, [api, aoConcluir, disponivel, recarregarPendentes, unityId])

  // A volta da conexão dispara o reenvio. O `online` do navegador é otimista —
  // ele avisa que há interface de rede, não que o servidor responde —, mas
  // como o reenvio já lida com falha de rede, tentar cedo demais não custa.
  useEffect(() => {
    const aoVoltar = () => void reenviar()
    window.addEventListener('online', aoVoltar)
    return () => window.removeEventListener('online', aoVoltar)
  }, [reenviar])

  return {
    pendentes,
    reconciliacao,
    reenviando,
    disponivel,
    enfileirar,
    reenviar,
    reconhecer: () => definirReconciliacao(null),
  }
}
