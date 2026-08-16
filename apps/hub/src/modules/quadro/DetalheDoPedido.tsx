import { useMemo, useState } from 'react'
import { Botao, Modal, Selo } from '@matsuya/ui'
import {
  ORDER_ACTION_INFO,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  acoesDisponiveis,
  type OrderAction,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { moeda, decorrido } from '../../app/formato'
import { Chat } from '../chat/Chat'

/**
 * Detalhe do pedido.
 *
 * O que o operador vem buscar aqui, nesta ordem: o que preparar, para onde vai,
 * e o que ainda pode fazer. O resumo do cartão no quadro é feito para ser lido
 * de longe; este painel é para ser lido de perto, com o pedido na mão.
 *
 * Itens cancelados **continuam na lista**, riscados. Sumir com a linha
 * esconderia que aquele item foi pedido — e é justamente isso que o cliente vai
 * cobrar no telefone.
 */
export function DetalheDoPedido({
  pedido,
  permissoes,
  agora,
  ocupado,
  aoPedirAcao,
  aoFechar,
  token,
  aoReimprimir,
}: {
  pedido: PedidoDoQuadro | null
  permissoes: ReadonlySet<string>
  agora: number
  ocupado: boolean
  aoPedirAcao: (acao: OrderAction) => void
  aoFechar: () => void
  token: string | null
  aoReimprimir: () => void
}) {
  const [aba, definirAba] = useState<'pedido' | 'conversa'>('pedido')
  const acoes = useMemo(() => {
    if (!pedido) return []
    return acoesDisponiveis(
      { status: pedido.status, deliveryType: pedido.deliveryType },
      permissoes
    )
  }, [pedido, permissoes])

  if (!pedido) return null

  const endereco = pedido.addressSnapshot as
    | { street?: string; number?: string; complement?: string; district?: string }
    | null

  return (
    <Modal
      aberto
      largura="largo"
      titulo={pedido.code ?? `Pedido #${pedido.id}`}
      descricao={`${pedido.deliveryType === 'pickup' ? 'Retirada no balcão' : 'Entrega'} · há ${decorrido(pedido.createdAt, agora)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao enfase="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao enfase="secundaria" onClick={aoReimprimir}>
            Reimprimir
          </Botao>
          {acoes.map((acao) => {
            const info = ORDER_ACTION_INFO[acao]
            return (
              <Botao
                key={acao}
                enfase={info.enfase}
                carregando={ocupado}
                onClick={() => aoPedirAcao(acao)}
              >
                {info.rotulo}
              </Botao>
            )
          })}
        </>
      }
    >
      <div className="detalhe__abas" role="tablist" aria-label="Seções do pedido">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'pedido'}
          className="detalhe__aba"
          onClick={() => definirAba('pedido')}
        >
          Pedido
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'conversa'}
          className="detalhe__aba"
          onClick={() => definirAba('conversa')}
        >
          Conversa
        </button>
      </div>

      {aba === 'conversa' ? (
        <Chat
          orderId={pedido.id}
          codigoDoPedido={pedido.code}
          token={token}
          podeEscrever={permissoes.has('chat:write')}
        />
      ) : (
        <>
      <div className="detalhe__topo">
        <Selo tom={ORDER_STATUS_TONE[pedido.status]}>{ORDER_STATUS_LABEL[pedido.status]}</Selo>
        {pedido.hasPartialCancellation && <Selo tom="atencao" icone="alerta">Item cancelado</Selo>}
        {pedido.slaExpiredAt && <Selo tom="urgente" icone="relogio">SLA estourado</Selo>}
      </div>

      <section className="detalhe__secao">
        <h3>Itens</h3>
        <ul className="detalhe__itens">
          {(pedido.items ?? []).map((item) => {
            const cancelados = item.cancelledQty ?? 0
            const restantes = item.qty - cancelados
            return (
              <li key={item.id} data-cancelado={restantes <= 0 || undefined}>
                <span className="detalhe__qtd num">{restantes > 0 ? restantes : item.qty}×</span>
                <span className="detalhe__item-nome">
                  {item.productName}
                  {cancelados > 0 && (
                    <em className="detalhe__cancelado"> · {cancelados} cancelado(s)</em>
                  )}
                </span>
                <span className="detalhe__preco num">{moeda.format(item.unitPrice)}</span>
              </li>
            )
          })}
          {(pedido.items ?? []).length === 0 && (
            <li className="detalhe__sem-itens">Itens não carregados neste resumo.</li>
          )}
        </ul>
      </section>

      <section className="detalhe__secao">
        <h3>{pedido.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'}</h3>
        {pedido.deliveryType === 'pickup' ? (
          <p className="detalhe__texto">O cliente retira no balcão. Não há entregador.</p>
        ) : endereco ? (
          <p className="detalhe__texto">
            {[endereco.street, endereco.number].filter(Boolean).join(', ')}
            {endereco.complement && ` — ${endereco.complement}`}
            {endereco.district && <><br />{endereco.district}</>}
          </p>
        ) : (
          <p className="detalhe__texto detalhe__texto--fraco">Endereço não informado.</p>
        )}
        {pedido.notes && (
          <p className="detalhe__observacao">
            <strong>Observação do cliente:</strong> {pedido.notes}
          </p>
        )}
      </section>

      <section className="detalhe__secao">
        <h3>Valores</h3>
        <dl className="detalhe__valores">
          <div>
            <dt>Subtotal</dt>
            <dd className="num">{moeda.format(pedido.subtotal)}</dd>
          </div>
          {pedido.deliveryFee > 0 && (
            <div>
              <dt>Entrega</dt>
              <dd className="num">{moeda.format(pedido.deliveryFee)}</dd>
            </div>
          )}
          <div className="detalhe__total">
            <dt>Total</dt>
            <dd className="num">{moeda.format(pedido.total)}</dd>
          </div>
          <div>
            <dt>Pagamento</dt>
            <dd>
              {ROTULO_DO_PAGAMENTO[pedido.paymentMethod] ?? pedido.paymentMethod}
              {' · '}
              {pedido.paymentStatus === 'paid' ? 'pago' : 'a receber'}
            </dd>
          </div>
        </dl>
      </section>
        </>
      )}
    </Modal>
  )
}

const ROTULO_DO_PAGAMENTO: Record<string, string> = {
  pix: 'Pix',
  card: 'Cartão',
  on_delivery: 'Na entrega',
}
