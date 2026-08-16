import { useCallback, useState } from 'react'
import {
  FalhaDaApi,
  FalhaDeRede,
  type ApiDePedidos,
  type PedidoDoQuadro,
} from '@matsuya/api-client'
import { ORDER_ACTION_INFO, type OrderAction } from '@matsuya/contracts'
import type { EstadoDaFila } from '../offline/useFilaOffline'

/**
 * Executa transições de pedido, com todos os desfechos tratados.
 *
 * Extraído da casca porque a lista de desfechos é longa e cada um tem uma
 * reação diferente — e enterrar isso no meio de um componente de tela fez o
 * arquivo passar de quinhentas linhas.
 *
 * Os quatro que importam:
 *
 * - **409 de conflito**: outra tablete mexeu. Recarrega em vez de insistir.
 * - **403 de permissão**: o acesso não permite. Diz o que fazer, não só que
 *   falhou.
 * - **Falha de rede**: vai para a fila offline. Perder o aceite porque o Wi-Fi
 *   caiu seria o pior desfecho — o operador fez o trabalho e o cliente
 *   continua esperando.
 * - **Qualquer outra**: toca o som de erro, porque quem está de costas para o
 *   tablet precisa saber que a ação não passou.
 */

export interface Aviso {
  texto: string
  tom: 'atencao' | 'perigo'
}

export interface EntradaDaAcao {
  pedido: PedidoDoQuadro
  acao: OrderAction
  reasonCode?: string
  reasonNote?: string
}

export function useAcoesDoPedido({
  api,
  unidadeId,
  fila,
  aoConflitar,
  aoErrar,
}: {
  api: ApiDePedidos
  unidadeId: number
  fila: EstadoDaFila
  /** Recarregar o quadro quando o estado do servidor divergiu do da tela. */
  aoConflitar: () => void
  /** Alerta sonoro de falha. */
  aoErrar: () => void
}) {
  const [emCurso, definirEmCurso] = useState<ReadonlySet<number>>(new Set())
  const [aviso, definirAviso] = useState<Aviso | null>(null)

  const agir = useCallback(
    async ({ pedido, acao, reasonCode, reasonNote }: EntradaDaAcao) => {
      definirEmCurso((atual) => new Set(atual).add(pedido.id))
      definirAviso(null)

      try {
        await api.transicionar({
          orderId: pedido.id,
          acao,
          reasonCode,
          reasonNote,
          // A versão que estava na tela quando o operador clicou. Se outra
          // tablete mexeu no meio, a API devolve 409 em vez de sobrescrever.
          versaoEsperada: pedido.version,
        })
        // O quadro não é atualizado aqui: a mudança volta pelo socket com o
        // `seq` que mantém o cursor coerente. Escrever pelos dois caminhos
        // faria o mesmo evento ser aplicado duas vezes.
      } catch (falha) {
        if (falha instanceof FalhaDaApi && falha.code === 'ORDER_STATUS_CONFLICT') {
          definirAviso({
            texto: 'Este pedido mudou em outro dispositivo. Atualizando o quadro.',
            tom: 'atencao',
          })
          aoConflitar()
        } else if (falha instanceof FalhaDaApi && falha.code === 'FORBIDDEN_PERMISSION') {
          definirAviso({
            texto: 'Seu acesso não permite esta ação. Chame o responsável da loja.',
            tom: 'perigo',
          })
        } else if (falha instanceof FalhaDeRede && fila.disponivel) {
          await fila.enfileirar({
            unityId: unidadeId,
            orderId: pedido.id,
            codigoDoPedido: pedido.code,
            acao,
            statusAlvo: ORDER_ACTION_INFO[acao].para,
            reasonCode,
            reasonNote,
            versaoEsperada: pedido.version,
          })
          definirAviso({
            texto: 'Sem conexão. A ação foi guardada e será enviada quando a rede voltar.',
            tom: 'atencao',
          })
        } else if (falha instanceof FalhaDaApi) {
          aoErrar()
          definirAviso({ texto: falha.message, tom: 'perigo' })
        } else {
          aoErrar()
          definirAviso({
            texto: 'Não foi possível concluir. Verifique a conexão e tente de novo.',
            tom: 'perigo',
          })
        }
      } finally {
        definirEmCurso((atual) => {
          const proximo = new Set(atual)
          proximo.delete(pedido.id)
          return proximo
        })
      }
    },
    [api, aoConflitar, aoErrar, fila, unidadeId]
  )

  return {
    emCurso,
    aviso,
    limparAviso: () => definirAviso(null),
    agir,
  }
}
