import type { ApiClient } from './cliente'

/**
 * Painel da unidade.
 *
 * Exige `reports:read`, que o atendente de balcão não tem — e é correto que não
 * tenha: aqui não se opera pedido, se lê número consolidado. O front precisa
 * **esconder** a entrada de navegação para quem não tem a permissão, em vez de
 * oferecê-la e deixar a API recusar.
 */

/** Um dia da curva. `dia` é o dia do mês, 1..31 — a chave que alinha as séries. */
export interface PontoDoDia {
  dia: number
  pedidos: number
  faturado: number
}

export interface MesDaUnidade {
  atual: number
  /** Mesmo intervalo de dias no mês anterior, não o mês fechado. */
  mesmoPeriodoMesAnterior: number
  faturado: number
  faturadoMesmoPeriodoMesAnterior: number
  /**
   * `null` com zero pedidos concluídos.
   *
   * Média de nada não é zero: "R$ 0,00 de ticket médio" afirma que os pedidos
   * saíram de graça, quando na verdade não houve pedido. A divisão é feita na
   * API, e não aqui — dividir dois valores já arredondados dá resultado
   * diferente de arredondar a divisão.
   */
  ticketMedio: number | null
  ticketMedioMesmoPeriodoMesAnterior: number | null
  /** Só os dias com pedido; quem consome preenche as lacunas com zero. */
  porDia: PontoDoDia[]
  porDiaMesAnterior: PontoDoDia[]
}

export interface PainelDaUnidade {
  operacao: {
    emAberto: number
    atrasados: number
    maisAntigoEm: string | null
  }
  mes: MesDaUnidade
  avaliacoes: {
    media: number | null
    total: number
    comentarios: Array<{ id: number; nota: number; texto: string; em: string }>
  }
  catalogo: {
    pausados: number
    total: number
  }
}

export function criarApiDePainel(cliente: ApiClient) {
  return {
    daUnidade: (unityId: number, signal?: AbortSignal) =>
      cliente.requisitar<PainelDaUnidade>(`/stores/${unityId}/dashboard`, { signal }),
  }
}

export type ApiDePainel = ReturnType<typeof criarApiDePainel>

/**
 * Alertas de uma loja, para o Farol da Operação.
 *
 * Exige `orders:read`, e não `reports:read` como o painel: o farol é
 * operacional, e o atendente precisa saber que há pedido atrasado na loja dele.
 */
export interface AlertasDaUnidade {
  atrasados: number
  /** Pedidos ainda ocupando a fila de trabalho — os mesmos estados do quadro. */
  emAberto: number
  canceladosDuasHoras: number
  itensPausados: number
  /**
   * Se a loja está recebendo pedido agora — distinto de `active`, que só diz
   * que a unidade existe no cadastro.
   */
  estado: EstadoDaLoja
  /** ISO do fim da pausa, só quando `estado === 'pausada'`. */
  pausadaAte: string | null
}

export type EstadoDaLoja = 'aberta' | 'pausada' | 'fechada'

/** O que a loja devolve depois de abrir, fechar ou pausar. */
export interface OperacaoDaLoja {
  estado: EstadoDaLoja
  pausadaAte: string | null
}

export function criarApiDeAlertas(cliente: ApiClient) {
  return {
    daUnidade: (unityId: number, signal?: AbortSignal) =>
      cliente.requisitar<AlertasDaUnidade>(`/stores/${unityId}/alerts`, { signal }),

    /**
     * Abre, fecha ou pausa a loja.
     *
     * Envio parcial: mandar só `pausedUntil` não mexe em abrir/fechar, que é
     * outra permissão. `pausedUntil: null` cancela a pausa sem reabrir uma
     * loja que estava fechada.
     */
    definirOperacao: (
      unityId: number,
      mudanca: { acceptingOrders?: boolean; pausedUntil?: string | null }
    ) =>
      cliente.requisitar<OperacaoDaLoja>(`/stores/${unityId}/operacao`, {
        metodo: 'PATCH',
        corpo: mudanca,
      }),
  }
}
