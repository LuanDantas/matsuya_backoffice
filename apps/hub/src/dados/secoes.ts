import { ORDER_STATUSES, type OrderStatus } from '@matsuya/contracts'

/**
 * As colunas do quadro.
 *
 * Uma coluna deixou de ser um estado e passou a ser **um lugar da loja**. Seis
 * colunas — uma por estado — obrigavam o operador a varrer a tela para saber
 * onde estava o trabalho; a referência usa quatro, e cada uma responde a uma
 * pergunta de quem está de pé no balcão:
 *
 * - **Aceitar** — tem pedido esperando resposta?
 * - **Em preparo** — o que a cozinha está fazendo?
 * - **Pronto** — o que está esperando sair?
 * - **Em rota** — o que está na rua?
 * - **Finalizados** — o que fechou no turno?
 *
 * `Aceitar` é a única que **some quando está vazia**. As outras são lugares que
 * existem mesmo desocupados; aceitar é uma pendência, e uma coluna permanente
 * vazia dizendo "nada para aceitar" ocupa espaço para não informar nada.
 */

export type ChaveDaSecao = 'aceitar' | 'preparo' | 'pronto' | 'rota' | 'finalizados'

export interface SecaoDoQuadro {
  chave: ChaveDaSecao
  titulo: string
  tituloCurto: string
  status: ReadonlyArray<OrderStatus>
  vazio: string
  /** Some do quadro quando não há nenhum pedido nela. */
  someQuandoVazia?: boolean
  /**
   * Só entram os finalizados recentes. Sem recorte, a coluna cresce o turno
   * inteiro e empurra as outras para fora da tela.
   */
  janelaEmHoras?: number
}

export const SECOES: ReadonlyArray<SecaoDoQuadro> = [
  {
    chave: 'aceitar',
    titulo: 'Aceitar',
    tituloCurto: 'Aceitar',
    status: ['pending'],
    vazio: 'Nada esperando resposta.',
    someQuandoVazia: true,
  },
  {
    chave: 'preparo',
    titulo: 'Em preparo',
    tituloCurto: 'Preparo',
    status: ['confirmed', 'preparing'],
    vazio: 'A cozinha está livre.',
  },
  {
    chave: 'pronto',
    titulo: 'Pronto',
    tituloCurto: 'Pronto',
    status: ['ready'],
    vazio: 'Nada esperando no balcão.',
  },
  {
    chave: 'rota',
    titulo: 'Em rota',
    tituloCurto: 'Em rota',
    status: [
      'awaiting_courier',
      'out_for_delivery',
      'delivery_failed',
      'customer_not_found',
    ],
    vazio: 'Nada na rua.',
  },
  {
    chave: 'finalizados',
    titulo: 'Finalizados',
    tituloCurto: 'Fim',
    status: ['delivered', 'cancelled', 'rejected'],
    vazio: 'Nenhum pedido fechado nas últimas horas.',
    janelaEmHoras: 4,
  },
]

/**
 * Estados que o quadro **não** mostra em coluna nenhuma.
 *
 * `awaiting_payment` e `payment_failed` são do cliente e do provedor de
 * pagamento, não da loja: um pedido não pago nunca ocupa a fila da cozinha, e
 * mostrá-lo faria alguém começar a preparar algo que pode não existir.
 */
export const FORA_DO_QUADRO: ReadonlyArray<OrderStatus> = ORDER_STATUSES.filter(
  (status) => !SECOES.some((secao) => secao.status.includes(status))
)

/** A coluna de um status, ou `null` quando ele não aparece no quadro. */
export function secaoDoStatus(status: OrderStatus): SecaoDoQuadro | null {
  return SECOES.find((secao) => secao.status.includes(status)) ?? null
}
