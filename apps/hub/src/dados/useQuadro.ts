import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Mudanca } from '@matsuya/contracts'
import { criarApiDePedidos, type PedidoDoQuadro } from '@matsuya/api-client'
import { criarCliente } from './cliente'
import type { EstadoDeSincronia } from '@matsuya/realtime'
import { Conexao, type EstadoDaConexao } from './conexao'
import { config } from '../app/config'
import { PISO_DE_CARREGAMENTO_MS, espera } from './piso'

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


export function useQuadro(
  unityIds: number[],
  token: string | null,
  /**
   * Onde entregar as linhas de conversa que passam pelo diário.
   *
   * Chat entra na **mesma** sequência do quadro, então ele tem de passar por
   * este cursor — mas o estado dele não mora aqui: uma conversa sobrevive à
   * linha do pedido no quadro, e tem outro consumidor. Este parâmetro é só a
   * saída lateral; quem guarda é o `useConversas`.
   */
  aoMudarChat?: (mudanca: Mudanca) => void
): EstadoDoQuadro {
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

  /*
   * Em `ref`, e isto não é estilo.
   *
   * `aoMudarChat` vem de fora e muda de identidade a cada render de quem chama.
   * Pondo-o nas dependências de `aplicar` — que é dependência do efeito que
   * monta o socket —, o socket seria derrubado e refeito a cada render, e cada
   * remontagem refaz a busca do quadro inteiro. Um laço de reconexão que parece
   * rede instável e é, na verdade, esta linha.
   */
  const chatRef = useRef(aoMudarChat)
  chatRef.current = aoMudarChat

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
    // Conversa sai por aqui e não encosta no cache de pedidos. Sem este desvio
    // a linha cairia no caminho de baixo, onde `summary.status` não existe, e
    // seria descartada em silêncio — a mensagem simplesmente não chegaria.
    if (mudanca.entityType === 'chat_message') {
      chatRef.current?.(mudanca)
      return
    }

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
      /*
       * Assina conversas quando — e só quando — alguém está ouvindo.
       *
       * Um sinal só, em vez de um booleano à parte que poderia discordar do
       * sink. Quem monta a `Casca` só passa `aoMudarChat` se o operador tem
       * `chat:read`, então entrar na sala e ter onde entregar são a mesma
       * decisão. Assinar sem ouvinte encheria o cursor de linhas que ninguém
       * consome; ouvir sem assinar seria um sink mudo.
       */
      assinarChat: chatRef.current !== undefined,
      // Só a loja que pediu recarrega. Recarregar tudo por causa de uma
      // unidade jogaria fora o cursor das outras sem motivo.
      aoExigirRecarga: (unityId) => void carregarLoja(unityId),
      aoMudarOperacao: () => definirVersaoDasLojas((v) => v + 1),

      /*
       * Escreve a posição no pedido que já está em memória.
       *
       * Só mexe em `entrega.posicao` — nunca cria a entrega nem toca em estado,
       * nome ou ETA. Um ping é a única coisa que ele sabe; inventar o resto a
       * partir dele apagaria o que o evento de corrida trouxe.
       *
       * Pedido que não está no quadro é ignorado em silêncio: é entrega de
       * outra loja, ou de um pedido que já saiu da janela — e um ping não é
       * motivo para ir buscar nada.
       */
      aoMoverEntregador: (_unityId, orderId, posicao) => {
        definirPedidos((atuais) => {
          const i = atuais.findIndex((p) => p.id === orderId)
          if (i < 0 || !atuais[i]!.entrega) return atuais

          const proximo = [...atuais]
          proximo[i] = {
            ...atuais[i]!,
            entrega: { ...atuais[i]!.entrega!, posicao },
          }
          return proximo
        })
      },
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
