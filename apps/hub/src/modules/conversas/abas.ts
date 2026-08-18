import type { NomeDoIcone } from '@matsuya/ui'
import type { ListaDeConversas } from './lista'

/**
 * As duas abas da lista de conversas.
 *
 * ## O princípio que rege este arquivo
 *
 * **A lista só se move quando o operador manda.** Depois que ele escolheu uma
 * aba ou abriu uma conversa, nada na coluna esquerda muda de lugar sozinho.
 * Quando algo mudaria, a tela diz onde foi e dá um clique para ir.
 *
 * Isso é o oposto da política do "Em rota", e de propósito — ver `abaEfetiva`.
 */

export type Aba = 'aguardando' | 'emAberto'

export interface DescricaoDaAba {
  chave: Aba
  rotulo: string
  icone: NomeDoIcone
  explica: string
}

export const ABAS: readonly DescricaoDaAba[] = [
  {
    chave: 'aguardando',
    // Curto de propósito: com duas abas dividindo uma coluna de 380 px,
    // "Aguardando resposta" quebrava em duas linhas e dobrava a altura da
    // faixa. A explicação inteira mora no `title` e no estado vazio.
    rotulo: 'Aguardando',
    icone: 'balao',
    explica: 'O cliente escreveu e ninguém respondeu ainda.',
  },
  {
    chave: 'emAberto',
    rotulo: 'Em aberto',
    icone: 'sacola',
    explica: 'Pedidos em andamento — dá para puxar conversa sobre qualquer um.',
  },
]

export function outraAba(aba: Aba): Aba {
  return aba === 'aguardando' ? 'emAberto' : 'aguardando'
}

export interface Contagens {
  aguardando: number
  emAberto: number
}

export function contagens(lista: ListaDeConversas): Contagens {
  return { aguardando: lista.aguardando.length, emAberto: lista.emAberto.length }
}

/**
 * Onde a conversa selecionada está presa, e em que posição.
 *
 * Guardado no clique, quando se sabe de qual aba a linha veio e em que índice
 * ela estava — nenhuma das duas coisas dá para recuperar depois.
 */
export interface Fixacao {
  pedido: number
  aba: Aba
  indice: number
}

/**
 * Em que aba um pedido cai **agora**, pela régua de `montarListaDeConversas`.
 */
export function abaDaConversa(
  lista: ListaDeConversas,
  pedidoId: number | null
): Aba | null {
  if (pedidoId === null) return null
  if (lista.aguardando.some((l) => l.pedido.id === pedidoId)) return 'aguardando'
  if (lista.emAberto.some((l) => l.pedido.id === pedidoId)) return 'emAberto'
  return null
}

/**
 * Prende a conversa aberta na aba de onde ela foi aberta.
 *
 * ## O defeito que isto evita
 *
 * Abrir uma conversa de "Aguardando resposta" a marca como lida, a contagem
 * zera, e a linha passa a pertencer à outra aba — **sumindo debaixo de quem
 * está lendo**. Pior: a marcação dispara pelo *rolar* da thread, não pelo
 * clique, então some segundos depois, sem nenhuma ação causal visível.
 *
 * ## Por que o índice, e não só a aba
 *
 * Sem ele, a linha lida afunda para o fim da própria aba assim que é lida — as
 * vizinhas todas têm não-lidas e ela passa a ter zero. É a mesma doença numa
 * dose menor: a linha se move sem ninguém ter pedido.
 *
 * ## De brinde, o sentido inverso
 *
 * Conversa aberta em "Pedidos em aberto" que **recebe** mensagem saltaria para
 * "Aguardando" na cara de quem está lendo. Mesmo pino, mesmo conserto.
 *
 * Remove da aba natural e reinsere na presa — **nunca deixa nas duas**, que
 * duplicaria a linha e faria as contagens somarem mais do que existe.
 */
export function aplicarFixacao(
  lista: ListaDeConversas,
  fixacao: Fixacao | null
): ListaDeConversas {
  if (!fixacao) return lista

  const natural = abaDaConversa(lista, fixacao.pedido)
  // Fora das duas abas: o pedido saiu do quadro. Nada a prender.
  if (natural === null) return lista
  if (natural === fixacao.aba) return lista

  const linha = lista[natural].find((l) => l.pedido.id === fixacao.pedido)
  if (!linha) return lista

  const semELa = lista[natural].filter((l) => l.pedido.id !== fixacao.pedido)
  const alvo = [...lista[fixacao.aba]]
  // Grampeia: a aba de destino pode ter encolhido desde que o índice foi
  // guardado, e `splice` além do fim simplesmente acrescenta.
  alvo.splice(Math.min(fixacao.indice, alvo.length), 0, linha)

  return fixacao.aba === 'aguardando'
    ? { aguardando: alvo, emAberto: semELa }
    : { aguardando: semELa, emAberto: alvo }
}

/**
 * Qual aba está ativa de verdade.
 *
 * ## Sem queda para a outra aba — ao contrário do "Em rota"
 *
 * Aquela tela cai para a aba que tem conteúdo, e ali está certo: são duas filas
 * transitórias de peso parecido. **Aqui seria errado.** "Aguardando resposta" é
 * estruturalmente vazia hoje — nada no sistema cria mensagem de cliente —, então
 * a queda faria o clique na aba parecer não funcionar. E levaria embora
 * justamente o estado vazio que existe para explicar que o cliente **não pode**
 * escrever, e não que ele não escreve.
 *
 * Aba escolhida a dedo nunca é sobreposta, vazia ou não.
 *
 * ## Por que derivada a cada render, e não fixada na montagem
 *
 * `pedidos` chega vazio e é preenchido depois, pelo socket. Qualquer cálculo de
 * uma vez só resolveria sempre para "em aberto", e a regra de promover
 * "aguardando" nunca dispararia na prática.
 *
 * ## As contagens têm de vir da lista SEM busca
 *
 * Com as filtradas, digitar uma letra que zera a aba atual trocaria a aba no
 * meio da digitação. É o erro mais fácil de cometer aqui.
 */
export function abaEfetiva(
  escolhida: Aba | null,
  abaDaSelecionada: Aba | null,
  totais: Contagens
): Aba {
  // 1. A escolha explícita manda, sempre.
  if (escolhida) return escolhida

  // 2. A aba de quem está aberto. Cobre a entrada pelo drawer do pedido, em que
  //    a seleção chega de fora desta tela — sem isto, a conversa apareceria à
  //    direita sem nenhuma linha correspondente à esquerda.
  if (abaDaSelecionada) return abaDaSelecionada

  // 3. Quem espera resposta vem primeiro, quando existe.
  if (totais.aguardando > 0) return 'aguardando'

  return 'emAberto'
}

/**
 * A aba que a tecla alcança — ou `null` quando ela não navega.
 *
 * Separado do componente para o teclado poder ser testado: o `vitest` deste
 * repositório roda sem DOM, e um manipulador de tecla dentro do componente é
 * lógica que ninguém consegue cobrir.
 */
export function abaVizinha(atual: Aba, tecla: string): Aba | null {
  switch (tecla) {
    // Com duas abas, esquerda e direita fazem a mesma coisa — e é isso que dá a
    // volta de graça, que o padrão WAI-ARIA pede.
    case 'ArrowRight':
    case 'ArrowLeft':
      return outraAba(atual)
    case 'Home':
      return 'aguardando'
    case 'End':
      return 'emAberto'
    default:
      return null
  }
}
