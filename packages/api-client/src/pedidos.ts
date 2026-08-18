import {
  respostaDeMudancasSchema,
  type OrderAction,
  type OrderStatus,
  type RespostaDeMudancas,
} from '@matsuya/contracts'
import type { ApiClient } from './cliente'

/**
 * Endpoints de pedido.
 *
 * Uma função por rota, com o tipo do retorno declarado. O ganho não é
 * digitação: é que renomear um campo no contrato quebra a compilação aqui, em
 * vez de virar `undefined` numa célula da tabela.
 */

/** Os estados da corrida. Espelha `modules/entregas/maquina.ts` na API. */
export type EstadoDaCorrida =
  | 'buscando'
  | 'a_caminho'
  | 'na_loja'
  | 'em_rota'
  | 'entregue'
  | 'falhou'

export interface EntregaDoQuadro {
  estado: EstadoDaCorrida
  /**
   * Nome do entregador — **a partir da atribuição**.
   *
   * A API decide isso, e não o cartão, para as telas não divergirem. A regra já
   * foi "só a partir da chegada", pensada para o cartão do quadro, onde o nome
   * ocupa a única linha de contexto. Caiu quando a tela "Em rota" passou a
   * existir: lá, "quem está vindo?" é a pergunta, e metade da aba de coleta
   * ficava sem rosto justamente no trecho em que alguém está a caminho.
   *
   * Nulo em `buscando`: ali não há ninguém atribuído.
   */
  entregador: string | null
  /**
   * Minutos até ele chegar na loja, como informado por quem atribuiu.
   *
   * Nunca calculado por nós — não há posição de entregador em lugar nenhum.
   * Nulo é legítimo, e o chip diz "a caminho" sem minuto.
   */
  etaLojaMinutos: number | null
  /**
   * Quando o entregador foi atribuído — o marco zero do trecho até a loja.
   *
   * Anda junto do ETA porque um sem o outro não mede nada: o ETA conta **a
   * partir da atribuição**. Usar o aceite do pedido, que já está no quadro,
   * mentiria para o lado errado — ele é anterior, e a barra diria que o
   * entregador está chegando quando ele acabou de sair.
   */
  atribuidoEm: string | null
  /** Quando chegou. É daqui que sai o "aguardando há X min". */
  chegouLojaEm: string | null
  /**
   * Foto e nota, como o parceiro de entrega as publica — nada nesta stack as
   * calcula.
   *
   * Seguem a mesma regra do nome: a partir da atribuição.
   *
   * `notaDeQuantas` acompanha a média porque uma nota sozinha é ilegível: 5,0
   * com três corridas e 4,7 com oitocentas dizem coisas opostas, e a tela
   * precisa poder omitir a primeira.
   */
  fotoUrl: string | null
  nota: number | null
  notaDeQuantas: number | null
  /**
   * Onde o entregador estava da última vez que se soube.
   *
   * **Não segue a regra do nome.** Foto e nome só aparecem a partir da chegada
   * à loja; posição é o contrário — só interessa **enquanto ele está na rua**,
   * e vale nos dois trechos, até a loja e até o cliente.
   *
   * `em` vem sempre junto: um pino desenhado a partir de um ping de quarenta
   * minutos atrás mente com a mesma confiança de um de cinco segundos, e sem o
   * carimbo a tela não tem como distinguir os dois.
   *
   * `null` é o caso normal em produção — não existe app de entregador nem
   * publicação do parceiro. Quem preenche hoje é o simulador.
   */
  posicao: PosicaoDoEntregador | null
}

export interface PosicaoDoEntregador {
  lat: number
  lng: number
  /** ISO de quando a posição foi recebida. */
  em: string
}

export interface PedidoDoQuadro {
  id: number
  code: string | null
  /**
   * Primeiro nome e inicial do sobrenome, montados pela API.
   *
   * `null` quando o pedido não tem cliente carregado — o cartão simplesmente
   * omite a linha em vez de mostrar um espaço reservado.
   */
  customerLabel: string | null
  status: OrderStatus
  version: number
  unityId: number
  deliveryType: 'delivery' | 'pickup'
  paymentMethod: string
  paymentStatus: string
  subtotal: number
  deliveryFee: number
  total: number
  notes?: string | null
  etaAt: string | null
  slaExpiresAt: string | null
  slaExpiredAt: string | null
  hasPartialCancellation: boolean
  createdAt: string
  addressSnapshot: Record<string, unknown> | null
  /**
   * Previsão de entrega ao cliente, do prazo da zona congelado no checkout.
   *
   * **Não é o ETA do entregador** — esse vem em `entrega.etaLojaMinutos`, e
   * mede outra coisa: o tempo até ele chegar na **loja**. Nulo em retirada e em
   * pedido anterior à coluna, e aí a tela mostra tempo decorrido em vez de um
   * horário que ninguém pode cumprir.
   */
  estimatedDeliveryAt: string | null
  deliveryEtaMinutes: number | null
  /** Carimbo do aceite. É o fato que diz se a comanda deste pedido já saiu. */
  acceptedAt: string | null
  /** Quando ficou pronto — o cartão conta o tempo parado a partir daqui. */
  readyAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  /** Prazo derivado pela API — ver `modules/orders/prazos.ts` lá. */
  deadlineAt: string | null
  deadlineKind: 'aceite' | 'preparo' | null
  /** Janela cheia do prazo, para a barra do cartão de aceite saber o 100%. */
  deadlineTotalMinutes: number | null
  /**
   * A corrida — o trecho do pedido que acontece na rua.
   *
   * `null` significa **não tem corrida**: retirada no balcão, ou pedido ainda
   * não aceito. `undefined` significa que a API não a consultou nesta
   * mensagem, e aí o cartão mantém o que já sabia em vez de apagar o
   * entregador da tela a cada mudança de status do pedido.
   */
  entrega?: EntregaDoQuadro | null
  items?: Array<{
    id: number
    productName: string
    qty: number
    cancelledQty?: number
    unitPrice: number
    lineTotal?: number
    /**
     * Foto do produto no catálogo — **não** um instantâneo do pedido.
     *
     * É a única coisa do produto que viaja junto do item, e serve para a
     * miniatura da lista. Nula é comum e legítima: produto sem foto cadastrada,
     * ou pedido cujo produto foi removido do catálogo depois.
     */
    imageUrl?: string | null
    /**
     * Observação **deste item** — "sem cebola nesta, com cebola na outra".
     *
     * Coexiste com `notes` do pedido, que vale para o pedido inteiro. Nula é o
     * caso comum: só existe quando o cliente escreveu algo naquela linha.
     */
    notes?: string | null
    /** Opções escolhidas, congeladas no momento do pedido. */
    optionsSnapshot?: Array<{
      groupId: number
      groupName: string
      optionId: number
      optionName: string
      priceDelta: number
    }>
  }>
}

export interface QuadroDaLoja {
  orders: PedidoDoQuadro[]
  /** Cursor do diário, no mesmo corpo do snapshot — sem janela entre os dois. */
  cursor: number
}

export interface ResultadoDeTransicao {
  order: PedidoDoQuadro
  seq: number
  transition: { from: OrderStatus; to: OrderStatus }
}

export interface EntradaDeTransicao {
  orderId: number
  acao: OrderAction
  reasonCode?: string
  reasonNote?: string
  /** Versão sobre a qual o operador viu a tela. Vira `If-Match`. */
  versaoEsperada?: number
}


/**
 * O acompanhamento de uma entrega — o que a folha inferior do mapa consome.
 *
 * **Não vem no quadro, e é de propósito.** O traçado tem algumas centenas de
 * pontos; mandá-lo em toda sincronização custaria a todos por algo que uma
 * pessoa pediu ao clicar em "Acompanhar". Buscado sob demanda, e por isso
 * também mais fresco: o traçado do trecho até a loja só existe depois do
 * primeiro ping de posição.
 */
export interface AcompanhamentoDaEntrega {
  entrega: EntregaDoQuadro | null
  /** Para onde ele está indo **agora** — vem do estado, não do traçado guardado. */
  perna: 'loja' | 'cliente'
  /*
   * Loja e destino vêm inline em vez de num tipo `Coordenada` exportado: o Hub
   * já importa um com esse nome de `@matsuya/utils`, e um segundo homônimo
   * chegando por outro pacote é confusão de importação sem nenhum ganho.
   */
  loja: { lat: number; lng: number } | null
  destino: { lat: number; lng: number } | null
  rota: RotaDaEntrega | null
  /**
   * Quanto falta.
   *
   * `pelaRota` separa duas medidas que não são a mesma: em cidade a linha reta
   * costuma dar uns 30% a menos que a rua. Sem a marca, a tela apresentaria as
   * duas com a mesma confiança.
   */
  restante: { metros: number; pelaRota: boolean } | null
  /**
   * Previsão de chegada, em ISO.
   *
   * `null` sempre que não houver traçado — é o roteador que diz quanto tempo o
   * caminho leva, e sem ele qualquer número seria invenção. A tela mostra o que
   * sabe e omite o resto.
   */
  chegaEm: string | null
}

export interface RotaDaEntrega {
  /**
   * O traçado, **na ordem do GeoJSON**: `[lng, lat]`.
   *
   * Já decodificado pela API — o Hub nunca vê polilinha. A ordem é a do
   * GeoJSON porque o destino final é um `LineString` no mapa, e inverter no
   * caminho é o erro silencioso clássico do assunto: São Paulo vira um ponto no
   * deserto da Líbia e nada reclama.
   */
  pontos: Array<[number, number]>
  metros: number
  segundos: number
  de: 'loja' | 'cliente'
}

export function criarApiDePedidos(cliente: ApiClient) {
  return {
    quadroDaLoja: (params: {
      unityId: number
      status?: OrderStatus[]
      limite?: number
      cursor?: number
      signal?: AbortSignal
    }) =>
      cliente.requisitar<QuadroDaLoja>(`/stores/${params.unityId}/orders`, {
        query: {
          status: params.status?.join(','),
          limit: params.limite,
          cursor: params.cursor,
        },
        signal: params.signal,
      }),

    /**
     * Um pedido só, completo.
     *
     * O resumo que chega pelo socket é enxuto de propósito — sem itens e sem
     * endereço. Um pedido que entra no quadro por evento, e não pelo snapshot,
     * chega sem os dois, e o painel de detalhe fica sem o que mostrar. Isto
     * completa a linha, e só quando o painel abre.
     */
    pedido: (id: number, signal?: AbortSignal) =>
      cliente.requisitar<PedidoDoQuadro>(`/orders/${id}`, { signal }),

    /**
     * O intervalo de mudanças desde um cursor.
     *
     * Validado com zod na chegada: é a resposta de que depende a correção do
     * quadro, e aceitar um corpo com formato inesperado aqui significaria
     * avançar o cursor sem ter aplicado nada — perdendo, em silêncio,
     * exatamente os eventos que a chamada existia para recuperar.
     */
    async mudancas(params: {
      unityId: number
      since: number
      limit?: number
      signal?: AbortSignal
    }): Promise<RespostaDeMudancas> {
      const bruto = await cliente.requisitar<unknown>(
        `/stores/${params.unityId}/orders/changes`,
        { query: { since: params.since, limit: params.limit }, signal: params.signal }
      )
      return respostaDeMudancasSchema.parse(bruto)
    },

    /**
     * O acompanhamento de uma entrega, no instante em que alguém pergunta.
     *
     * Pode demorar alguns segundos na **primeira** vez de cada trecho: se o
     * traçado ainda não foi buscado, a API o busca agora e espera. Nas
     * chamadas seguintes ele já está gravado.
     */
    acompanharEntrega: (orderId: number, signal?: AbortSignal) =>
      cliente.requisitar<AcompanhamentoDaEntrega>(`/orders/${orderId}/delivery/tracking`, {
        signal,
      }),

    transicionar: (entrada: EntradaDeTransicao) =>
      cliente.requisitar<ResultadoDeTransicao>(
        `/orders/${entrada.orderId}/${entrada.acao}`,
        {
          metodo: 'POST',
          corpo: {
            reasonCode: entrada.reasonCode,
            reasonNote: entrada.reasonNote,
          },
          versaoEsperada: entrada.versaoEsperada,
        }
      ),
  }
}

export type ApiDePedidos = ReturnType<typeof criarApiDePedidos>
