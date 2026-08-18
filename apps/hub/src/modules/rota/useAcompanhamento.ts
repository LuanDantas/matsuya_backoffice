import { useEffect, useRef, useState } from 'react'
import type { AcompanhamentoDaEntrega } from '@matsuya/api-client'

/**
 * Busca e mantém o acompanhamento de **uma** entrega.
 *
 * ## Por que sob demanda, e não pelo quadro
 *
 * O traçado tem algumas centenas de pontos. Ele não viaja no resumo do quadro
 * — que é gravado no diário a cada transição de cada entrega — porque isso
 * cobraria de todo mundo por um dado que interessa a quem clicou em
 * "Acompanhar" e está com a folha aberta.
 *
 * ## Por que reconsultar, e por que a cada dez segundos
 *
 * O que muda é onde o entregador está, e com ele quanto falta. A conta que
 * transforma posição em "faltam 800 m e 4 min" mora no servidor de propósito:
 * é geometria sobre o traçado, e uma segunda implementação aqui divergiria da
 * primeira sem ninguém perceber — a tela não erra alto, ela só mostra outro
 * número.
 *
 * Dez segundos porque o simulador publica posição a cada cinco, e o relógio da
 * tela cobre o intervalo sozinho: `chegaEm` é um instante, então a contagem
 * regressiva anda a cada segundo com o `agora` que a tela já tem, e a consulta
 * só a corrige contra a posição real. Reconsultar a cada segundo daria o mesmo
 * texto por doze vezes o tráfego.
 */

const INTERVALO_MS = 10_000

export interface EstadoDoAcompanhamento {
  dados: AcompanhamentoDaEntrega | null
  carregando: boolean
  erro: string | null
}

export function useAcompanhamento(
  orderId: number | null,
  buscar: (orderId: number, signal?: AbortSignal) => Promise<AcompanhamentoDaEntrega>
): EstadoDoAcompanhamento {
  const [estado, definirEstado] = useState<EstadoDoAcompanhamento>({
    dados: null,
    carregando: false,
    erro: null,
  })

  // A função vem do componente pai e muda de identidade a cada render dele.
  // Numa dependência de efeito isso remontaria o intervalo sem parar; numa ref
  // ela fica sempre atual sem participar do ciclo de vida.
  const buscarRef = useRef(buscar)
  buscarRef.current = buscar

  useEffect(() => {
    if (orderId === null) {
      definirEstado({ dados: null, carregando: false, erro: null })
      return
    }

    const controle = new AbortController()
    let vivo = true

    // Carregando só na **primeira** busca desta entrega. As reconsultas
    // acontecem por baixo: piscar o esqueleto a cada dez segundos faria a folha
    // parecer instável quando ela está apenas se mantendo em dia.
    definirEstado({ dados: null, carregando: true, erro: null })

    const consultar = async () => {
      try {
        const dados = await buscarRef.current(orderId, controle.signal)
        if (!vivo) return
        definirEstado({ dados, carregando: false, erro: null })
      } catch (erro) {
        if (!vivo || controle.signal.aborted) return
        definirEstado((anterior) => ({
          // Mantém o que já estava na tela. Numa reconsulta que falhou, apagar
          // a folha para mostrar um erro troca um dado de dez segundos atrás —
          // ainda útil — por nada.
          dados: anterior.dados,
          carregando: false,
          erro: anterior.dados
            ? null
            : erro instanceof Error
              ? erro.message
              : 'Não foi possível acompanhar esta entrega.',
        }))
      }
    }

    void consultar()
    const relogio = setInterval(() => void consultar(), INTERVALO_MS)

    return () => {
      vivo = false
      controle.abort()
      clearInterval(relogio)
    }
  }, [orderId])

  return estado
}
