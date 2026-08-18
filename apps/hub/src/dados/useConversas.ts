import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Mudanca } from '@matsuya/contracts'
import { criarApiDeChat, FalhaDaApi } from '@matsuya/api-client'
import { criarCliente } from './cliente'
import {
  aplicarChegada,
  marcarFalha,
  mensagemDaMudanca,
  mesclarMensagem,
  ordenarMensagens,
  podarThreads,
  proximoIdLocal,
  removerMensagem,
  type MensagemLocal,
} from './mensagens'
import { agregarNaoLidas, contarChegada, zerarPedido, type LeituraDeLoja } from './naoLidas'

/**
 * O estado das conversas: as threads abertas e o contador de não-lidas.
 *
 * ## Por que um hook próprio, e não dentro do `useQuadro`
 *
 * O `useQuadro` já tem 250 linhas e é dono do cache do quadro e do ciclo de
 * vida do socket. Conversa tem outro tempo de vida — ela sobrevive à linha do
 * pedido no quadro — e outro consumidor. Dobrando os dois, um defeito de chat
 * passa a poder derrubar o quadro, que é a tela de que a loja depende para
 * trabalhar.
 *
 * O socket, porém, é um só e nasce dentro do `useQuadro`. Por isso a costura é
 * o parâmetro `aoMudarChat` de lá: o cursor é compartilhado, o estado não.
 *
 * ## Sobre a contagem valer zero hoje
 *
 * `naoLidasPorPedido` segue a semântica do servidor: conta **só** mensagem de
 * cliente. Nada neste sistema cria mensagem de cliente ainda, então o número é
 * zero — e está certo que seja. Ver `naoLidas.ts` para por que não se resolve
 * isso contando outra coisa.
 */

/** Quantas conversas ficam em memória. Um turno passa por dezenas de pedidos. */
const LIMITE_DE_THREADS = 10

export interface ThreadEmCache {
  mensagens: MensagemLocal[]
  carregando: boolean
  erro: string | null
  /** Última abertura — base da poda. */
  tocadaEm: number
}

export interface EstadoDasConversas {
  threads: ReadonlyMap<number, ThreadEmCache>
  /** Semântica do servidor: só cliente. Alimenta as insígnias. */
  naoLidasPorPedido: ReadonlyMap<number, number>
  total: number
  /**
   * "Alguém escreveu aqui desde que olhei" — local, por aba.
   *
   * **Nunca vira contagem.** Somá-la às não-lidas faria a insígnia aparecer e
   * sumir sozinha na próxima releitura do servidor, e uma insígnia que mente
   * ensina o operador a ignorá-la para sempre.
   */
  novidades: ReadonlySet<number>
  lojasComFalha: number[]
  /** Entregue ao `useQuadro`; estável. */
  aoMudarChat: (mudanca: Mudanca) => void
  abrir: (orderId: number) => void
  fechar: (orderId: number) => void
  enviar: (orderId: number, corpo: string) => Promise<void>
  reenviar: (orderId: number, idLocal: number) => Promise<void>
  marcarLida: (orderId: number, upToId: number) => void
  revalidar: () => void
}

export function useConversas(
  unityIds: number[],
  token: string | null,
  meuUserId: number | null,
  habilitado: boolean
): EstadoDasConversas {
  const [threads, definirThreads] = useState<ReadonlyMap<number, ThreadEmCache>>(new Map())
  const [naoLidasPorPedido, definirNaoLidas] = useState<ReadonlyMap<number, number>>(new Map())
  const [novidades, definirNovidades] = useState<ReadonlySet<number>>(new Set())
  const [lojasComFalha, definirLojasComFalha] = useState<number[]>([])

  const tokenRef = useRef(token)
  tokenRef.current = token
  const meuIdRef = useRef(meuUserId)
  meuIdRef.current = meuUserId
  /** A conversa aberta agora — nunca podada por baixo de quem está lendo. */
  const abertaRef = useRef<number | null>(null)

  const api = useMemo(() => criarApiDeChat(criarCliente(() => tokenRef.current)), [])

  const chaveDasLojas = useMemo(
    () => [...unityIds].sort((a, b) => a - b).join(','),
    [unityIds]
  )

  // ── As não-lidas, somadas entre as lojas ────────────────────────────────
  const emCurso = useRef(false)

  const lerNaoLidas = useCallback(
    async (sinal?: AbortSignal) => {
      if (!habilitado || emCurso.current) return
      const lojas = chaveDasLojas.split(',').filter(Boolean).map(Number)
      if (lojas.length === 0) return

      emCurso.current = true
      try {
        // Mesmo desenho do farol: uma chamada por loja, e a falha de uma não
        // apaga as outras — nem vira zero, que é como uma insígnia passa a
        // dizer 3 quando são 8.
        const leituras: LeituraDeLoja[] = await Promise.all(
          lojas.map(async (unityId) => ({
            unityId,
            porPedido: await api
              .naoLidas(unityId, sinal)
              .then((r) => r.byOrder)
              .catch(() => null),
          }))
        )

        if (sinal?.aborted) return
        const agregado = agregarNaoLidas(leituras)
        definirNaoLidas(agregado.porPedido)
        definirLojasComFalha(agregado.lojasComFalha)
      } finally {
        emCurso.current = false
      }
    },
    [api, chaveDasLojas, habilitado]
  )

  useEffect(() => {
    if (!habilitado) {
      definirNaoLidas(new Map())
      definirLojasComFalha([])
      return
    }

    const controle = new AbortController()
    void lerNaoLidas(controle.signal)

    // O tablet dormiu e voltou. Sem isto, a contagem fica de quando a tela
    // apagou — e **sem `setInterval`**: N lojas a cada 30 s por tablet, para um
    // número que hoje é estruturalmente zero, é desperdício puro. O socket é o
    // caminho ao vivo.
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void lerNaoLidas()
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      controle.abort()
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [lerNaoLidas, habilitado])

  // Troca de seleção joga fora o que era de outra combinação de lojas.
  useEffect(() => {
    definirThreads(new Map())
    definirNovidades(new Set())
  }, [chaveDasLojas])

  // ── A chegada pelo socket ───────────────────────────────────────────────
  const aoMudarChat = useCallback((mudanca: Mudanca) => {
    const mensagem = mensagemDaMudanca(mudanca)
    // `summary` é `Record<string, unknown>` no contrato — o tipo não promete
    // nada, e isto veio da rede. Recusar aqui é mais barato do que descobrir na
    // renderização que `body` era `undefined`.
    if (!mensagem) return

    const orderId = mensagem.orderId

    definirThreads((atuais) => {
      const thread = atuais.get(orderId)
      // Sem thread em cache, não se inventa uma com uma mensagem só: ela
      // apareceria sem histórico e brigaria com o `GET` na abertura. Os
      // contadores abaixo já registram o que aconteceu.
      if (!thread) return atuais

      const proxima = new Map(atuais)
      proxima.set(orderId, {
        ...thread,
        mensagens: aplicarChegada(thread.mensagens, mensagem, meuIdRef.current, Date.now()),
      })
      return proxima
    })

    definirNaoLidas((atuais) => contarChegada(atuais, orderId, mensagem))

    // Novidade é sobre outra pessoa ter escrito. Marcar a si mesmo faria a
    // própria resposta acender um aviso de "tem coisa nova aqui".
    if (mensagem.authorUserId !== meuIdRef.current) {
      definirNovidades((atuais) => new Set(atuais).add(orderId))
    }
  }, [])

  // ── Abrir e fechar ──────────────────────────────────────────────────────
  const abrir = useCallback(
    (orderId: number) => {
      abertaRef.current = orderId

      definirNovidades((atuais) => {
        if (!atuais.has(orderId)) return atuais
        const proxima = new Set(atuais)
        proxima.delete(orderId)
        return proxima
      })

      definirThreads((atuais) => {
        const anterior = atuais.get(orderId)
        const proxima = podarThreads(atuais, LIMITE_DE_THREADS, orderId)
        proxima.set(orderId, {
          // Pinta o que já se tinha enquanto a busca corre, em vez de piscar
          // vazio — mas a busca acontece sempre.
          mensagens: anterior?.mensagens ?? [],
          carregando: true,
          erro: null,
          tocadaEm: Date.now(),
        })
        return proxima
      })

      /*
       * Rebusca **sempre**, mesmo com a conversa em cache.
       *
       * É a única forma de uma mensagem ocultada por outra pessoa sumir daqui:
       * ocultar não grava linha no diário, então nenhum transporte entrega esse
       * fato. Reabrir a conversa é a recuperação disponível, e é melhor dizer
       * isso do que fingir uma sincronia que não existe.
       */
      void api
        .listar(orderId)
        .then(({ messages }) => {
          definirThreads((atuais) => {
            const thread = atuais.get(orderId)
            if (!thread) return atuais

            // As pendentes locais sobrevivem à releitura: elas ainda não estão
            // no servidor, e descartá-las apagaria da tela algo que a pessoa
            // escreveu.
            const pendentes = thread.mensagens.filter((m) => m.id <= 0)
            const proxima = new Map(atuais)
            proxima.set(orderId, {
              ...thread,
              mensagens: ordenarMensagens([...messages, ...pendentes]),
              carregando: false,
              erro: null,
            })
            return proxima
          })
        })
        .catch((falha) => {
          definirThreads((atuais) => {
            const thread = atuais.get(orderId)
            if (!thread) return atuais
            const proxima = new Map(atuais)
            proxima.set(orderId, {
              ...thread,
              carregando: false,
              erro:
                falha instanceof FalhaDaApi
                  ? falha.message
                  : 'Não foi possível carregar a conversa.',
            })
            return proxima
          })
        })
    },
    [api]
  )

  const fechar = useCallback((orderId: number) => {
    if (abertaRef.current === orderId) abertaRef.current = null
  }, [])

  /**
   * Marca lidas até `upToId`.
   *
   * Chamado pelo componente, e não daqui, porque a condição é de rolagem: se a
   * pessoa está lendo o histórico mais acima, ela **não** leu a mensagem que
   * acabou de chegar, e marcar seria recibo falso.
   *
   * Só zera a contagem **depois** de o servidor responder. Zerar otimista faz a
   * insígnia voltar na próxima releitura sem ninguém entender por quê.
   */
  const marcarLida = useCallback(
    (orderId: number, upToId: number) => {
      api
        .marcarLidas(orderId, upToId)
        .then(() => definirNaoLidas((atuais) => zerarPedido(atuais, orderId)))
        .catch(() => {
          // Mantém a contagem. Ela é a única pista de que a marcação não pegou.
        })
    },
    [api]
  )

  // ── Enviar ──────────────────────────────────────────────────────────────
  const despachar = useCallback(
    async (orderId: number, conteudo: string, idLocal: number) => {
      try {
        const { message } = await api.enviar(orderId, conteudo)
        definirThreads((atuais) => {
          const thread = atuais.get(orderId)
          if (!thread) return atuais
          const proxima = new Map(atuais)
          proxima.set(orderId, {
            ...thread,
            /*
             * Remove a otimista **e mescla** a real — nunca só uma das duas.
             *
             * Se o eco do socket chegou antes desta resposta (comum em rede de
             * tablet ruim), a otimista já saiu e um `filter` seco jogaria a
             * mensagem real fora. Mesclando por id, as duas ordens de chegada
             * terminam numa bolha só.
             */
            mensagens: mesclarMensagem(removerMensagem(thread.mensagens, idLocal), message),
          })
          return proxima
        })
      } catch {
        definirThreads((atuais) => {
          const thread = atuais.get(orderId)
          if (!thread) return atuais
          const proxima = new Map(atuais)
          proxima.set(orderId, {
            ...thread,
            mensagens: marcarFalha(thread.mensagens, idLocal),
          })
          return proxima
        })
      }
    },
    [api]
  )

  const enviar = useCallback(
    async (orderId: number, corpo: string) => {
      const conteudo = corpo.trim()
      if (!conteudo) return

      const idLocal = proximoIdLocal()
      const provisoria: MensagemLocal = {
        id: idLocal,
        orderId,
        authorType: 'staff',
        authorUserId: meuIdRef.current,
        authorLabel: null,
        body: conteudo,
        hidden: false,
        readByStaff: true,
        createdAt: new Date().toISOString(),
        pendente: true,
      }

      definirThreads((atuais) => {
        const thread = atuais.get(orderId)
        if (!thread) return atuais
        const proxima = new Map(atuais)
        proxima.set(orderId, {
          ...thread,
          mensagens: ordenarMensagens([...thread.mensagens, provisoria]),
        })
        return proxima
      })

      await despachar(orderId, conteudo, idLocal)
    },
    [despachar]
  )

  const reenviar = useCallback(
    async (orderId: number, idLocal: number) => {
      let conteudo = ''

      definirThreads((atuais) => {
        const thread = atuais.get(orderId)
        if (!thread) return atuais
        const alvo = thread.mensagens.find((m) => m.id === idLocal)
        if (!alvo) return atuais
        conteudo = alvo.body

        const proxima = new Map(atuais)
        proxima.set(orderId, {
          ...thread,
          mensagens: thread.mensagens.map((m) =>
            m.id === idLocal ? { ...m, pendente: true, falhou: false } : m
          ),
        })
        return proxima
      })

      if (conteudo) await despachar(orderId, conteudo, idLocal)
    },
    [despachar]
  )

  const revalidar = useCallback(() => void lerNaoLidas(), [lerNaoLidas])

  return {
    threads,
    naoLidasPorPedido,
    total: useMemo(() => {
      let t = 0
      for (const n of naoLidasPorPedido.values()) t += n
      return t
    }, [naoLidasPorPedido]),
    novidades,
    lojasComFalha,
    aoMudarChat,
    abrir,
    fechar,
    enviar,
    reenviar,
    marcarLida,
    revalidar,
  }
}
