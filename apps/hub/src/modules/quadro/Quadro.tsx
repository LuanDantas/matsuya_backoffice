import { useEffect, useMemo, useState } from 'react'
import {
  ORDER_STATUS_LABEL,
  ORDER_ACTION_INFO,
  acoesDisponiveis,
  opcoesDeMotivo,
  validarMotivo,
  MENSAGEM_DO_PROBLEMA,
  type OrderAction,
  type OrderStatus,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { COLUNAS } from '../../dados/useQuadro'

/**
 * O quadro de pedidos.
 *
 * Uma coluna por lugar físico onde o pedido pode estar. A regra que governa o
 * layout inteiro: **a coluna diz onde o pedido está, não o que aconteceu com
 * ele.** É por isso que cancelamento parcial e reembolso não são coluna — o
 * pedido continua fisicamente onde estava.
 */

interface Props {
  pedidos: PedidoDoQuadro[]
  permissoes: ReadonlySet<string>
  agoraDoServidor: () => number
  aoAgir: (params: {
    pedido: PedidoDoQuadro
    acao: OrderAction
    reasonCode?: string
    reasonNote?: string
  }) => void
  emCurso: ReadonlySet<number>
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Cronômetro desde a chegada do pedido.
 *
 * Calculado contra o relógio do **servidor**. O do tablet erra por minutos, e
 * um cronômetro de SLA errado é pior do que nenhum: ele faz o operador confiar
 * num número falso.
 */
function useCronometro(agoraDoServidor: () => number) {
  const [, redesenhar] = useState(0)
  useEffect(() => {
    const t = setInterval(() => redesenhar((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return agoraDoServidor
}

function decorrido(desde: string, agora: number): string {
  const segundos = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000))
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return `${min}:${String(seg).padStart(2, '0')}`
}

function Cartao({
  pedido,
  permissoes,
  agora,
  aoAgir,
  ocupado,
}: {
  pedido: PedidoDoQuadro
  permissoes: ReadonlySet<string>
  agora: number
  aoAgir: Props['aoAgir']
  ocupado: boolean
}) {
  const [acaoComMotivo, definirAcaoComMotivo] = useState<OrderAction | null>(null)
  const [codigo, definirCodigo] = useState('')
  const [texto, definirTexto] = useState('')

  const acoes = useMemo(
    () => acoesDisponiveis({ status: pedido.status, deliveryType: pedido.deliveryType }, permissoes),
    [pedido.status, pedido.deliveryType, permissoes]
  )

  const estourouSla =
    pedido.slaExpiredAt !== null ||
    (pedido.slaExpiresAt !== null && new Date(pedido.slaExpiresAt).getTime() < agora)

  function acionar(acao: OrderAction) {
    const info = ORDER_ACTION_INFO[acao]
    if (info.motivo) {
      definirAcaoComMotivo(acao)
      definirCodigo('')
      definirTexto('')
      return
    }
    aoAgir({ pedido, acao })
  }

  function confirmarComMotivo() {
    if (!acaoComMotivo) return
    const familia = ORDER_ACTION_INFO[acaoComMotivo].motivo
    const problema = validarMotivo(familia, codigo || undefined, texto || undefined)
    if (problema) return

    aoAgir({ pedido, acao: acaoComMotivo, reasonCode: codigo, reasonNote: texto || undefined })
    definirAcaoComMotivo(null)
  }

  const familia = acaoComMotivo ? ORDER_ACTION_INFO[acaoComMotivo].motivo : null
  const problema = familia ? validarMotivo(familia, codigo || undefined, texto || undefined) : null

  return (
    <article className={`cartao${estourouSla ? ' cartao--atrasado' : ''}`}>
      <header className="cartao__cabecalho">
        <strong>{pedido.code ?? `#${pedido.id}`}</strong>
        <span className="cartao__relogio">{decorrido(pedido.createdAt, agora)}</span>
      </header>

      <div className="cartao__linha">
        <span>{pedido.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'}</span>
        <span>{moeda.format(pedido.total)}</span>
      </div>

      {pedido.hasPartialCancellation && (
        <p className="cartao__aviso">Contém item cancelado</p>
      )}

      {acaoComMotivo === null ? (
        <div className="cartao__acoes">
          {acoes.map((acao) => {
            const info = ORDER_ACTION_INFO[acao]
            return (
              <button
                key={acao}
                type="button"
                disabled={ocupado}
                className={`botao botao--${info.enfase}`}
                onClick={() => acionar(acao)}
              >
                {info.rotulo}
              </button>
            )
          })}
          {acoes.length === 0 && <span className="cartao__vazio">Sem ações disponíveis</span>}
        </div>
      ) : (
        <div className="cartao__motivo">
          <select value={codigo} onChange={(e) => definirCodigo(e.target.value)}>
            <option value="">Selecione o motivo…</option>
            {familia &&
              opcoesDeMotivo(familia).map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.rotulo}
                </option>
              ))}
          </select>

          {codigo.endsWith('_OUTRO') && (
            <textarea
              value={texto}
              onChange={(e) => definirTexto(e.target.value)}
              placeholder="Descreva o que aconteceu"
              rows={2}
            />
          )}

          {problema && codigo !== '' && (
            <p className="cartao__erro">{MENSAGEM_DO_PROBLEMA[problema]}</p>
          )}

          <div className="cartao__acoes">
            <button
              type="button"
              className="botao botao--destrutiva"
              disabled={problema !== null || ocupado}
              onClick={confirmarComMotivo}
            >
              Confirmar {ORDER_ACTION_INFO[acaoComMotivo].rotulo.toLowerCase()}
            </button>
            <button
              type="button"
              className="botao botao--secundaria"
              onClick={() => definirAcaoComMotivo(null)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

export function Quadro({ pedidos, permissoes, agoraDoServidor, aoAgir, emCurso }: Props) {
  const relogio = useCronometro(agoraDoServidor)
  const agora = relogio()

  const porColuna = useMemo(() => {
    const mapa = new Map<OrderStatus, PedidoDoQuadro[]>()
    for (const coluna of COLUNAS) mapa.set(coluna.status, [])
    for (const pedido of pedidos) {
      mapa.get(pedido.status)?.push(pedido)
    }
    // Mais antigo primeiro: quem está esperando há mais tempo aparece no topo.
    for (const lista of mapa.values()) {
      lista.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    }
    return mapa
  }, [pedidos])

  return (
    <div className="quadro">
      {COLUNAS.map((coluna) => {
        const lista = porColuna.get(coluna.status) ?? []
        return (
          <section key={coluna.status} className="coluna">
            <header className="coluna__cabecalho">
              <h2>{coluna.titulo}</h2>
              <span className="coluna__contador">{lista.length}</span>
            </header>

            <div className="coluna__corpo">
              {lista.map((pedido) => (
                <Cartao
                  key={pedido.id}
                  pedido={pedido}
                  permissoes={permissoes}
                  agora={agora}
                  aoAgir={aoAgir}
                  ocupado={emCurso.has(pedido.id)}
                />
              ))}
              {lista.length === 0 && (
                <p className="coluna__vazia">{ORDER_STATUS_LABEL[coluna.status]}: nenhum</p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
