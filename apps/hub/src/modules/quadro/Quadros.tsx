import { useMemo } from 'react'
import { EstadoVazio, PainelDeSecao } from '@matsuya/ui'
import type { OrderAction, OrderStatus } from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { Cartao } from './Cartao'
import { SECOES } from '../../dados/useQuadro'

/**
 * Modo Quadros — uma coluna por lugar onde o pedido pode estar.
 *
 * A metáfora é de fluxo: o pedido anda da esquerda para a direita, e a coluna
 * responde "onde ele está fisicamente". É por isso que cancelamento parcial e
 * reembolso não são coluna — o pedido continua onde estava.
 *
 * Cabe menos pedido na tela do que no modo Expedição, e em troca cada cartão
 * mostra o contexto por extenso. É o modo de operação normal.
 */
export interface PropsDoQuadro {
  pedidos: PedidoDoQuadro[]
  permissoes: ReadonlySet<string>
  agora: number
  emCurso: ReadonlySet<number>
  aoPedirAcao: (pedido: PedidoDoQuadro, acao: OrderAction) => void
  aoAbrirDetalhe: (pedido: PedidoDoQuadro) => void
}

export function agruparPorStatus(pedidos: PedidoDoQuadro[]) {
  const mapa = new Map<OrderStatus, PedidoDoQuadro[]>()
  for (const secao of SECOES) mapa.set(secao.status, [])
  for (const pedido of pedidos) mapa.get(pedido.status)?.push(pedido)

  // Mais antigo no topo: quem espera há mais tempo é atendido primeiro.
  for (const lista of mapa.values()) {
    lista.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }
  return mapa
}

export function Quadros({
  pedidos,
  permissoes,
  agora,
  emCurso,
  aoPedirAcao,
  aoAbrirDetalhe,
}: PropsDoQuadro) {
  const porStatus = useMemo(() => agruparPorStatus(pedidos), [pedidos])

  return (
    <div className="quadros">
      {SECOES.map((secao) => {
        const lista = porStatus.get(secao.status) ?? []
        return (
          <div key={secao.status} className="quadros__coluna">
            <PainelDeSecao titulo={secao.titulo} contagem={lista.length}>
              <div className="quadros__pilha">
                {lista.map((pedido) => (
                  <Cartao
                    key={pedido.id}
                    pedido={pedido}
                    permissoes={permissoes}
                    agora={agora}
                    ocupado={emCurso.has(pedido.id)}
                    aoPedirAcao={aoPedirAcao}
                    aoAbrirDetalhe={aoAbrirDetalhe}
                  />
                ))}

                {lista.length === 0 && (
                  <EstadoVazio titulo="Nenhum pedido" descricao={secao.vazio} />
                )}
              </div>
            </PainelDeSecao>
          </div>
        )
      })}
    </div>
  )
}
