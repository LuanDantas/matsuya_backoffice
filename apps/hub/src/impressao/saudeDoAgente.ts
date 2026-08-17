import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '../app/config'

/**
 * A saúde real do agente local, perguntada a ele.
 *
 * ## O defeito que isto corrige
 *
 * Até aqui a tela de Ajustes dizia "Agente local: **Ativo**" com base em
 * `temAgente`, que é literalmente `Boolean(urlDoAgente)` — ou seja, o selo
 * ficava verde só porque havia uma URL escrita no `config.json`. Com o agente
 * desligado, com o PC do balcão reiniciando ou com o serviço morto, a tela
 * continuava dizendo que estava tudo certo, e o operador só descobria pela
 * comanda que não saiu.
 *
 * Um indicador que não pode ficar vermelho não é um indicador; é decoração que
 * ensina a confiar no que não se verificou.
 *
 * ## Por que perguntar ao agente e não ao servidor
 *
 * O servidor sabe do heartbeat, que é a visão do Corporate e vale para
 * relatório. Mas o que interessa a **este balcão** é se *este* Hub alcança
 * *aquele* agente — e isso só o caminho da LAN responde. O agente pode estar
 * perfeito para o servidor e inalcançável do tablet, porque o Wi-Fi da loja
 * separou as duas redes.
 */

export type EstadoDoAgente = 'verificando' | 'ativo' | 'ausente' | 'nao_configurado'

export interface ImpressoraDoAgente {
  nome: string
  papel: string
  online: boolean
}

export interface SaudeDoAgente {
  estado: EstadoDoAgente
  impressoras: ImpressoraDoAgente[]
  pendentes: number
  falhas: number
  verificar: () => void
}

/**
 * Quantos problemas o cabeçalho anuncia.
 *
 * Comanda que falhou, comanda parada na fila e impressora sem resposta somam
 * no mesmo número: para quem está no balcão as três dão na mesma coisa — papel
 * que não vai sair —, e separá-las obrigaria o operador a interpretar antes de
 * agir.
 *
 * Agente sem resposta conta como **um** problema, e não como zero: é o pior
 * caso de todos, e é justamente o caso em que a lista de impressoras vem vazia
 * e a fila vem zerada, porque não houve a quem perguntar. Sem esta linha, o
 * indicador ficaria em branco exatamente quando mais precisa aparecer.
 */
export function contarProblemas(saude: {
  estado: EstadoDoAgente
  impressoras: ImpressoraDoAgente[]
  pendentes: number
  falhas: number
}): number {
  if (saude.estado === 'nao_configurado' || saude.estado === 'verificando') return 0
  if (saude.estado === 'ausente') return 1

  return (
    saude.falhas + saude.pendentes + saude.impressoras.filter((i) => !i.online).length
  )
}

/** De quanto em quanto tempo. Mesmo ritmo do heartbeat do agente. */
const INTERVALO_MS = 30_000

/**
 * O agente é local: 3 s é generoso. Esperar mais só faz a tela mentir por mais
 * tempo, dizendo "verificando" quando já dá para dizer "ausente".
 */
const TEMPO_LIMITE_MS = 3_000

export function useSaudeDoAgente(): SaudeDoAgente {
  const url = config.urlDoAgenteDeImpressao

  const [estado, definirEstado] = useState<EstadoDoAgente>(
    url ? 'verificando' : 'nao_configurado'
  )
  const [impressoras, definirImpressoras] = useState<ImpressoraDoAgente[]>([])
  const [pendentes, definirPendentes] = useState(0)
  const [falhas, definirFalhas] = useState(0)

  // Evita `setState` depois do desmonte, que é o aviso mais comum e mais inútil
  // do console em tela que faz polling.
  const vivo = useRef(true)

  const verificar = useCallback(async () => {
    if (!url) return definirEstado('nao_configurado')

    try {
      const resposta = await fetch(`${url}/saude`, {
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      })

      if (!resposta.ok) throw new Error(String(resposta.status))

      const corpo = (await resposta.json()) as {
        impressoras?: ImpressoraDoAgente[]
        pendentes?: number
        falhas?: number
      }

      if (!vivo.current) return

      definirEstado('ativo')
      definirImpressoras(corpo.impressoras ?? [])
      definirPendentes(corpo.pendentes ?? 0)
      definirFalhas(corpo.falhas ?? 0)
    } catch {
      if (!vivo.current) return

      /*
       * Zera a lista junto com o estado. Manter as impressoras da última
       * verificação mostraria "Cozinha: online" ao lado de "Agente: ausente" —
       * e quem lê acredita na linha mais específica.
       */
      definirEstado('ausente')
      definirImpressoras([])
    }
  }, [url])

  useEffect(() => {
    vivo.current = true
    void verificar()

    const relogio = setInterval(() => void verificar(), INTERVALO_MS)

    return () => {
      vivo.current = false
      clearInterval(relogio)
    }
  }, [verificar])

  return {
    estado,
    impressoras,
    pendentes,
    falhas,
    verificar: () => void verificar(),
  }
}
