import { useEffect, useRef, useState } from 'react'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import type { SomDePedidoNovo, TipoDeAlerta } from './alertas'
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
    /*
     * Volume e chaves são lidos do singleton a cada render, e não guardados em
     * estado do React.
     *
     * O `observar` do `alertas` reanuncia a cada mudança de preferência — é ele
     * que provoca o render —, então ler aqui devolve sempre o valor corrente. Um
     * `useState` paralelo seria uma segunda cópia da verdade, e as duas
     * divergiriam no dia em que algo mudasse a preferência sem passar por esta
     * tela: o botão da barra do topo, por exemplo.
     */
    volume: alertas.volume,
    eventos: alertas.eventos,
    somDePedidoNovo: alertas.somDePedidoNovo,

    destravar: () => alertas.destravar(),
    silenciar: () => alertas.silenciar(),
    religar: () => alertas.religar(),
    definirVolume: (v: number) => alertas.definirVolume(v),
    definirEvento: (tipo: TipoDeAlerta, ligado: boolean) =>
      alertas.definirEvento(tipo, ligado),
    definirSomDePedidoNovo: (som: SomDePedidoNovo) => alertas.definirSomDePedidoNovo(som),

    tocarErro: () => alertas.tocar('erro'),
    /** Prévia dos ajustes: soa mesmo com o evento desligado — ver `tocar`. */
    ouvir: (tipo: TipoDeAlerta) => alertas.tocar(tipo, true),
  }
}
