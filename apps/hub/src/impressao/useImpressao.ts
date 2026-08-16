import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Impressora, type DadosDaComanda, type TrabalhoDeImpressao } from '@matsuya/printing'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { config } from '../app/config'

/**
 * Impressão da comanda a partir de um pedido do quadro.
 *
 * Imprime **no aceite**, automaticamente. É o momento certo: antes disso o
 * pedido pode ser recusado, e imprimir comanda de pedido recusado é papel
 * jogado fora e cozinha começando o que não devia. Depois disso é atraso puro.
 *
 * Cada pedido imprime uma vez. Um `Set` guarda o que já saiu, porque o mesmo
 * pedido volta pelo socket a cada mudança de estado e a cozinha não precisa de
 * cinco vias do mesmo papel.
 */
export function useImpressao(nomeDaUnidade: string) {
  const [fila, definirFila] = useState<TrabalhoDeImpressao[]>([])
  const jaImpressos = useRef(new Set<number>())

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
        })),
        observacaoDoPedido: pedido.notes ?? null,
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

  /** Chamada quando um pedido entra em `confirmed`. Idempotente por pedido. */
  const imprimirNoAceite = useCallback(
    (pedido: PedidoDoQuadro) => {
      if (jaImpressos.current.has(pedido.id)) return
      jaImpressos.current.add(pedido.id)
      void impressora.imprimir(montarDados(pedido))
    },
    [impressora, montarDados]
  )

  const reimprimir = useCallback(
    (pedido: PedidoDoQuadro) => impressora.reimprimir(montarDados(pedido, true)),
    [impressora, montarDados]
  )

  return {
    fila,
    temAgente: impressora.temAgente,
    imprimirNoAceite,
    reimprimir,
    tentarDeNovo: () => void impressora.drenar(),
    descartar: (id: string) => impressora.descartar(id),
  }
}
