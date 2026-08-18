import type { PedidoDoQuadro } from '@matsuya/api-client'

/**
 * As duas seções da coluna da esquerda.
 *
 * ## Por que duas, e não uma caixa de entrada
 *
 * **"Aguardando resposta"** é o que precisa de você: alguém escreveu e ninguém
 * respondeu. **"Pedidos em aberto"** é a porta para puxar conversa sobre um
 * pedido que ainda não tem nenhuma — que é o que a loja faz quando liga para
 * avisar de um atraso. Uma caixa de entrada só com quem já tem mensagem
 * perderia essa porta, e ela é metade do uso.
 *
 * ## Por que a lista é montada aqui e não vem do servidor
 *
 * Não existe endpoint de conversas. `docs/12-api.md` descreve um
 * `GET /stores/:id/chat/threads` que **não foi implementado** e não está no
 * cliente. Então a lista é derivada dos pedidos que o quadro já trouxe, e o que
 * ela sabe sobre conversa vem do contador de não-lidas. É honesto e é o que dá
 * para fazer sem inventar API.
 */

export interface LinhaDeConversa {
  pedido: PedidoDoQuadro
  /** O nome da loja **do pedido** — ver a nota sobre multi-loja abaixo. */
  loja: string
  naoLidas: number
  /** Alguém escreveu aqui desde que esta aba olhou. Local, nunca uma contagem. */
  temNovidade: boolean
}

export interface ListaDeConversas {
  aguardando: LinhaDeConversa[]
  emAberto: LinhaDeConversa[]
}

/**
 * Ordem: quem espera há mais tempo primeiro, dentro do que tem mais a dizer.
 *
 * Não-lidas em ordem decrescente porque duas mensagens sem resposta são mais
 * urgentes que uma. Empate desce para novidade, e depois para o pedido mais
 * **antigo** — quem está esperando há mais tempo vem primeiro, que é o oposto
 * de uma linha do tempo de mensageiro e é o certo para uma fila de trabalho.
 */
export function ordenarConversas(linhas: readonly LinhaDeConversa[]): LinhaDeConversa[] {
  return [...linhas].sort((a, b) => {
    if (a.naoLidas !== b.naoLidas) return b.naoLidas - a.naoLidas
    if (a.temNovidade !== b.temNovidade) return a.temNovidade ? -1 : 1

    const tempoA = new Date(a.pedido.createdAt).getTime()
    const tempoB = new Date(b.pedido.createdAt).getTime()
    if (tempoA !== tempoB) return tempoA - tempoB

    // Desempate final estável: sem ele, dois pedidos criados no mesmo instante
    // trocariam de lugar entre renders e a lista tremeria sozinha.
    return a.pedido.id - b.pedido.id
  })
}

/**
 * Filtra por código ou cliente, **localmente**.
 *
 * Não há endpoint de busca, e não estamos inventando um: isto peneira o que já
 * está em memória. Sem acento e sem caixa, porque ninguém digita "Ana Paula
 * Sá" com o acento certo enquanto o telefone toca.
 */
export function filtrarConversas(
  linhas: readonly LinhaDeConversa[],
  busca: string
): LinhaDeConversa[] {
  const termo = normalizar(busca)
  if (termo === '') return [...linhas]

  return linhas.filter((linha) => {
    const codigo = normalizar(linha.pedido.code ?? String(linha.pedido.id))
    const cliente = normalizar(linha.pedido.customerLabel ?? '')
    return codigo.includes(termo) || cliente.includes(termo)
  })
}

function normalizar(texto: string): string {
  // Mesma forma do filtro do quadro (`Ferramentas.tsx:188`) — um segundo jeito
  // de tirar acento no mesmo aplicativo é como duas buscas passam a discordar.
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

/**
 * Monta as duas seções a partir do quadro.
 *
 * **Sobre todas as lojas selecionadas, e não só a de foco.** A tela usava
 * `unidadeFoco` para as não-lidas enquanto recebia os pedidos de todas as lojas
 * — então um pedido de outra loja **nunca** entrava em "Aguardando resposta",
 * mesmo com mensagem esperando. Era uma subcontagem invisível por construção.
 *
 * Conversas é fila de trabalho, como o quadro e as exceções, e não uma tela de
 * uma loja só como Início, Cardápio e Ajustes — onde somar não faria sentido.
 * Por isso cada linha carrega o nome da **própria** loja do pedido.
 */
export function montarListaDeConversas(
  pedidos: readonly PedidoDoQuadro[],
  naoLidasPorPedido: ReadonlyMap<number, number>,
  novidades: ReadonlySet<number>,
  nomesDasLojas: ReadonlyMap<number, string>
): ListaDeConversas {
  const aguardando: LinhaDeConversa[] = []
  const emAberto: LinhaDeConversa[] = []

  for (const pedido of pedidos) {
    const naoLidas = naoLidasPorPedido.get(pedido.id) ?? 0
    const linha: LinhaDeConversa = {
      pedido,
      loja: nomesDasLojas.get(pedido.unityId) ?? `Unidade ${pedido.unityId}`,
      naoLidas,
      temNovidade: novidades.has(pedido.id),
    }

    if (naoLidas > 0) aguardando.push(linha)
    else emAberto.push(linha)
  }

  return {
    aguardando: ordenarConversas(aguardando),
    emAberto: ordenarConversas(emAberto),
  }
}
