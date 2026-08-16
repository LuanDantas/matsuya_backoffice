import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Impressora, type DadosDaComanda, type TrabalhoDeImpressao } from '@matsuya/printing'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { config } from '../app/config'

/**
 * Impressão da comanda.
 *
 * A comanda sai **no aceite**: antes disso o pedido ainda pode ser recusado, e
 * comanda de pedido recusado é papel jogado fora com a cozinha começando o que
 * não devia; depois disso é atraso puro.
 *
 * Duas regras que este hook existe para garantir, e que custaram um defeito
 * cada:
 *
 * 1. **O primeiro carregamento não imprime nada.** Abrir o Hub com seis
 *    pedidos já aceitos não são seis aceites — é a fila que já existia. Sem
 *    esta regra, cada recarga de aba, cada troca de unidade e cada retorno de
 *    tela disparava uma comanda por pedido em preparo. Foi o que aconteceu.
 *
 * 2. **Sem agente local, não há impressão automática.** A queda para o
 *    navegador abre um diálogo modal que trava a tela inteira até alguém
 *    clicar — e num balcão ninguém está olhando. Automatizar uma impressão que
 *    exige um clique não automatiza nada: só sequestra a tela. Com agente, a
 *    comanda sai sozinha e a regra faz sentido.
 *
 * A impressão manual, pelo botão do detalhe do pedido, continua sempre
 * disponível — inclusive sem agente. Ali existe alguém olhando e pedindo.
 */

type Automatismo = 'agente' | 'sempre' | 'nunca'

export function useImpressao(nomeDaUnidade: string) {
  const [fila, definirFila] = useState<TrabalhoDeImpressao[]>([])
  const jaImpressos = useRef(new Set<number>())
  const primeiraCarga = useRef(true)

  const impressora = useMemo(
    () =>
      new Impressora({
        urlDoAgente: config.urlDoAgenteDeImpressao,
        largura: config.larguraDoPapel,
        aoMudarFila: definirFila,
      }),
    []
  )

  useEffect(() => () => impressora.parar(), [impressora])

  const automatismo: Automatismo = config.impressaoAutomatica ?? 'agente'
  const automatica =
    automatismo === 'sempre' || (automatismo === 'agente' && impressora.temAgente)

  const montarDados = useCallback(
    (pedido: PedidoDoQuadro, reimpressao = false): DadosDaComanda => {
      const endereco = pedido.addressSnapshot as
        | { street?: string; number?: string; complement?: string; district?: string }
        | null

      return {
        code: pedido.code ?? `#${pedido.id}`,
        unidade: nomeDaUnidade,
        criadoEm: pedido.createdAt,
        deliveryType: pedido.deliveryType,
        itens: (pedido.items ?? []).map((item) => ({
          qty: item.qty,
          cancelledQty: item.cancelledQty,
          productName: item.productName,
          opcoes: (item.optionsSnapshot ?? []).map((o) => o.optionName),
        })),
        observacaoDoPedido: pedido.notes ?? null,
        cliente: pedido.customerLabel,
        endereco: endereco
          ? [
              [endereco.street, endereco.number].filter(Boolean).join(', '),
              endereco.complement,
              endereco.district,
            ]
              .filter(Boolean)
              .join(' — ')
          : null,
        subtotal: pedido.subtotal,
        taxaDeEntrega: pedido.deliveryFee,
        total: pedido.total,
        formaDePagamento: pedido.paymentMethod,
        pago: pedido.paymentStatus === 'paid',
        reimpressao,
      }
    },
    [nomeDaUnidade]
  )

  /**
   * Recebe o quadro inteiro e decide o que imprimir.
   *
   * A regra mora aqui, e não em quem chama: a tela não deve precisar saber que
   * o primeiro lote é diferente dos seguintes — foi justamente essa
   * distribuição de responsabilidade que deixou o defeito passar.
   */
  const sincronizar = useCallback(
    (pedidos: PedidoDoQuadro[]) => {
      /*
       * O primeiro lote é o estado do mundo, e só parte dele já imprimiu.
       *
       * Marcar TUDO como impresso seria trocar um defeito por outro pior:
       * um pedido que está aguardando aceite no momento em que o Hub abre
       * ficaria marcado, e a comanda não sairia quando o operador o
       * aceitasse — ninguém perceberia até a cozinha perguntar pelo papel.
       *
       * O critério é o fato, não o palpite: `acceptedAt` preenchido significa
       * que este pedido já passou pelo aceite, e portanto sua comanda já saiu
       * (ou já foi perdida) antes desta sessão.
       */
      if (primeiraCarga.current) {
        if (pedidos.length === 0) return
        for (const pedido of pedidos) {
          if (pedido.acceptedAt) jaImpressos.current.add(pedido.id)
        }
        primeiraCarga.current = false
        return
      }

      if (!automatica) return

      for (const pedido of pedidos) {
        if (pedido.status !== 'confirmed') continue
        if (jaImpressos.current.has(pedido.id)) continue

        jaImpressos.current.add(pedido.id)
        void impressora.imprimir(montarDados(pedido))
      }
    },
    [automatica, impressora, montarDados]
  )

  const reimprimir = useCallback(
    (pedido: PedidoDoQuadro) => impressora.reimprimir(montarDados(pedido, true)),
    [impressora, montarDados]
  )

  const tentarDeNovo = useCallback(() => void impressora.drenar(), [impressora])
  const descartar = useCallback((id: string) => impressora.descartar(id), [impressora])

  // Identidade estável: sem isto o objeto é novo a cada render, e o efeito que
  // o observa roda em todo redesenho — uma vez por segundo, por causa do
  // cronômetro.
  return useMemo(
    () => ({
      fila,
      temAgente: impressora.temAgente,
      automatica,
      sincronizar,
      reimprimir,
      tentarDeNovo,
      descartar,
    }),
    [fila, impressora.temAgente, automatica, sincronizar, reimprimir, tentarDeNovo, descartar]
  )
}
