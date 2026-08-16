import { useMemo } from 'react'
import { Botao, EstadoVazio, Icone, Selo } from '@matsuya/ui'
import {
  ORDER_ACTION_INFO,
  ORDER_STATUS_TONE,
  acoesDisponiveis,
  type OrderAction,
  type OrderStatus,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, minutosAteSla, moeda } from '../../app/formato'
import { COLUNAS } from '../../dados/useQuadro'

/**
 * O quadro de pedidos.
 *
 * Uma coluna por lugar físico onde o pedido pode estar. A regra que governa o
 * layout: **a coluna diz onde o pedido está, não o que aconteceu com ele.** É
 * por isso que cancelamento parcial e reembolso não são coluna — o pedido
 * continua fisicamente onde estava.
 *
 * O cartão mostra só o que se lê de longe: número, relógio, tipo, valor. O
 * resto fica no detalhe. Um cartão que tenta contar a história inteira vira uma
 * parede de texto que ninguém lê no meio do almoço.
 */

interface Props {
  pedidos: PedidoDoQuadro[]
  permissoes: ReadonlySet<string>
  agora: number
  emCurso: ReadonlySet<number>
  /** O App decide se a ação vai direto ou passa por confirmação. */
  aoPedirAcao: (pedido: PedidoDoQuadro, acao: OrderAction) => void
  aoAbrirDetalhe: (pedido: PedidoDoQuadro) => void
}

/**
 * Urgência do cartão, para o quadro ser legível a dois metros.
 *
 * Não é só cor: o cartão urgente ganha borda espessa e um ícone de relógio.
 * Cor sozinha exclui quem não distingue vermelho de cinza — e, num balcão com
 * contraluz de janela, exclui todo mundo.
 */
function urgencia(pedido: PedidoDoQuadro, agora: number): 'normal' | 'perto' | 'estourado' {
  if (pedido.slaExpiredAt) return 'estourado'
  const faltam = minutosAteSla(pedido.slaExpiresAt, agora)
  if (faltam === null) return 'normal'
  if (faltam < 0) return 'estourado'
  if (faltam <= 3) return 'perto'
  return 'normal'
}

function Cartao({
  pedido,
  permissoes,
  agora,
  ocupado,
  aoPedirAcao,
  aoAbrirDetalhe,
}: {
  pedido: PedidoDoQuadro
  permissoes: ReadonlySet<string>
  agora: number
  ocupado: boolean
  aoPedirAcao: Props['aoPedirAcao']
  aoAbrirDetalhe: Props['aoAbrirDetalhe']
}) {
  const acoes = useMemo(
    () =>
      acoesDisponiveis(
        { status: pedido.status, deliveryType: pedido.deliveryType },
        permissoes
      ),
    [pedido.status, pedido.deliveryType, permissoes]
  )

  const nivel = urgencia(pedido, agora)

  // As duas primeiras ações ficam no cartão; o resto vive no detalhe. Seis
  // botões num cartão de 240 px é uma fileira de alvos que ninguém acerta.
  const noCartao = acoes.slice(0, 2)
  const sobraram = acoes.length - noCartao.length

  return (
    <article className="cartao" data-urgencia={nivel}>
      <button
        type="button"
        className="cartao__abrir"
        onClick={() => aoAbrirDetalhe(pedido)}
        aria-label={`Abrir o pedido ${pedido.code ?? pedido.id}`}
      >
        <header className="cartao__cabecalho">
          <strong>{pedido.code ?? `#${pedido.id}`}</strong>
          <span className="cartao__relogio num">
            {nivel !== 'normal' && <Icone nome="relogio" tamanho={14} />}
            {decorrido(pedido.createdAt, agora)}
          </span>
        </header>

        <div className="cartao__linha">
          <span className="cartao__tipo">
            <Icone nome={pedido.deliveryType === 'pickup' ? 'sacola' : 'moto'} tamanho={14} />
            {pedido.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'}
          </span>
          <span className="num">{moeda.format(pedido.total)}</span>
        </div>

        {(pedido.hasPartialCancellation || nivel === 'estourado') && (
          <div className="cartao__selos">
            {nivel === 'estourado' && <Selo tom="urgente">SLA estourado</Selo>}
            {pedido.hasPartialCancellation && <Selo tom="atencao">Item cancelado</Selo>}
          </div>
        )}
      </button>

      <div className="cartao__acoes">
        {noCartao.map((acao) => {
          const info = ORDER_ACTION_INFO[acao]
          return (
            <Botao
              key={acao}
              enfase={info.enfase}
              carregando={ocupado}
              onClick={() => aoPedirAcao(pedido, acao)}
            >
              {info.rotulo}
            </Botao>
          )
        })}

        {sobraram > 0 && (
          <Botao enfase="fantasma" onClick={() => aoAbrirDetalhe(pedido)}>
            +{sobraram}
          </Botao>
        )}

        {acoes.length === 0 && (
          <span className="cartao__sem-acao">Sem ações no seu acesso</span>
        )}
      </div>
    </article>
  )
}

export function Quadro({
  pedidos,
  permissoes,
  agora,
  emCurso,
  aoPedirAcao,
  aoAbrirDetalhe,
}: Props) {
  const porColuna = useMemo(() => {
    const mapa = new Map<OrderStatus, PedidoDoQuadro[]>()
    for (const coluna of COLUNAS) mapa.set(coluna.status, [])
    for (const pedido of pedidos) mapa.get(pedido.status)?.push(pedido)

    // Mais antigo no topo: quem espera há mais tempo é atendido primeiro.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    }
    return mapa
  }, [pedidos])

  return (
    <div className="quadro">
      {COLUNAS.map((coluna) => {
        const lista = porColuna.get(coluna.status) ?? []
        return (
          <section key={coluna.status} className="coluna" aria-labelledby={`col-${coluna.status}`}>
            <header className="coluna__cabecalho">
              <h2 id={`col-${coluna.status}`}>{coluna.titulo}</h2>
              <Selo tom={lista.length > 0 ? ORDER_STATUS_TONE[coluna.status] : 'neutro'}>
                {lista.length}
              </Selo>
            </header>

            <div className="coluna__corpo">
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
                <EstadoVazio titulo="Nenhum pedido" descricao={coluna.vazio} />
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
