import { useEffect, useRef, useState } from 'react'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { alertas, type EstadoDoSom } from './alertas'

/**
 * Dispara o alerta sonoro quando o quadro muda.
 *
 * Duas regras que evitam o pior defeito possível num alarme de cozinha — o
 * operador aprender a ignorá-lo:
 *
 * - **Não toca no primeiro carregamento.** Abrir o Hub com oito pedidos na fila
 *   não é oito pedidos novos; é a fila que já existia.
 * - **Cada pedido soa uma vez só.** Um `Set` guarda o que já foi anunciado, por
 *   id e por motivo. Sem isso, um redesenho a cada segundo viraria um alarme
 *   contínuo, e a primeira coisa que a loja faria seria desligar o som.
 */
export function useAlertas(pedidos: PedidoDoQuadro[], habilitado: boolean) {
  const [estado, definirEstado] = useState<EstadoDoSom>(alertas.situacao)
  const jaAnunciados = useRef(new Set<string>())
  const primeiraCarga = useRef(true)

  useEffect(() => alertas.observar(definirEstado), [])

  useEffect(() => {
    if (!habilitado) return

    // O primeiro lote é o estado do mundo, não novidade.
    if (primeiraCarga.current) {
      if (pedidos.length > 0) {
        for (const pedido of pedidos) {
          jaAnunciados.current.add(`novo:${pedido.id}`)
          if (pedido.slaExpiredAt) jaAnunciados.current.add(`sla:${pedido.id}`)
        }
        primeiraCarga.current = false
      }
      return
    }

    let tocouNovo = false
    let tocouSla = false

    for (const pedido of pedidos) {
      const chaveNovo = `novo:${pedido.id}`
      if (pedido.status === 'pending' && !jaAnunciados.current.has(chaveNovo)) {
        jaAnunciados.current.add(chaveNovo)
        tocouNovo = true
      }

      const chaveSla = `sla:${pedido.id}`
      if (pedido.slaExpiredAt && !jaAnunciados.current.has(chaveSla)) {
        jaAnunciados.current.add(chaveSla)
        tocouSla = true
      }
    }

    // SLA vence pedido novo: se os dois acontecem no mesmo instante, o que
    // precisa de reação imediata é o atraso.
    if (tocouSla) alertas.tocar('sla-estourado')
    else if (tocouNovo) alertas.tocar('pedido-novo')
  }, [pedidos, habilitado])

  return {
    estado,
    destravar: () => alertas.destravar(),
    silenciar: () => alertas.silenciar(),
    religar: () => alertas.religar(),
    tocarErro: () => alertas.tocar('erro'),
  }
}
