import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Mudanca, OrderStatus } from '@matsuya/contracts'
import { createApiClient, criarApiDePedidos, type PedidoDoQuadro } from '@matsuya/api-client'
import type { EstadoDeSincronia } from '@matsuya/realtime'
import { Conexao, type EstadoDaConexao } from './conexao'
import { config } from '../app/config'

/**
 * O estado do quadro da loja.
 *
 * O ponto que importa: **evento de socket escreve direto no cache**, sem
 * invalidar nada. Invalidar traria a lista inteira de volta a cada mudança de
 * status — numa loja com movimento, isso é uma rajada de requisições no exato
 * momento em que ela menos pode esperar por uma. O `summary` que viaja no
 * evento existe justamente para tornar essa escrita possível.
 */

export interface EstadoDoQuadro {
  pedidos: PedidoDoQuadro[]
  carregando: boolean
  erro: string | null
  conexao: EstadoDaConexao
  sincronia: EstadoDeSincronia
  cursor: number
  /** Agora segundo o servidor, para os cronômetros de SLA. */
  agoraDoServidor: () => number
  recarregar: () => void
}

export function useQuadro(unityId: number, token: string | null): EstadoDoQuadro {
  const [pedidos, definirPedidos] = useState<PedidoDoQuadro[]>([])
  const [carregando, definirCarregando] = useState(true)
  const [erro, definirErro] = useState<string | null>(null)
  const [conexao, definirConexao] = useState<EstadoDaConexao>('conectando')
  const [sincronia, definirSincronia] = useState<EstadoDeSincronia>('inicial')
  const [cursor, definirCursor] = useState(0)

  const conexaoRef = useRef<Conexao | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const api = useMemo(() => {
    const cliente = createApiClient({
      baseUrl: config.apiBaseUrl,
      obterToken: () => tokenRef.current,
    })
    return criarApiDePedidos(cliente)
  }, [])

  /**
   * Aplica uma mudança do diário no cache local.
   *
   * `summary` traz o suficiente para redesenhar a linha. Pedido que ainda não
   * está na lista é inserido — é assim que um pedido novo aparece no quadro —,
   * e pedido que saiu dos estados ativos é removido, porque o quadro mostra
   * fila de trabalho, não histórico.
   */
  const aplicar = useCallback((mudanca: Mudanca) => {
    const resumo = mudanca.summary as Partial<PedidoDoQuadro> | undefined
    if (!resumo || typeof resumo.status !== 'string') return

    definirCursor(mudanca.seq)

    definirPedidos((atuais) => {
      const indice = atuais.findIndex((p) => p.id === mudanca.entityId)

      if (indice === -1) {
        // Pedido desconhecido. Sem os campos completos, entra com o que o
        // resumo traz; o próximo carregamento completa o resto.
        return [{ ...(resumo as PedidoDoQuadro), id: mudanca.entityId }, ...atuais]
      }

      const atualizado = { ...atuais[indice]!, ...resumo }

      // Versão mais velha chegando depois: o socket não garante ordem entre
      // reconexões, e sobrescrever com o passado faria a tela andar para trás.
      if (atualizado.version < atuais[indice]!.version) return atuais

      const proximos = [...atuais]
      proximos[indice] = atualizado
      return proximos
    })
  }, [])

  const carregarSnapshot = useCallback(async () => {
    definirCarregando(true)
    definirErro(null)
    try {
      const quadro = await api.quadroDaLoja({ unityId })
      definirPedidos(quadro.orders)
      definirCursor(quadro.cursor)
      conexaoRef.current?.iniciarEm(quadro.cursor)
    } catch (falha) {
      definirErro(falha instanceof Error ? falha.message : 'Falha ao carregar o quadro.')
    } finally {
      definirCarregando(false)
    }
  }, [api, unityId])

  useEffect(() => {
    if (!token) return

    const conexao = new Conexao({
      urlDoSocket: config.socketUrl,
      unityId,
      obterToken: () => tokenRef.current,
      buscarMudancas: (params) => api.mudancas(params),
      aplicar,
      aoExigirRecarga: () => void carregarSnapshot(),
      aoMudarEstado: definirConexao,
      aoMudarSincronia: definirSincronia,
    })

    conexaoRef.current = conexao
    void carregarSnapshot().then(() => conexao.conectar())

    return () => {
      conexao.desconectar()
      conexaoRef.current = null
    }
  }, [api, aplicar, carregarSnapshot, token, unityId])

  const agoraDoServidor = useCallback(
    () => conexaoRef.current?.agora() ?? Date.now(),
    []
  )

  return {
    pedidos,
    carregando,
    erro,
    conexao,
    sincronia,
    cursor,
    agoraDoServidor,
    recarregar: () => void carregarSnapshot(),
  }
}

/** Ordem das colunas do quadro. Segue o caminho físico do pedido na loja. */
export const COLUNAS: ReadonlyArray<{ status: OrderStatus; titulo: string }> = [
  { status: 'pending', titulo: 'Novos' },
  { status: 'confirmed', titulo: 'Aceitos' },
  { status: 'preparing', titulo: 'Em preparo' },
  { status: 'ready', titulo: 'Prontos' },
  { status: 'awaiting_courier', titulo: 'Aguardando entregador' },
  { status: 'out_for_delivery', titulo: 'Em rota' },
]
