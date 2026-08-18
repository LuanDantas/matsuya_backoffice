import type { EstadoDaCorrida, PedidoDoQuadro } from '@matsuya/api-client'

/**
 * As duas metades da rua.
 *
 * A separação não é invenção desta tela: ela já está na máquina de corrida da
 * API (`modules/entregas/maquina.ts`), e a única coisa a fazer aqui é lê-la.
 *
 * | aba     | estados                          | o que está acontecendo        |
 * |---------|----------------------------------|-------------------------------|
 * | coleta  | `buscando`, `a_caminho`, `na_loja` | a comida ainda está na loja  |
 * | entrega | `em_rota`                        | saiu, indo ao cliente         |
 *
 * ## Por que pelo estado da corrida, e não pelo status do pedido
 *
 * A tela filtrava por status do **pedido**, e `awaiting_courier` cobre os três
 * estados de coleta de uma vez — "procurando alguém", "alguém vem vindo" e
 * "alguém está parado no balcão" viravam a mesma linha. São três situações com
 * três providências diferentes, e a máquina de corrida já as distingue.
 */

export type Aba = 'coleta' | 'entrega'

const DA_COLETA: ReadonlySet<EstadoDaCorrida> = new Set(['buscando', 'a_caminho', 'na_loja'])
const DA_ENTREGA: ReadonlySet<EstadoDaCorrida> = new Set(['em_rota'])

/**
 * A que aba um pedido pertence, se pertence a alguma.
 *
 * `entrega === null` é retirada no balcão ou pedido ainda não aceito: não há
 * corrida, e não há nada na rua para acompanhar. `undefined` significa que a
 * mensagem que trouxe este pedido não incluía a corrida — o resumo do socket é
 * enxuto de propósito —, e nesse caso também não dá para afirmar nada.
 *
 * As duas ausências saem da tela, mas por motivos diferentes, e vale não
 * confundi-las: a primeira é uma resposta, a segunda é a falta de uma.
 */
export function abaDoPedido(pedido: PedidoDoQuadro): Aba | null {
  const estado = pedido.entrega?.estado
  if (!estado) return null
  if (DA_COLETA.has(estado)) return 'coleta'
  if (DA_ENTREGA.has(estado)) return 'entrega'
  // `entregue` e `falhou` são fim de linha: não há nada a acompanhar na rua.
  return null
}

export function partirPorAba(pedidos: PedidoDoQuadro[]): Record<Aba, PedidoDoQuadro[]> {
  const saida: Record<Aba, PedidoDoQuadro[]> = { coleta: [], entrega: [] }
  for (const pedido of pedidos) {
    const aba = abaDoPedido(pedido)
    if (aba) saida[aba].push(pedido)
  }
  return saida
}

/**
 * Quanto do trecho já foi percorrido, entre 0 e 1.
 *
 * Serve para a barra de progresso de cada linha — a resposta visual para "está
 * chegando?" sem obrigar a ler o mapa. Calculada por tempo decorrido sobre
 * tempo previsto, que é o único insumo que existe: não há distância percorrida
 * nem rota, e não vale fingir que há.
 *
 * Satura em 1 em vez de passar: um entregador atrasado não está a 140% do
 * caminho, está atrasado — e é o cronômetro ao lado que diz isso.
 */
export function progressoDoTrecho(
  inicio: string | null,
  minutosPrevistos: number | null,
  agora: number
): number | null {
  if (!inicio || !minutosPrevistos || minutosPrevistos <= 0) return null

  const decorrido = agora - new Date(inicio).getTime()
  if (decorrido < 0) return 0

  return Math.min(1, decorrido / (minutosPrevistos * 60_000))
}

/**
 * Há quanto tempo a posição foi recebida, em minutos.
 *
 * Um pino desenhado a partir de um ping velho mente com a mesma confiança de um
 * recente. Quem desenha decide o que fazer com o número — esmaecer, rotular ou
 * sumir —, mas ninguém pode desenhar sem saber.
 */
export function idadeDaPosicao(em: string, agora: number): number {
  return Math.max(0, Math.floor((agora - new Date(em).getTime()) / 60_000))
}

/**
 * Acima disto, a posição deixa de ser desenhada.
 *
 * Cinco minutos é muito mais que o intervalo de ping. Um pino que sobrevive a
 * isso não está atrasado: a origem parou de publicar — o aparelho desligou, o
 * aplicativo fechou, a corrida terminou por outro caminho. Mostrar o último
 * ponto conhecido depois disso é afirmar que alguém está numa esquina onde não
 * está, e é dessa afirmação que sai a ligação errada para o cliente.
 */
export const POSICAO_VELHA_MINUTOS = 5
