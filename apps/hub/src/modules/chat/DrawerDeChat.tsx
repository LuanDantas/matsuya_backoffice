import { Drawer, Icone } from '@matsuya/ui'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { Chat } from './Chat'
import type { MensagemLocal } from '../../dados/mensagens'
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
  mensagens,
  carregando,
  erro,
  podeEscrever,
  agora,
  aoEnviar,
  aoReenviar,
  aoMarcarLida,
  aoFechar,
}: {
  pedido: PedidoDoQuadro | null
  /**
   * O nome da loja **do pedido**.
   *
   * Vinha da unidade em foco enquanto os pedidos vêm de todas as lojas
   * selecionadas — então abrir a conversa de um pedido da Mooca com o foco na
   * Santana imprimia "Santana" aqui embaixo. Uma mentira pequena e visível.
   */
  nomeDaUnidade: string
  mensagens: MensagemLocal[]
  carregando: boolean
  erro: string | null
  podeEscrever: boolean
  agora: number
  aoEnviar: (corpo: string) => Promise<void>
  aoReenviar: (idLocal: number) => Promise<void>
  aoMarcarLida: (upToId: number) => void
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
        mensagens={mensagens}
        carregando={carregando}
        erro={erro}
        podeEscrever={podeEscrever}
        agora={agora}
        aoEnviar={aoEnviar}
        aoReenviar={aoReenviar}
        aoMarcarLida={aoMarcarLida}
      />
    </Drawer>
  )
}
