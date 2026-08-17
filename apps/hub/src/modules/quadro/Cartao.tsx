import { useMemo } from 'react'
import { Icone, PilulaDeEstado, type TomDaPilula } from '@matsuya/ui'
import {
  ORDER_ACTION_INFO,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_LABEL_CURTO,
  acoesDisponiveis,
  type OrderAction,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, horario, restante } from '../../app/formato'

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
 * 1. status da entrega — pílula que abraça o texto
 * 2. número + nome do cliente — o herói
 * 3. **ação primária ou estado**, largura total
 * 4. rodapé com a loja, quando o quadro mostra mais de uma
 *
 * A faixa 3 merece explicação. Em `pronto.png` o botão verde ocupa exatamente
 * o lugar onde, nos cartões sem ação, está a pílula cinza de estado. Não são
 * duas faixas: é **uma faixa que às vezes informa e às vezes age**. Um cartão
 * pronto para sair diz "Pronto" com um botão; um cartão finalizado diz o
 * estado com uma pílula. Mesma geometria, mesmo lugar para o olho voltar.
 *
 * Disso decorre a regra de **uma ação por cartão**. O que não couber vai para
 * o drawer, e o destrutivo vai para lá por escolha, não por falta de espaço:
 * cancelar desfaz o trabalho da cozinha, e não pode ficar a um toque de
 * distância do botão que o operador acerta sem olhar.
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

/**
 * Os quatro degraus do prazo, do mais folgado ao vencido.
 *
 * Quatro e não dois porque a faixa é o único lugar onde o operador lê o
 * relógio, e "faltam 12 min" e "faltam 2 min" pedem reações diferentes. Cada
 * degrau tem cor própria, e a passagem de um para o outro é o que se percebe
 * pelo canto do olho — mais do que a cor em si.
 */
type Urgencia = 'tranquilo' | 'atencao' | 'aperto' | 'estourado'

/** Acima disto o prazo é cinza: existe, mas ainda não pede nada de ninguém. */
const MINUTOS_DE_ATENCAO = 10

/** Onde o âmbar fecha. Cinco minutos é o ponto em que dá para largar o resto. */
const MINUTOS_DE_APERTO = 5

/**
 * Urgência a partir do prazo que a API deriva.
 *
 * `deadlineAt` só existe nos estados em que a loja é responsável pela próxima
 * ação — aguardando aceite e em preparo. Fora deles não há relógio, e é
 * deliberado: cobrar do operador um tempo que depende do entregador é o jeito
 * mais rápido de ensinar alguém a ignorar um alarme.
 */
function urgencia(pedido: PedidoDoQuadro, agora: number): Urgencia {
  if (!pedido.deadlineAt) return 'tranquilo'

  const faltamMs = new Date(pedido.deadlineAt).getTime() - agora
  if (faltamMs < 0) return 'estourado'
  if (faltamMs <= MINUTOS_DE_APERTO * 60_000) return 'aperto'
  if (faltamMs <= MINUTOS_DE_ATENCAO * 60_000) return 'atencao'
  return 'tranquilo'
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
): { tom: TomDaPilula; icone?: 'relogio' | 'check' | 'x' | 'capacete'; texto: string } {
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
      // Com mais de dez minutos o prazo fica cinza: ele existe, corre, e não
      // pede nada de ninguém ainda. Pintar de âmbar desde o aceite gastaria a
      // cor que precisa significar alguma coisa aos cinco minutos.
      tom: nivel === 'tranquilo' ? 'neutro' : 'aviso',
      icone: nivel === 'aperto' ? 'relogio' : undefined,
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
    // "Pronto Há Xmin", como `pronto2.png` — e não "Pronto para sair". O tempo
    // parado importa: um pedido pronto há 12 minutos esfriando é informação, e
    // um rótulo fixo não a carrega.
    const parado = pedido.readyAt ? decorrido(pedido.readyAt, agora) : null
    return {
      tom: 'sucesso',
      icone: 'check',
      texto: parado ? `Pronto há ${parado}` : 'Pronto para sair',
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

type TomDoChip = Urgencia | 'sucesso'
type IconeDoChip = 'capacete' | 'sacola' | 'relogio' | 'check' | 'x' | 'atualizar'

/**
 * A partir de quantos minutos parado o entregador vira problema.
 *
 * Ele chega e o chip fica verde; passados estes minutos, vermelho. É a mesma
 * mecânica de degraus do prazo de preparo, e não dois estados no servidor — o
 * relógio já responde a diferença.
 *
 * Três minutos porque entregador parado no balcão é custo que corre em duas
 * pontas: a corrida dele e a fila da loja. É a única coisa da tela que fica
 * vermelha por causa de alguém que está esperando a cozinha.
 */
const MINUTOS_ATE_ESPERA_VIRAR_PROBLEMA = 3

/**
 * O chip quando existe corrida.
 *
 * Vem **antes** da previsão de entrega ao cliente na ordem de decisão: com
 * entregador atribuído, quem ele é e onde está é o assunto mais concreto que o
 * cartão tem para contar. A previsão volta a aparecer quando ele sai com o
 * pedido, porque aí a pergunta muda de "quando ele chega aqui" para "quando o
 * cliente recebe".
 */
function chipDaCorrida(
  entrega: NonNullable<PedidoDoQuadro['entrega']>,
  agora: number
): { texto: string; icone: IconeDoChip; tom: TomDoChip } | null {
  switch (entrega.estado) {
    case 'buscando':
      return { texto: 'Buscando', icone: 'atualizar', tom: 'tranquilo' }

    case 'a_caminho':
      return {
        // Anônimo de propósito: na rua, o nome não muda decisão nenhuma e
        // ocuparia a única linha de contexto do cartão.
        texto: entrega.etaLojaMinutos
          ? `Entregador(a) chega em ${entrega.etaLojaMinutos} min`
          : 'Entregador(a) a caminho',
        icone: 'capacete',
        tom: 'tranquilo',
      }

    case 'na_loja': {
      const quem = entrega.entregador ?? 'Entregador(a)'
      const minutos = entrega.chegouLojaEm
        ? Math.max(0, Math.floor((agora - new Date(entrega.chegouLojaEm).getTime()) / 60_000))
        : 0

      return minutos >= MINUTOS_ATE_ESPERA_VIRAR_PROBLEMA
        ? {
            texto: `${quem} aguardando há ${minutos} min`,
            icone: 'capacete',
            tom: 'estourado',
          }
        : { texto: `${quem} chegou na loja`, icone: 'capacete', tom: 'sucesso' }
    }

    // Saiu com o pedido: o chip volta a falar da entrega ao cliente, que é a
    // pergunta que passa a valer. `null` devolve a decisão a quem chamou.
    case 'em_rota':
      return null

    case 'falhou':
      return { texto: 'Sem entregador', icone: 'x', tom: 'estourado' }

    case 'entregue':
      return null
  }
}

/**
 * O status de entrega, no topo do cartão.
 *
 * **O que a referência mostra aqui e nós não temos:** a identidade e a posição
 * do entregador — "Fulano chega em 9 min", "Fulano aguardando há 3 min",
 * "Fulano chegou no cliente". A API tem a coluna `orders.courier_id` e a
 * associação com `User`, mas nada a preenche: nenhum pedido tem entregador
 * atribuído, e não existe rastreamento nem evento de chegada. Escrever um nome
 * ou um "chega em 9 min" aqui seria número inventado no lugar onde o operador
 * mais confia na tela.
 *
 * O que este rótulo diz é o mesmo tipo de coisa, com os fatos que existem: o
 * estado da entrega e o tempo, contados a partir de `dispatchedAt`,
 * `deliveredAt` e da previsão da zona. Quando o entregador entrar na API, é
 * aqui que o nome dele encaixa, sem mudar a forma.
 *
 * **O prazo não entra aqui.** Ele mora na faixa de baixo, na largura toda do
 * cartão. Este chip já tomou a contagem uma vez, e o resultado eram dois
 * relógios no mesmo cartão discordando por um minuto de arredondamento.
 */
function statusDaEntrega(
  pedido: PedidoDoQuadro,
  agora: number
): { texto: string; icone: IconeDoChip; tom: TomDoChip } {
  // O prazo **não** aparece aqui. Ele já ocupa a faixa de baixo, que diz
  // "Prepare em até 6min" ou "Pedido em atraso há 3min" na largura toda do
  // cartão. Repetir a mesma contagem no chip do topo dava dois relógios
  // discordando por um minuto de arredondamento, e o operador conferindo qual
  // dos dois valia. Este chip fala só de entrega.

  // 1. Desfechos. Entregue é o único verde do cartão — é o fim feliz, e vale
  //    a cor justamente por ser o estado sobre o qual não há mais nada a fazer.
  if (pedido.status === 'delivered') {
    return {
      texto: pedido.deliveredAt
        ? `Entregue às ${horario.format(new Date(pedido.deliveredAt))}`
        : 'Entregue ao cliente',
      icone: 'check',
      tom: 'sucesso',
    }
  }

  if (pedido.status === 'delivery_failed') {
    return { texto: 'Falha na entrega', icone: 'x', tom: 'estourado' }
  }

  if (pedido.status === 'customer_not_found') {
    return { texto: 'Cliente não localizado', icone: 'x', tom: 'estourado' }
  }

  if (pedido.status === 'cancelled' || pedido.status === 'rejected') {
    return { texto: 'Pedido cancelado', icone: 'x', tom: 'tranquilo' }
  }

  if (pedido.deliveryType === 'pickup') {
    return { texto: 'Retirada no balcão', icone: 'sacola', tom: 'tranquilo' }
  }

  // 2. A corrida, quando existe e tem o que dizer.
  if (pedido.entrega) {
    const daCorrida = chipDaCorrida(pedido.entrega, agora)
    if (daCorrida) return daCorrida
  }

  // 3. Na rua. A previsão vencida é aviso, não erro: o pedido está a caminho,
  //    só passou da conta — quem decide o que fazer é quem lê.
  const previsao = pedido.estimatedDeliveryAt ? new Date(pedido.estimatedDeliveryAt) : null

  if (pedido.status === 'out_for_delivery') {
    if (previsao && previsao.getTime() > agora) {
      return {
        texto: `Chega ao cliente em ${restante(pedido.estimatedDeliveryAt!, agora)}`,
        icone: 'capacete',
        tom: 'tranquilo',
      }
    }
    if (previsao) {
      return {
        texto: `Previsão vencida há ${decorrido(pedido.estimatedDeliveryAt!, agora)}`,
        icone: 'capacete',
        tom: 'atencao',
      }
    }
    return {
      texto: pedido.dispatchedAt
        ? `Indo para o cliente há ${decorrido(pedido.dispatchedAt, agora)}`
        : 'Indo para o cliente',
      icone: 'capacete',
      tom: 'tranquilo',
    }
  }

  if (pedido.status === 'awaiting_courier') {
    return { texto: 'Aguardando o entregador', icone: 'capacete', tom: 'tranquilo' }
  }

  // 4. Ainda na loja — em preparo e pronto. O que interessa aqui é a hora que
  //    a comida chega no cliente, que é o que ele pergunta ao telefone.
  if (previsao) {
    return {
      texto: `Entrega prevista às ${horario.format(previsao)}`,
      icone: 'capacete',
      tom: 'tranquilo',
    }
  }

  return { texto: 'Entrega', icone: 'capacete', tom: 'tranquilo' }
}

/**
 * O ícone que acompanha a ação primária no botão.
 *
 * A referência põe um check no botão "Pronto", e o ícone é o que permite ler o
 * botão de longe, antes do texto. Onde o significado não é confirmação — sair
 * para entrega — o ícone acompanha o significado em vez de repetir o check.
 */
const ICONE_DA_ACAO: Partial<Record<OrderAction, 'check' | 'capacete' | 'relogio'>> = {
  accept: 'check',
  preparing: 'relogio',
  ready: 'check',
  dispatch: 'capacete',
  deliver: 'check',
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
  const topo = statusDaEntrega(pedido, agora)

  const acoes = useMemo(
    () =>
      acoesDisponiveis(
        { status: pedido.status, deliveryType: pedido.deliveryType },
        permissoes
      ),
    [pedido.status, pedido.deliveryType, permissoes]
  )

  // Uma ação, e só a primária. As destrutivas — recusar, cancelar, falha na
  // entrega — moram no drawer: desfazem trabalho já feito, e um alvo de
  // largura total ao lado do botão que se acerta sem olhar é um cancelamento
  // acidental por turno.
  const principal = acoes.find((a) => ORDER_ACTION_INFO[a].enfase === 'primaria') ?? null

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
        <span className="cartao__topo">
          <span
            className="cartao__contexto"
            data-tom={topo.tom}
            data-buscando={pedido.entrega?.estado === 'buscando' || undefined}
          >
            <Icone nome={topo.icone} tamanho={13} />
            {topo.texto}
          </span>
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
      </button>

      {/*
        A faixa mostra o **estado**, e revela a **ação** quando o ponteiro
        chega. É o que separa `aceitar1.png` de `aceitar2.png`: os dois prints
        são o mesmo quadro, e a única diferença é o primeiro cartão, onde a
        contagem regressiva deu lugar ao botão verde sob o ponteiro.

        A troca resolve uma disputa real por espaço. A contagem é o que o
        operador lê o tempo todo — é dela que sai a ordem de trabalho —, mas a
        faixa também é o único alvo grande do cartão. Mostrar ação sempre custa
        a contagem; mostrar contagem sempre custa dois toques por pedido. Sob o
        ponteiro, o cartão já é o que está sendo decidido, e a contagem
        cumpriu o papel dela.

        O botão fica fora do `cartao__abrir` porque botão dentro de botão não é
        HTML válido, e o navegador resolve isso de um jeito que rouba o clique.
      */}
      <div className="cartao__faixa">
        <PilulaDeEstado
          tom={pilula.tom}
          icone={pilula.icone}
          aperto={nivel === 'aperto'}
          // Só brilha o que tem relógio correndo — e o atraso fica de fora,
          // porque lá o vermelho sólido já é o elemento mais forte da tela.
          contando={!!pedido.deadlineAt && nivel !== 'estourado'}
        >
          {pilula.texto}
        </PilulaDeEstado>

        {principal && (
          <button
            type="button"
            className="cartao__acao"
            data-ocupado={ocupado || undefined}
            disabled={ocupado}
            onClick={() => aoPedirAcao(pedido, principal)}
          >
            <Icone nome={ICONE_DA_ACAO[principal] ?? 'check'} tamanho={16} />
            {ORDER_ACTION_INFO[principal].rotulo}
          </button>
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
