import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Mudanca } from '@matsuya/contracts'
import { criarApiDePedidos, type PedidoDoQuadro } from '@matsuya/api-client'
import { criarCliente } from './cliente'
import type { EstadoDeSincronia } from '@matsuya/realtime'
import { Conexao, type EstadoDaConexao } from './conexao'
import { config } from '../app/config'

/**
 * O estado do quadro, de uma ou de várias lojas.
 *
 * Dois pontos que decidem o comportamento:
 *
 * **Evento de socket escreve direto no cache.** Invalidar traria a lista
 * inteira de volta a cada mudança de status — numa loja com movimento, uma
 * rajada de requisições no momento em que ela menos pode esperar por uma. O
 * `summary` que viaja no evento existe justamente para tornar essa escrita
 * possível.
 *
 * **Um cursor por loja.** `seq` é monotônico por unidade; um cursor
 * compartilhado veria buraco em toda mudança e pediria o intervalo a cada
 * evento. A `Conexao` mantém um sincronizador por loja sobre um socket só.
 */

export interface EstadoDoQuadro {
  pedidos: PedidoDoQuadro[]
  carregando: boolean
  erro: string | null
  conexao: EstadoDaConexao
  sincronia: EstadoDeSincronia
  /** Cursor por loja, para o diagnóstico em Ajustes. */
  cursores: ReadonlyMap<number, number>
  /**
   * Sobe a cada abertura, fechamento ou pausa de loja.
   *
   * O quadro não guarda o estado da loja — quem guarda é o farol, que já
   * consulta `/alerts` por unidade. Um contador é o suficiente para dizer a
   * ele "reconsulte", e evita duplicar aqui um dado que já tem dono.
   */
  versaoDasLojas: number
  agoraDoServidor: () => number
  recarregar: () => void
  /**
   * Completa um pedido que entrou no quadro pelo socket.
   *
   * Ver `completar` na implementação: é uma requisição por leitura, e só quando
   * a linha está incompleta.
   */
  completar: (id: number) => void
}

/**
 * Tempo mínimo com o quadro em estado de carregamento.
 *
 * O piso vale para o **indicador**, não para a busca: os pedidos são escritos
 * no cache assim que a resposta chega, e ficam prontos esperando a bandeira
 * cair. Sem ele, numa rede boa a resposta volta em 40 ms e o esqueleto vira um
 * tremor na tela — quem apertou "atualizar" não vê nada acontecer e aperta de
 * novo.
 *
 * Três segundos é escolha de produto, pedida para o carregamento ter presença.
 * Vale saber o que ela custa: é tempo em que o quadro mostra blocos cinzas
 * embora os dados já estejam em memória, e recarregar durante um pico atrasa
 * em três segundos a leitura de uma fila que mudou. Se um dia isso incomodar
 * no balcão, é este número que se mexe — nada mais depende dele.
 */
const PISO_DE_CARREGAMENTO_MS = 3000

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useQuadro(unityIds: number[], token: string | null): EstadoDoQuadro {
  const [pedidos, definirPedidos] = useState<PedidoDoQuadro[]>([])
  const [carregando, definirCarregando] = useState(true)
  const [erro, definirErro] = useState<string | null>(null)
  const [conexao, definirConexao] = useState<EstadoDaConexao>('conectando')
  const [sincronia, definirSincronia] = useState<EstadoDeSincronia>('inicial')
  const [cursores, definirCursores] = useState<ReadonlyMap<number, number>>(new Map())
  const [versaoDasLojas, definirVersaoDasLojas] = useState(0)

  const conexaoRef = useRef<Conexao | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  // A lista de ids muda de identidade a cada render; a chave estável evita
  // derrubar socket e cursores sem que a seleção tenha mudado de verdade.
  const chaveDasLojas = useMemo(
    () => [...unityIds].sort((a, b) => a - b).join(','),
    [unityIds]
  )
  const lojas = useMemo(
    () => chaveDasLojas.split(',').filter(Boolean).map(Number),
    [chaveDasLojas]
  )

  const api = useMemo(() => {
    return criarApiDePedidos(criarCliente(() => tokenRef.current))
  }, [])

  /**
   * Aplica uma mudança do diário no cache local.
   *
   * Pedido desconhecido é inserido — é assim que um pedido novo aparece no
   * quadro. Versão mais velha chegando depois é descartada: o socket não
   * garante ordem entre reconexões, e sobrescrever com o passado faria a tela
   * andar para trás.
   */
  const aplicar = useCallback((mudanca: Mudanca) => {
    const resumo = mudanca.summary as Partial<PedidoDoQuadro> | undefined
    if (!resumo || typeof resumo.status !== 'string') return

    definirPedidos((atuais) => {
      const indice = atuais.findIndex((p) => p.id === mudanca.entityId)

      if (indice === -1) {
        return [{ ...(resumo as PedidoDoQuadro), id: mudanca.entityId }, ...atuais]
      }

      const atualizado = { ...atuais[indice]!, ...resumo }
      if (atualizado.version < atuais[indice]!.version) return atuais

      const proximos = [...atuais]
      proximos[indice] = atualizado
      return proximos
    })
  }, [])

  const carregarLoja = useCallback(
    async (unityId: number) => {
      const quadro = await api.quadroDaLoja({ unityId })

      definirPedidos((atuais) => [
        // Troca só os pedidos desta loja; os das outras ficam onde estavam. Sem
        // isso, recarregar uma unidade limparia o quadro inteiro por um
        // instante, e o operador veria a fila sumir.
        ...atuais.filter((p) => p.unityId !== unityId),
        ...quadro.orders,
      ])

      definirCursores((atuais) => new Map(atuais).set(unityId, quadro.cursor))
      conexaoRef.current?.iniciarEm(unityId, quadro.cursor)
    },
    [api]
  )

  const carregarTudo = useCallback(async () => {
    definirCarregando(true)
    definirErro(null)

    const comecou = Date.now()

    try {
      await Promise.all(lojas.map(carregarLoja))
    } catch (falha) {
      definirErro(falha instanceof Error ? falha.message : 'Falha ao carregar o quadro.')
    } finally {
      // O piso é aplicado ao **indicador**, não à busca: os pedidos já foram
      // escritos no cache acima e serão pintados assim que a bandeira cair.
      const restante = PISO_DE_CARREGAMENTO_MS - (Date.now() - comecou)
      if (restante > 0) await espera(restante)
      definirCarregando(false)
    }
  }, [carregarLoja, lojas])

  useEffect(() => {
    if (!token || lojas.length === 0) return

    const conexao = new Conexao({
      urlDoSocket: config.socketUrl,
      unityIds: lojas,
      obterToken: () => tokenRef.current,
      buscarMudancas: (params) => api.mudancas(params),
      aplicar,
      // Só a loja que pediu recarrega. Recarregar tudo por causa de uma
      // unidade jogaria fora o cursor das outras sem motivo.
      aoExigirRecarga: (unityId) => void carregarLoja(unityId),
      aoMudarOperacao: () => definirVersaoDasLojas((v) => v + 1),
      aoMudarEstado: definirConexao,
      aoMudarSincronia: definirSincronia,
    })

    conexaoRef.current = conexao
    void carregarTudo().then(() => conexao.conectar())

    return () => {
      conexao.desconectar()
      conexaoRef.current = null
      // Limpa ao trocar a seleção: manter os pedidos da loja que saiu faria o
      // quadro mostrar uma unidade que ninguém está mais acompanhando.
      definirPedidos([])
      definirCursores(new Map())
    }
  }, [api, aplicar, carregarLoja, carregarTudo, token, lojas])

  /*
   * Completa uma linha que veio do socket.
   *
   * O resumo do evento é enxuto de propósito — sem itens e sem endereço —, e o
   * quadro insere a linha do jeito que ela chega quando o pedido é novo para o
   * cliente. O cartão vive bem assim; o painel de detalhe, não: ele mostrava
   * "itens não vieram neste carregamento" e endereço vazio.
   *
   * Recarregar o quadro para resolver seria a rajada que o resumo existe para
   * evitar. Uma busca por pedido, disparada quando o painel abre, custa uma
   * requisição por leitura — e nenhuma no caminho quente.
   *
   * A versão é conferida na volta: se um evento chegou enquanto a busca corria,
   * o que o socket trouxe é mais novo e vence.
   */
  const completar = useCallback(
    (id: number) => {
      void api
        .pedido(id)
        .then((completo) => {
          definirPedidos((atuais) =>
            atuais.map((p) =>
              p.id === id && completo.version >= p.version ? { ...p, ...completo } : p
            )
          )
        })
        // Silencioso de propósito: o painel já mostra o que tem, e um erro aqui
        // não impede ler o pedido nem agir sobre ele.
        .catch(() => {})
    },
    [api]
  )

  const agoraDoServidor = useCallback(() => conexaoRef.current?.agora() ?? Date.now(), [])

  return {
    pedidos,
    carregando,
    erro,
    conexao,
    sincronia,
    cursores,
    versaoDasLojas,
    agoraDoServidor,
    recarregar: () => void carregarTudo(),
    completar,
  }
}
