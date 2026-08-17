import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Botao, EstadoVazio, Icone } from '@matsuya/ui'
import {
  criarApiDeChat,
  FalhaDaApi,
  type MensagemDoChat,
} from '@matsuya/api-client'
import { criarCliente } from '../../dados/cliente'
import { config } from '../../app/config'
import { horario } from '../../app/formato'

/**
 * Conversa com o cliente sobre um pedido.
 *
 * Decisões que a operação de balcão impõe:
 *
 * - **Enter envia, Shift+Enter quebra linha.** O oposto — botão obrigatório —
 *   custa um toque a cada resposta, e o operador está com a mão ocupada.
 * - **A rolagem só acompanha se já estava no fim.** Puxar a tela para baixo
 *   enquanto alguém lê uma mensagem antiga é a forma mais rápida de fazer a
 *   pessoa perder o que estava lendo.
 * - **Mensagem falha fica visível, com botão de reenviar.** Some da tela e o
 *   operador acha que respondeu — e o cliente continua esperando.
 */

interface MensagemLocal extends MensagemDoChat {
  /** Enviada localmente, ainda sem confirmação do servidor. */
  pendente?: boolean
  falhou?: boolean
}

export function Chat({
  orderId,
  codigoDoPedido,
  token,
  podeEscrever,
}: {
  orderId: number
  codigoDoPedido: string | null
  token: string | null
  podeEscrever: boolean
}) {
  const [mensagens, definirMensagens] = useState<MensagemLocal[]>([])
  const [texto, definirTexto] = useState('')
  const [carregando, definirCarregando] = useState(true)
  const [erro, definirErro] = useState<string | null>(null)
  const [enviando, definirEnviando] = useState(false)

  const lista = useRef<HTMLDivElement>(null)
  const noFim = useRef(true)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const api = useMemo(() => {
    return criarApiDeChat(criarCliente(() => tokenRef.current))
  }, [])

  useEffect(() => {
    const controle = new AbortController()
    definirCarregando(true)
    definirErro(null)

    api
      .listar(orderId, controle.signal)
      .then(({ messages }) => {
        definirMensagens(messages)
        // Marcar como lidas ao abrir: o operador está olhando a conversa.
        const ultimaDoCliente = [...messages]
          .reverse()
          .find((m) => m.authorType === 'customer')
        if (ultimaDoCliente) void api.marcarLidas(orderId, ultimaDoCliente.id)
      })
      .catch((falha) => {
        if (controle.signal.aborted) return
        definirErro(
          falha instanceof FalhaDaApi ? falha.message : 'Não foi possível carregar a conversa.'
        )
      })
      .finally(() => {
        if (!controle.signal.aborted) definirCarregando(false)
      })

    return () => controle.abort()
  }, [api, orderId])

  // Rola para o fim só se o operador já estava lá.
  useEffect(() => {
    if (noFim.current && lista.current) {
      lista.current.scrollTop = lista.current.scrollHeight
    }
  }, [mensagens])

  const aoRolar = useCallback(() => {
    const el = lista.current
    if (!el) return
    // 40 px de tolerância: rolagem com inércia raramente para no pixel exato.
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  const enviar = useCallback(
    async (corpo: string) => {
      const conteudo = corpo.trim()
      if (!conteudo || enviando) return

      // Mensagem otimista, marcada como pendente. O id negativo não colide com
      // nenhum id do servidor e some quando a resposta chega.
      const provisoria: MensagemLocal = {
        id: -Date.now(),
        orderId,
        authorType: 'staff',
        authorUserId: null,
        authorLabel: null,
        body: conteudo,
        hidden: false,
        readByStaff: true,
        createdAt: new Date().toISOString(),
        pendente: true,
      }

      definirMensagens((atuais) => [...atuais, provisoria])
      definirTexto('')
      definirEnviando(true)
      noFim.current = true

      try {
        const { message } = await api.enviar(orderId, conteudo)
        definirMensagens((atuais) =>
          atuais.map((m) => (m.id === provisoria.id ? message : m))
        )
      } catch {
        definirMensagens((atuais) =>
          atuais.map((m) =>
            m.id === provisoria.id ? { ...m, pendente: false, falhou: true } : m
          )
        )
      } finally {
        definirEnviando(false)
      }
    },
    [api, enviando, orderId]
  )

  const reenviar = useCallback(
    (mensagem: MensagemLocal) => {
      definirMensagens((atuais) => atuais.filter((m) => m.id !== mensagem.id))
      void enviar(mensagem.body)
    },
    [enviar]
  )

  return (
    <section className="chat" aria-label={`Conversa do pedido ${codigoDoPedido ?? orderId}`}>
      <div className="chat__lista" ref={lista} onScroll={aoRolar}>
        {carregando && <p className="chat__aviso">Carregando a conversa…</p>}

        {erro && (
          <p className="chat__aviso chat__aviso--erro" role="alert">
            {erro}
          </p>
        )}

        {!carregando && !erro && mensagens.length === 0 && (
          <EstadoVazio
            icone="pessoa"
            titulo="Nenhuma mensagem"
            descricao="O cliente ainda não escreveu, e nada foi enviado daqui."
          />
        )}

        {mensagens.map((mensagem) => (
          <article
            key={mensagem.id}
            className="chat__mensagem"
            data-autor={mensagem.authorType}
            data-falhou={mensagem.falhou || undefined}
          >
            <p className="chat__corpo">{mensagem.body}</p>
            <footer className="chat__meta">
              {mensagem.authorType === 'customer' && <span>Cliente</span>}
              {mensagem.authorType === 'system' && <span>Sistema</span>}
              <span className="num">{horario.format(new Date(mensagem.createdAt))}</span>
              {mensagem.pendente && <span>enviando…</span>}
              {mensagem.falhou && (
                <button
                  type="button"
                  className="chat__reenviar"
                  onClick={() => reenviar(mensagem)}
                >
                  <Icone nome="atualizar" tamanho={12} /> não enviou — tentar de novo
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>

      {podeEscrever ? (
        <form
          className="chat__envio"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar(texto)
          }}
        >
          <label className="ui-visualmente-oculto" htmlFor="chat-texto">
            Mensagem para o cliente
          </label>
          <textarea
            id="chat-texto"
            value={texto}
            onChange={(e) => definirTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void enviar(texto)
              }
            }}
            placeholder="Escreva para o cliente…"
            rows={2}
            maxLength={1000}
          />
          <Botao
            type="submit"
            enfase="primaria"
            carregando={enviando}
            disabled={!texto.trim()}
          >
            Enviar
          </Botao>
        </form>
      ) : (
        <p className="chat__aviso">Seu acesso permite ler, mas não responder.</p>
      )}
    </section>
  )
}
