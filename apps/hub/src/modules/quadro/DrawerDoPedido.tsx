import { useMemo } from 'react'
import { Botao, Drawer, Icone, PilulaDeEstado, Selo } from '@matsuya/ui'
import {
  ORDER_ACTION_INFO,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  acoesDisponiveis,
  type OrderAction,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, horario, moeda } from '../../app/formato'

/**
 * Detalhe do pedido, em painel lateral.
 *
 * Painel e não modal centrado por razão operacional: o quadro fica visível ao
 * lado. O operador lê o pedido sem perder a fila de vista, e vê um pedido novo
 * chegar enquanto confere outro.
 *
 * Os dados vêm do pedido que já está na lista do quadro — não existe
 * `GET /orders/:id` na v1, e não faz falta: a lista já traz itens com opções.
 * Uma requisição a menos e nenhuma janela em que o painel mostra um estado
 * diferente do cartão que o abriu.
 *
 * Itens cancelados continuariam na lista, riscados, se `cancelledQty`
 * existisse — a coluna está no banco mas não no model da API, então hoje não há
 * o que renderizar.
 */

interface Props {
  pedido: PedidoDoQuadro | null
  permissoes: ReadonlySet<string>
  nomeDaUnidade: string
  agora: number
  ocupado: boolean
  naoLidas: number
  aoPedirAcao: (acao: OrderAction) => void
  aoAbrirConversa: () => void
  aoImprimir: () => void
  aoFechar: () => void
}

const ROTULO_DO_PAGAMENTO: Record<string, string> = {
  pix: 'Pix',
  card: 'Cartão',
  on_delivery: 'Na entrega',
}

export function DrawerDoPedido({
  pedido,
  permissoes,
  nomeDaUnidade,
  agora,
  ocupado,
  naoLidas,
  aoPedirAcao,
  aoAbrirConversa,
  aoImprimir,
  aoFechar,
}: Props) {
  const acoes = useMemo(() => {
    if (!pedido) return []
    return acoesDisponiveis(
      { status: pedido.status, deliveryType: pedido.deliveryType },
      permissoes
    )
  }, [pedido, permissoes])

  if (!pedido) return null

  const endereco = pedido.addressSnapshot as
    | {
        street?: string
        number?: string
        complement?: string
        district?: string
        city?: string
      }
    | null

  const itens = pedido.items ?? []
  const quantidade = itens.reduce((soma, i) => soma + i.qty, 0)

  return (
    <Drawer
      aberto
      largura="medio"
      rotuloAcessivel={`Pedido ${pedido.code ?? pedido.id}`}
      aoFechar={aoFechar}
      titulo={
        <div className="drawer-pedido__titulo">
          <span className="drawer-pedido__codigo num">{pedido.code ?? `#${pedido.id}`}</span>
          {pedido.customerLabel && <h2>{pedido.customerLabel}</h2>}
        </div>
      }
      subtitulo={
        <>
          <Icone nome="loja" tamanho={14} />
          {nomeDaUnidade}
          <span aria-hidden="true">·</span>
          Feito às {horario.format(new Date(pedido.createdAt))}
          <span aria-hidden="true">·</span>
          há {decorrido(pedido.createdAt, agora)}
        </>
      }
      rodape={
        <>
          <Botao enfase="fantasma" onClick={aoImprimir}>
            Imprimir
          </Botao>
          <Botao enfase="secundaria" onClick={aoAbrirConversa}>
            Conversa{naoLidas > 0 ? ` (${naoLidas})` : ''}
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
      <div className="drawer-pedido__selos">
        <Selo tom={ORDER_STATUS_TONE[pedido.status]}>{ORDER_STATUS_LABEL[pedido.status]}</Selo>
        <Selo icone={pedido.deliveryType === 'pickup' ? 'sacola' : 'capacete'}>
          {pedido.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'}
        </Selo>
        {pedido.hasPartialCancellation && (
          <Selo tom="atencao" icone="alerta">
            Item cancelado
          </Selo>
        )}
      </div>

      {/* Observação do cliente em destaque, e antes dos itens: é o que a
          cozinha erra quando está no rodapé. */}
      {pedido.notes && (
        <PilulaDeEstado tom="aviso" icone="alerta">
          {pedido.notes}
        </PilulaDeEstado>
      )}

      <section className="drawer-pedido__secao">
        <h3>
          Itens
          <span className="drawer-pedido__contagem num">{quantidade}</span>
        </h3>

        <ul className="drawer-pedido__itens">
          {itens.map((item) => (
            <li key={item.id}>
              <span className="drawer-pedido__qtd num">{item.qty}×</span>
              <span className="drawer-pedido__item">
                {item.productName}
                {(item.optionsSnapshot ?? []).length > 0 && (
                  <ul className="drawer-pedido__opcoes">
                    {item.optionsSnapshot!.map((opcao, i) => (
                      <li key={`${opcao.optionId}-${i}`}>
                        {opcao.optionName}
                        {opcao.priceDelta > 0 && (
                          <span className="num"> +{moeda.format(opcao.priceDelta)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </span>
              <span className="drawer-pedido__preco num">
                {moeda.format(item.lineTotal ?? item.unitPrice * item.qty)}
              </span>
            </li>
          ))}

          {itens.length === 0 && (
            <li className="drawer-pedido__sem-itens">
              Itens não vieram neste carregamento. Atualize o quadro.
            </li>
          )}
        </ul>
      </section>

      <section className="drawer-pedido__secao">
        <h3>{pedido.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'}</h3>

        {pedido.deliveryType === 'pickup' ? (
          <p className="drawer-pedido__texto">O cliente retira no balcão.</p>
        ) : endereco ? (
          <p className="drawer-pedido__texto">
            {[endereco.street, endereco.number].filter(Boolean).join(', ')}
            {endereco.complement && ` — ${endereco.complement}`}
            {(endereco.district || endereco.city) && (
              <>
                <br />
                {[endereco.district, endereco.city].filter(Boolean).join(' · ')}
              </>
            )}
          </p>
        ) : (
          <p className="drawer-pedido__texto drawer-pedido__texto--fraco">
            Endereço não informado neste pedido.
          </p>
        )}
      </section>

      <section className="drawer-pedido__secao">
        <h3>Valores</h3>

        <dl className="drawer-pedido__valores">
          <Linha icone="sacola" rotulo="Subtotal" valor={moeda.format(pedido.subtotal)} />
          {pedido.deliveryFee > 0 && (
            <Linha
              icone="capacete"
              rotulo="Taxa de entrega"
              valor={moeda.format(pedido.deliveryFee)}
            />
          )}
          <Linha
            icone="check"
            rotulo="Total"
            valor={moeda.format(pedido.total)}
            destaque
          />
          <Linha
            icone="pessoa"
            rotulo={ROTULO_DO_PAGAMENTO[pedido.paymentMethod] ?? pedido.paymentMethod}
            descricao={
              pedido.paymentStatus === 'paid'
                ? 'Já pago — não cobrar na entrega'
                : 'A receber na entrega'
            }
            valor={pedido.paymentStatus === 'paid' ? 'Pago' : 'A receber'}
          />
        </dl>
      </section>
    </Drawer>
  )
}

/**
 * Linha de valor: ícone, rótulo (com apoio opcional), valor à direita.
 *
 * É o mesmo padrão que a referência usa nas telas de configuração, e serve
 * porque o olho desce pela coluna da esquerda procurando o rótulo e cruza para
 * a direita só quando achou.
 */
function Linha({
  icone,
  rotulo,
  descricao,
  valor,
  destaque = false,
}: {
  icone: 'sacola' | 'capacete' | 'check' | 'pessoa'
  rotulo: string
  descricao?: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="drawer-pedido__linha" data-destaque={destaque || undefined}>
      <dt>
        <Icone nome={icone} tamanho={18} />
        <span>
          {rotulo}
          {descricao && <small>{descricao}</small>}
        </span>
      </dt>
      <dd className="num">{valor}</dd>
    </div>
  )
}
