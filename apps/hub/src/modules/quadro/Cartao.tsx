import { useMemo } from 'react'
import { Botao, Icone, PilulaDeEstado, type TomDaPilula } from '@matsuya/ui'
import {
  ORDER_ACTION_INFO,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_LABEL_CURTO,
  acoesDisponiveis,
  type OrderAction,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, horario, moeda, restante } from '../../app/formato'

/**
 * O cartão de pedido.
 *
 * A hierarquia vem das referências e é a decisão mais importante da tela: **o
 * número do pedido é o herói**, no dobro do tamanho de qualquer outra coisa.
 * Antes tudo no cartão tinha 16 px e o operador precisava procurar o número que
 * o cliente estava dizendo ao telefone.
 *
 * Quatro faixas, de cima para baixo:
 *
 * 1. contexto (tempo de espera, tipo de entrega) — pequeno, cor semântica
 * 2. número + nome do cliente — o herói
 * 3. pílula de estado, largura total
 * 4. ações
 *
 * A faixa 4 é a nossa diferença em relação à referência: no iFood o cartão não
 * age, só informa. Aqui o operador aceita e recusa direto do quadro, e é para
 * isso que ele olha a tela — tirar a ação do cartão custaria dois toques em
 * cada pedido do turno.
 */

export type VarianteDoCartao = 'largo' | 'denso'

export interface PropsDoCartao {
  pedido: PedidoDoQuadro
  permissoes: ReadonlySet<string>
  agora: number
  ocupado: boolean
  variante?: VarianteDoCartao
  /** Marca o cartão cujo drawer está aberto. */
  selecionado?: boolean
  /**
   * Nome da unidade, quando o quadro mostra mais de uma loja.
   *
   * Com uma loja só ele é ruído: todo cartão diria a mesma coisa. Com várias,
   * é a informação que impede o operador de agir no pedido da loja errada.
   */
  nomeDaUnidade?: string | null
  aoPedirAcao: (pedido: PedidoDoQuadro, acao: OrderAction) => void
  aoAbrirDetalhe: (pedido: PedidoDoQuadro) => void
}

type Urgencia = 'normal' | 'perto' | 'estourado'

/**
 * Urgência a partir do prazo que a API deriva.
 *
 * `deadlineAt` só existe nos estados em que a loja é responsável pela próxima
 * ação — aguardando aceite e em preparo. Fora deles não há relógio, e é
 * deliberado: cobrar do operador um tempo que depende do entregador é o jeito
 * mais rápido de ensinar alguém a ignorar um alarme.
 */
function urgencia(pedido: PedidoDoQuadro, agora: number): Urgencia {
  if (!pedido.deadlineAt) return 'normal'

  const faltamMs = new Date(pedido.deadlineAt).getTime() - agora
  if (faltamMs < 0) return 'estourado'
  if (faltamMs <= 3 * 60_000) return 'perto'
  return 'normal'
}

const VERBO_DO_PRAZO: Record<'aceite' | 'preparo', string> = {
  aceite: 'Aceite',
  preparo: 'Prepare',
}

/**
 * O que a pílula diz, e com que peso.
 *
 * A contagem regressiva usa o âmbar enquanto há tempo e vira vermelho sólido
 * quando estoura. É a **mudança** que o operador percebe pelo canto do olho —
 * por isso o atraso é o único preenchimento sólido da interface inteira.
 */
function estado(
  pedido: PedidoDoQuadro,
  agora: number,
  nivel: Urgencia,
  denso: boolean
): { tom: TomDaPilula; icone?: 'relogio' | 'check' | 'x' | 'moto'; texto: string } {
  if (pedido.deadlineAt && pedido.deadlineKind) {
    const verbo = VERBO_DO_PRAZO[pedido.deadlineKind]

    if (nivel === 'estourado') {
      const atraso = decorrido(pedido.deadlineAt, agora)
      return {
        tom: 'critico',
        icone: 'relogio',
        texto: denso ? `Atraso ${atraso}` : `Pedido em atraso há ${atraso}`,
      }
    }

    const falta = restante(pedido.deadlineAt, agora)
    return {
      tom: 'aviso',
      icone: nivel === 'perto' ? 'relogio' : undefined,
      texto: denso ? `${verbo} em ${falta}` : `${verbo} em até ${falta}`,
    }
  }

  if (pedido.status === 'delivery_failed' || pedido.status === 'customer_not_found') {
    return {
      tom: 'perigo',
      icone: 'x',
      texto: denso
        ? ORDER_STATUS_LABEL_CURTO[pedido.status]
        : ORDER_STATUS_LABEL[pedido.status],
    }
  }

  if (pedido.status === 'ready') {
    return {
      tom: 'sucesso',
      icone: 'check',
      texto: denso ? 'Pronto' : 'Pronto para sair',
    }
  }

  const tempo = decorrido(pedido.createdAt, agora)
  return {
    tom: 'neutro',
    texto: denso
      ? `${ORDER_STATUS_LABEL_CURTO[pedido.status]} · ${tempo}`
      : `${ORDER_STATUS_LABEL[pedido.status]} há ${tempo}`,
  }
}

/**
 * A linha de contexto, no topo do cartão.
 *
 * A referência mostra aqui o ETA do entregador até a loja. Não temos isso — não
 * há entregador atribuído nem rastreamento —, então o espaço vai para a
 * informação que existe e que o cliente pergunta ao telefone: quando a comida
 * chega. Cai para tempo na rua quando não há previsão, em vez de mostrar um
 * horário que ninguém pode cumprir.
 */
function contexto(pedido: PedidoDoQuadro, agora: number): string {
  if (pedido.deliveryType === 'pickup') return 'Retirada no balcão'

  const emRota =
    pedido.status === 'out_for_delivery' ||
    pedido.status === 'awaiting_courier' ||
    pedido.status === 'delivery_failed' ||
    pedido.status === 'customer_not_found'

  if (pedido.estimatedDeliveryAt) {
    const previsao = new Date(pedido.estimatedDeliveryAt)
    const atrasada = previsao.getTime() < agora
    return atrasada
      ? `Previsão vencida às ${horario.format(previsao)}`
      : `Entrega prevista às ${horario.format(previsao)}`
  }

  if (emRota && pedido.dispatchedAt) {
    return `Na rua há ${decorrido(pedido.dispatchedAt, agora)}`
  }

  return 'Entrega'
}

export function Cartao({
  pedido,
  permissoes,
  agora,
  ocupado,
  variante = 'largo',
  selecionado = false,
  nomeDaUnidade = null,
  aoPedirAcao,
  aoAbrirDetalhe,
}: PropsDoCartao) {
  const denso = variante === 'denso'
  const nivel = urgencia(pedido, agora)
  const pilula = estado(pedido, agora, nivel, denso)

  const acoes = useMemo(
    () =>
      acoesDisponiveis(
        { status: pedido.status, deliveryType: pedido.deliveryType },
        permissoes
      ),
    [pedido.status, pedido.deliveryType, permissoes]
  )

  // No modo denso cabe uma ação; no largo, duas. O resto vai para o detalhe.
  // Uma fileira de seis botões num cartão estreito é uma fileira de alvos que
  // ninguém acerta.
  const limite = denso ? 1 : 2
  const noCartao = acoes.slice(0, limite)
  const sobraram = acoes.length - noCartao.length

  return (
    <article
      className="cartao"
      data-variante={variante}
      data-urgencia={nivel}
      data-selecionado={selecionado || undefined}
    >
      <button
        type="button"
        className="cartao__abrir"
        onClick={() => aoAbrirDetalhe(pedido)}
        aria-label={`Abrir o pedido ${pedido.code ?? pedido.id}${pedido.customerLabel ? ` de ${pedido.customerLabel}` : ''}`}
      >
        <span className="cartao__contexto">
          <Icone nome={pedido.deliveryType === 'pickup' ? 'sacola' : 'moto'} tamanho={13} />
          {contexto(pedido, agora)}
          {pedido.hasPartialCancellation && (
            <span className="cartao__alteracao">
              <Icone nome="alerta" tamanho={12} />
              alterado
            </span>
          )}
        </span>

        <span className="cartao__heroi">
          <strong className="cartao__numero num">{pedido.code ?? `#${pedido.id}`}</strong>
          {pedido.customerLabel && (
            <span className="cartao__cliente">{pedido.customerLabel}</span>
          )}
        </span>

        <PilulaDeEstado tom={pilula.tom} icone={pilula.icone}>
          {pilula.texto}
        </PilulaDeEstado>

        {!denso && (
          <span className="cartao__valor num">{moeda.format(pedido.total)}</span>
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

      {nomeDaUnidade && (
        <footer className="cartao__rodape">
          <Icone nome="loja" tamanho={13} />
          {nomeDaUnidade}
        </footer>
      )}
    </article>
  )
}
