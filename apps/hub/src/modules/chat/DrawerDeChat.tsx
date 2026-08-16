import { Drawer, Icone } from '@matsuya/ui'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { Chat } from './Chat'
import { horario } from '../../app/formato'

/**
 * Conversa do pedido, em painel lateral.
 *
 * Abre por cima do drawer de detalhe e volta para ele ao fechar — nunca os
 * dois ao mesmo tempo. Dois painéis empilhados à direita deixariam o quadro
 * com uma faixa de 200 px, e aí nenhum dos três serve para nada.
 */
export function DrawerDeChat({
  pedido,
  nomeDaUnidade,
  token,
  podeEscrever,
  aoFechar,
}: {
  pedido: PedidoDoQuadro | null
  nomeDaUnidade: string
  token: string | null
  podeEscrever: boolean
  aoFechar: () => void
}) {
  if (!pedido) return null

  const itens = (pedido.items ?? []).reduce((soma, i) => soma + i.qty, 0)

  return (
    <Drawer
      aberto
      largura="medio"
      rotuloAcessivel={`Conversa do pedido ${pedido.code ?? pedido.id}`}
      aoFechar={aoFechar}
      titulo={
        <h2 className="drawer-chat__titulo">
          <span className="num">{pedido.code ?? `#${pedido.id}`}</span>
          {pedido.customerLabel && <span>{pedido.customerLabel}</span>}
        </h2>
      }
      subtitulo={
        <>
          <span>
            <Icone nome="relogio" tamanho={14} />
            Feito às {horario.format(new Date(pedido.createdAt))}
          </span>
          <span>
            <Icone nome="sacola" tamanho={14} />
            {itens} {itens === 1 ? 'item' : 'itens'}
          </span>
          <span>
            <Icone nome="loja" tamanho={14} />
            {nomeDaUnidade}
          </span>
        </>
      }
    >
      <Chat
        orderId={pedido.id}
        codigoDoPedido={pedido.code}
        token={token}
        podeEscrever={podeEscrever}
      />
    </Drawer>
  )
}
