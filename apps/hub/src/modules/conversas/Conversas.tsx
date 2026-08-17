import { useEffect, useMemo, useState } from 'react'
import { EstadoVazio, Faixa, PainelDeSecao, Selo } from '@matsuya/ui'
import { criarApiDeChat } from '@matsuya/api-client'
import { criarCliente } from '../../dados/cliente'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { config } from '../../app/config'
import { decorrido } from '../../app/formato'

/**
 * Conversas com clientes.
 *
 * **Esta tela nasce vazia, e isso não é defeito.** O contador de não lidas
 * funciona, mas nada no sistema cria mensagem com autor `customer`: o
 * aplicativo do cliente ainda não tem por onde enviar. Enquanto isso não
 * existir, a loja escreve e ninguém responde.
 *
 * O estado vazio diz isso com todas as letras. A alternativa — um "nenhuma
 * mensagem" genérico — faria o responsável concluir que os clientes não
 * escrevem, quando na verdade eles não podem.
 */
export function Conversas({
  unityId,
  pedidos,
  token,
  agora,
  aoAbrirConversa,
}: {
  unityId: number
  pedidos: PedidoDoQuadro[]
  token: string | null
  agora: number
  aoAbrirConversa: (pedido: PedidoDoQuadro) => void
}) {
  const [naoLidas, definirNaoLidas] = useState<Record<string, number>>({})
  const [erro, definirErro] = useState<string | null>(null)

  const api = useMemo(() => {
    return criarApiDeChat(criarCliente(() => token))
  }, [token])

  useEffect(() => {
    const controle = new AbortController()
    api
      .naoLidas(unityId, controle.signal)
      .then((r) => definirNaoLidas(r.byOrder))
      .catch(() => {
        if (!controle.signal.aborted) definirErro('Não foi possível ler as conversas.')
      })
    return () => controle.abort()
  }, [api, unityId])

  // Pedido com mensagem não lida primeiro; depois os demais em aberto, para
  // que o operador consiga puxar conversa sobre um pedido específico mesmo sem
  // o cliente ter escrito.
  const comMensagem = useMemo(
    () => pedidos.filter((p) => (naoLidas[String(p.id)] ?? 0) > 0),
    [pedidos, naoLidas]
  )

  return (
    <main className="conversas">
      {erro && (
        <Faixa tom="perigo" icone="alerta">
          {erro}
        </Faixa>
      )}

      <PainelDeSecao titulo="Aguardando resposta" contagem={comMensagem.length}>
        {comMensagem.length === 0 ? (
          <EstadoVazio
            icone="balao"
            titulo="Nenhuma mensagem de cliente"
            descricao="O aplicativo do cliente ainda não envia mensagens. Você pode escrever a partir de qualquer pedido, na aba Conversa do detalhe."
          />
        ) : (
          <ul className="conversas__lista">
            {comMensagem.map((pedido) => (
              <li key={pedido.id}>
                <button
                  type="button"
                  className="conversas__item"
                  onClick={() => aoAbrirConversa(pedido)}
                >
                  <span className="conversas__linha">
                    <strong className="num">{pedido.code ?? `#${pedido.id}`}</strong>
                    <Selo tom="urgente">{naoLidas[String(pedido.id)]} nova(s)</Selo>
                  </span>
                  <span className="conversas__linha conversas__linha--fraca">
                    <span>{pedido.customerLabel ?? 'Cliente'}</span>
                    <span className="num">há {decorrido(pedido.createdAt, agora)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PainelDeSecao>

      <PainelDeSecao titulo="Pedidos em aberto" contagem={pedidos.length}>
        {pedidos.length === 0 ? (
          <EstadoVazio titulo="Nenhum pedido em aberto" />
        ) : (
          <ul className="conversas__lista">
            {pedidos.map((pedido) => (
              <li key={pedido.id}>
                <button
                  type="button"
                  className="conversas__item"
                  onClick={() => aoAbrirConversa(pedido)}
                >
                  <span className="conversas__linha">
                    <strong className="num">{pedido.code ?? `#${pedido.id}`}</strong>
                    <span className="conversas__abrir">Abrir conversa</span>
                  </span>
                  <span className="conversas__linha conversas__linha--fraca">
                    <span>{pedido.customerLabel ?? 'Cliente'}</span>
                    <span className="num">há {decorrido(pedido.createdAt, agora)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PainelDeSecao>
    </main>
  )
}
