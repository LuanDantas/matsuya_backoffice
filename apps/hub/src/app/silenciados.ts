import { useCallback, useEffect, useState } from 'react'

/**
 * Alertas dados por vistos, neste tablet.
 *
 * **Silenciar não resolve nada, e a interface não pode sugerir que resolve.**
 * Os alertas do farol são fatos derivados: três pedidos fora do prazo
 * continuam fora do prazo depois de silenciados. O que o silêncio registra é
 * outra coisa — "eu já vi, não me avise de novo por isso" — e existe porque um
 * aviso que não some vira ruído, e ruído é o que faz o próximo aviso, o que
 * importava, passar despercebido.
 *
 * Três decisões seguram o risco de alguém silenciar um problema e esquecê-lo:
 *
 * 1. **A assinatura carrega a contagem.** Silenciar "3 atrasados" não silencia
 *    "4 atrasados": se piorar, o alerta volta sozinho. É a diferença entre
 *    dispensar uma situação conhecida e desligar um sensor.
 *
 * 2. **Vence em quatro horas.** Um turno começa com o quadro limpo, e nada
 *    fica silenciado de ontem.
 *
 * 3. **Silenciado continua visível**, num grupo próprio dentro do painel, com
 *    como reativar. O farol para de gritar; ele não passa a mentir.
 *
 * Fica no tablet, como os alertas de impressão e conexão, e pelo mesmo motivo:
 * "eu vi" é afirmação de quem está na frente desta tela, não da loja.
 */

const CHAVE = 'matsuya.hub.farol-silenciados'

/** Depois disto o alerta volta a aparecer, tenha piorado ou não. */
const VALIDADE_MS = 4 * 60 * 60 * 1000

interface Silencio {
  /** Contagem no momento em que foi silenciado. Piorou ⇒ volta a aparecer. */
  contagem: number
  em: number
}

export type MapaDeSilencio = Record<string, Silencio>

/*
 * As quatro funções abaixo são puras e exportadas de propósito.
 *
 * A regra que segura o risco desta funcionalidade — "volta se piorar, vence em
 * quatro horas" — não pode depender de montar um componente para ser
 * verificada. Separadas do `useState` e do `localStorage`, elas são testáveis
 * sem DOM, que é o ambiente de teste deste pacote.
 */

/** `true` se o alerta foi visto e não piorou desde então. */
export function estaSilenciado(
  mapa: MapaDeSilencio,
  chave: string,
  contagem: number,
  agora: number
): boolean {
  const s = mapa[chave]
  if (!s) return false
  if (agora - s.em >= VALIDADE_MS) return false
  return contagem <= s.contagem
}

export function comSilencio(
  mapa: MapaDeSilencio,
  itens: ReadonlyArray<{ chave: string; contagem: number }>,
  agora: number
): MapaDeSilencio {
  const proximo = { ...mapa }
  for (const i of itens) proximo[i.chave] = { contagem: i.contagem, em: agora }
  return proximo
}

export function semSilencio(mapa: MapaDeSilencio, chave: string): MapaDeSilencio {
  const { [chave]: _, ...resto } = mapa
  void _
  return resto
}

export function semVencidos(mapa: MapaDeSilencio, agora: number): MapaDeSilencio {
  return Object.fromEntries(
    Object.entries(mapa).filter(([, s]) => agora - s.em < VALIDADE_MS)
  )
}

function ler(): MapaDeSilencio {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return {}

    // Limpa o vencido na leitura, e não num temporizador: o custo é o mesmo e
    // não há um relógio a mais para alguém esquecer de parar.
    return semVencidos(JSON.parse(cru) as MapaDeSilencio, Date.now())
  } catch {
    // Armazenamento corrompido ou indisponível (aba anônima com cota zerada).
    // Sem silêncio nenhum é o padrão seguro: mostra tudo.
    return {}
  }
}

export interface Silenciados {
  /** `true` se este alerta foi visto e não piorou desde então. */
  esta: (chave: string, contagem: number) => boolean
  silenciar: (chave: string, contagem: number) => void
  reativar: (chave: string) => void
  silenciarVarios: (itens: ReadonlyArray<{ chave: string; contagem: number }>) => void
  reativarTudo: () => void
  /** Quantos estão silenciados agora — alimenta o "ver N silenciados". */
  quantidade: number
}

export function useSilenciados(): Silenciados {
  const [mapa, definirMapa] = useState<MapaDeSilencio>(ler)

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(mapa))
    } catch {
      // Sem espaço ou sem permissão: o silêncio vale só para esta sessão. É
      // degradação aceitável — o alerta reaparecer não perde informação.
    }
  }, [mapa])

  const esta = useCallback(
    (chave: string, contagem: number) => estaSilenciado(mapa, chave, contagem, Date.now()),
    [mapa]
  )

  const silenciar = useCallback((chave: string, contagem: number) => {
    definirMapa((atual) => comSilencio(atual, [{ chave, contagem }], Date.now()))
  }, [])

  const silenciarVarios = useCallback(
    (itens: ReadonlyArray<{ chave: string; contagem: number }>) => {
      definirMapa((atual) => comSilencio(atual, itens, Date.now()))
    },
    []
  )

  const reativar = useCallback((chave: string) => {
    definirMapa((atual) => semSilencio(atual, chave))
  }, [])

  const reativarTudo = useCallback(() => definirMapa({}), [])

  return {
    esta,
    silenciar,
    reativar,
    silenciarVarios,
    reativarTudo,
    quantidade: Object.keys(mapa).length,
  }
}
