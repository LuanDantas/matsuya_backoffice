import { useMemo } from 'react'
import { Botao, Drawer, Icone, Selo, type NomeDoIcone } from '@matsuya/ui'
import {
  ORDER_ACTION_INFO,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  acoesDisponiveis,
  type OrderAction,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, horario, moeda, restante } from '../../app/formato'

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
 *
 * ## O desenho
 *
 * Fundo cinza com seções em cartões brancos, e não uma folha branca com
 * títulos. O painel responde perguntas de naturezas diferentes — o que a
 * cozinha monta, para onde vai, quem leva, quanto é — e numa folha contínua
 * elas viram um texto só, em que achar o endereço exige ler os itens. Cada
 * cartão é uma pergunta, e o cinza entre eles é o que deixa pular de uma para
 * outra sem ler o meio.
 *
 * Antes das seções vem uma faixa de fatos: os quatro números que decidem
 * alguma coisa (estado, prazo, modo de entrega, pagamento) juntos no topo,
 * onde o olho cai. Eram três selos sem valor nenhum — diziam a categoria e
 * obrigavam a procurar o número lá embaixo.
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

const VERBO_DO_PRAZO: Record<'aceite' | 'preparo', string> = {
  aceite: 'Aceitar',
  preparo: 'Preparar',
}

/** O que o cartão da corrida diz, por estado. Texto e tom, nunca só tom. */
const CORRIDA: Record<string, { titulo: string; tom: 'neutro' | 'sucesso' | 'atencao' | 'critico' }> =
  {
    buscando: { titulo: 'Procurando entregador(a)', tom: 'atencao' },
    a_caminho: { titulo: 'Entregador(a) a caminho da loja', tom: 'neutro' },
    na_loja: { titulo: 'Entregador(a) na loja', tom: 'sucesso' },
    em_rota: { titulo: 'A caminho do cliente', tom: 'neutro' },
    entregue: { titulo: 'Entregue', tom: 'sucesso' },
    falhou: { titulo: 'Sem entregador(a)', tom: 'critico' },
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
  const retirada = pedido.deliveryType === 'pickup'
  const corrida = pedido.entrega ? CORRIDA[pedido.entrega.estado] : null

  // Vencido é vencido: `restante` devolveria "0min" e esconderia o atraso.
  const prazoVencido =
    !!pedido.deadlineAt && new Date(pedido.deadlineAt).getTime() < agora

  return (
    <Drawer
      aberto
      variante="pedido"
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
      acoes={
        /*
          A conversa sobe para o cabeçalho, como na referência. No rodapé ela
          disputava a linha com "Despachar", e são coisas de peso diferente:
          uma abre um canal, a outra move o pedido de coluna. O número de não
          lidas vai num distintivo, que é o que faz olhar.
        */
        <button
          type="button"
          className="drawer-pedido__redondo"
          onClick={aoAbrirConversa}
          aria-label={
            naoLidas > 0
              ? `Abrir a conversa — ${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}`
              : 'Abrir a conversa'
          }
          data-dica="Conversa com o cliente"
          data-dica-lado="abaixo"
        >
          <Icone nome="balao" tamanho={20} />
          {naoLidas > 0 && (
            <span className="drawer-pedido__nao-lidas num" aria-hidden="true">
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
        </button>
      }
      rodape={
        <>
          {/*
            Imprimir fica à esquerda, separado das ações de fluxo por um vão
            elástico: reimprimir uma comanda é sempre possível e não move o
            pedido, e alinhá-lo junto do botão que despacha é como se acerta
            o errado sem olhar.
          */}
          <Botao enfase="fantasma" icone="impressora" onClick={aoImprimir}>
            Imprimir
          </Botao>

          <span className="drawer-pedido__vao" />

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
      {/*
        A faixa de fatos. Quatro no máximo, e cada um com um valor — o rótulo
        sozinho ("Entrega") não decide nada; "Prevista 23:34" decide.
      */}
      <div className="drawer-pedido__fatos">
        <div className="drawer-pedido__fato">
          <span className="drawer-pedido__fato-rotulo">Estado</span>
          <Selo tom={ORDER_STATUS_TONE[pedido.status]}>{ORDER_STATUS_LABEL[pedido.status]}</Selo>
        </div>

        {pedido.deadlineAt && pedido.deadlineKind && (
          <div className="drawer-pedido__fato" data-alarme={prazoVencido || undefined}>
            <span className="drawer-pedido__fato-rotulo">
              {VERBO_DO_PRAZO[pedido.deadlineKind]}
            </span>
            <strong className="drawer-pedido__fato-valor num">
              {prazoVencido
                ? `atrasado há ${decorrido(pedido.deadlineAt, agora)}`
                : `em até ${restante(pedido.deadlineAt, agora)}`}
            </strong>
          </div>
        )}

        <div className="drawer-pedido__fato">
          <span className="drawer-pedido__fato-rotulo">{retirada ? 'Retirada' : 'Entrega'}</span>
          <strong className="drawer-pedido__fato-valor num">
            {retirada
              ? 'no balcão'
              : pedido.estimatedDeliveryAt
                ? `prevista ${horario.format(new Date(pedido.estimatedDeliveryAt))}`
                : 'sem previsão'}
          </strong>
        </div>

        <div className="drawer-pedido__fato">
          <span className="drawer-pedido__fato-rotulo">
            {ROTULO_DO_PAGAMENTO[pedido.paymentMethod] ?? pedido.paymentMethod}
          </span>
          <strong className="drawer-pedido__fato-valor num">
            {pedido.paymentStatus === 'paid' ? 'pago' : 'a receber'}
          </strong>
        </div>
      </div>

      {/* Observação do cliente em destaque, e antes dos itens: é o que a
          cozinha erra quando está no rodapé. */}
      {pedido.notes && (
        <p className="drawer-pedido__observacao">
          <Icone nome="alerta" tamanho={18} />
          <span>
            <small>Observação do cliente</small>
            {pedido.notes}
          </span>
        </p>
      )}

      {pedido.hasPartialCancellation && (
        <p className="drawer-pedido__observacao" data-tom="atencao">
          <Icone nome="alerta" tamanho={18} />
          <span>
            <small>Pedido alterado</small>
            Um item foi cancelado depois que o pedido entrou. Confira a lista antes de montar.
          </span>
        </p>
      )}

      {corrida && pedido.entrega && (
        <section className="drawer-pedido__cartao drawer-pedido__corrida" data-tom={corrida.tom}>
          <span className="drawer-pedido__marca-agua" aria-hidden="true">
            <Icone nome="capacete" tamanho={20} />
          </span>

          <div>
            <h3>{corrida.titulo}</h3>
            {pedido.entrega.entregador && (
              <p className="drawer-pedido__corrida-quem">{pedido.entrega.entregador}</p>
            )}
            <p className="drawer-pedido__corrida-tempo">
              {pedido.entrega.chegouLojaEm
                ? `Na loja há ${decorrido(pedido.entrega.chegouLojaEm, agora)}`
                : pedido.entrega.etaLojaMinutos !== null
                  ? `Chega em ${pedido.entrega.etaLojaMinutos} min`
                  : 'Sem previsão de chegada'}
            </p>
          </div>
        </section>
      )}

      <section className="drawer-pedido__cartao">
        <Cabecalho icone={retirada ? 'casa' : 'mapa'} titulo={retirada ? 'Retirada' : 'Entrega'} />

        {retirada ? (
          <p className="drawer-pedido__texto">O cliente retira no balcão.</p>
        ) : endereco ? (
          <p className="drawer-pedido__endereco">
            <strong>{[endereco.street, endereco.number].filter(Boolean).join(', ')}</strong>
            {endereco.complement && <>{endereco.complement}</>}
            {(endereco.district || endereco.city) && (
              <span>{[endereco.district, endereco.city].filter(Boolean).join(' · ')}</span>
            )}
          </p>
        ) : (
          <p className="drawer-pedido__texto drawer-pedido__texto--fraco">
            Endereço não informado neste pedido.
          </p>
        )}
      </section>

      <section className="drawer-pedido__cartao">
        <Cabecalho icone="sacola" titulo="Itens no pedido" contagem={quantidade} />

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

      <section className="drawer-pedido__cartao">
        <Cabecalho icone="lista" titulo="Valores" />

        <dl className="drawer-pedido__valores">
          <Linha rotulo="Subtotal" valor={moeda.format(pedido.subtotal)} />
          {pedido.deliveryFee > 0 && (
            <Linha rotulo="Taxa de entrega" valor={moeda.format(pedido.deliveryFee)} />
          )}
          <Linha rotulo="Total" valor={moeda.format(pedido.total)} destaque />
          <Linha
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
 * O cabeçalho de um cartão de seção: ícone em disco, título, contagem opcional.
 *
 * O disco existe para o título ter uma âncora fixa na margem esquerda — com
 * quatro cartões empilhados, o olho desce por essa coluna de ícones e para no
 * que procura sem ler nenhum título inteiro.
 */
function Cabecalho({
  icone,
  titulo,
  contagem,
}: {
  icone: NomeDoIcone
  titulo: string
  contagem?: number
}) {
  return (
    <h3 className="drawer-pedido__cabecalho">
      <span className="drawer-pedido__disco" aria-hidden="true">
        <Icone nome={icone} tamanho={16} />
      </span>
      {titulo}
      {contagem !== undefined && (
        <span className="drawer-pedido__contagem num">{contagem}</span>
      )}
    </h3>
  )
}

/**
 * Linha de valor: rótulo (com apoio opcional) à esquerda, valor à direita.
 *
 * O ícone que havia em cada linha saiu: eram quatro símbolos diferentes para
 * quatro linhas de uma tabela de dinheiro, e nenhum deles dizia algo que o
 * rótulo ao lado já não dissesse. O que a leitura precisa aqui é da coluna de
 * números alinhada à direita, e o ícone só empurrava o rótulo para longe dela.
 */
function Linha({
  rotulo,
  descricao,
  valor,
  destaque = false,
}: {
  rotulo: string
  descricao?: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="drawer-pedido__linha" data-destaque={destaque || undefined}>
      <dt>
        {rotulo}
        {descricao && <small>{descricao}</small>}
      </dt>
      <dd className="num">{valor}</dd>
    </div>
  )
}
