import type { Mudanca } from '@matsuya/contracts'
import type { MensagemDoChat } from '@matsuya/api-client'

/**
 * A aritmética da conversa: ordem, mescla, eco e janela.
 *
 * Funções puras, num arquivo próprio, porque é aqui que moram os erros que não
 * levantam exceção — uma mensagem na posição errada, uma bolha duplicada, uma
 * mensagem engolida. Nenhum deles quebra a tela; todos fazem alguém ler a
 * conversa errada. É o tipo de coisa que precisa de teste em vez de conferência
 * a olho, e o `vitest` deste repositório roda em ambiente node, sem DOM — então
 * a lógica tem de sair do componente para poder ser testada.
 */

export interface MensagemLocal extends MensagemDoChat {
  /** Enviada localmente, ainda sem confirmação do servidor. */
  pendente?: boolean
  falhou?: boolean
}

/**
 * Id local, negativo e monotônico.
 *
 * Era `-Date.now()`, e isso tem dois defeitos. Dois envios no mesmo
 * milissegundo colidem — e o id agora é chave de dedupe, então colidir funde
 * duas mensagens distintas em uma. E, por ser um relógio negado, a mensagem
 * **mais nova** recebe o id **mais negativo**: ordenar crescente põe a última
 * primeiro. Um contador resolve o primeiro problema; o segundo é resolvido em
 * `ordenarMensagens`, que nunca ordena pendentes por id.
 */
let ultimoIdLocal = 0
export function proximoIdLocal(): number {
  ultimoIdLocal -= 1
  return ultimoIdLocal
}

/** Só para o teste conseguir partir do mesmo lugar duas vezes. */
export function reiniciarIdLocal(): void {
  ultimoIdLocal = 0
}

/**
 * Lê a mensagem de dentro de uma linha do diário.
 *
 * O `summary` é `Record<string, unknown>` no contrato — ou seja, o tipo não
 * promete nada sobre o conteúdo. Ele chega tanto do socket quanto da
 * recuperação HTTP, e nos dois casos é dado de rede. Validar aqui, e devolver
 * `null` no que não servir, é mais barato do que descobrir na renderização que
 * `body` era `undefined`.
 */
export function mensagemDaMudanca(mudanca: Mudanca): MensagemDoChat | null {
  if (mudanca.entityType !== 'chat_message') return null

  const bruto = mudanca.summary as Partial<MensagemDoChat> | null
  if (!bruto || typeof bruto !== 'object') return null

  if (typeof bruto.id !== 'number' || typeof bruto.body !== 'string') return null
  if (bruto.authorType !== 'staff' && bruto.authorType !== 'customer' && bruto.authorType !== 'system') {
    return null
  }

  return {
    id: bruto.id,
    orderId: typeof bruto.orderId === 'number' ? bruto.orderId : mudanca.entityId,
    authorType: bruto.authorType,
    authorUserId: typeof bruto.authorUserId === 'number' ? bruto.authorUserId : null,
    authorLabel: typeof bruto.authorLabel === 'string' ? bruto.authorLabel : null,
    body: bruto.body,
    hidden: bruto.hidden === true,
    readByStaff: bruto.readByStaff === true,
    createdAt: typeof bruto.createdAt === 'string' ? bruto.createdAt : mudanca.occurredAt,
  }
}

/**
 * Confirmadas por `id` crescente; pendentes no fim, na ordem em que foram
 * criadas.
 *
 * **Nunca por `createdAt`.** O carimbo da mensagem otimista vem do relógio do
 * tablet, e este código já documenta que ele erra por minutos — ordenar por ele
 * põe a mensagem que a pessoa acabou de digitar três minutos acima na conversa.
 *
 * **Nunca ordenando as pendentes por id.** Ver `proximoIdLocal`: entre duas
 * pendentes, a mais nova tem o id menor. A ordem de inserção é a ordem certa, e
 * o `sort` do JavaScript é estável, então basta não mexer nelas.
 */
export function ordenarMensagens(lista: readonly MensagemLocal[]): MensagemLocal[] {
  const confirmadas = lista.filter((m) => m.id > 0).sort((a, b) => a.id - b.id)
  const locais = lista.filter((m) => m.id <= 0)
  return [...confirmadas, ...locais]
}

/**
 * Insere ou substitui por `id`.
 *
 * Devolve a **mesma referência** quando nada muda. Não é economia de alocação:
 * o efeito de rolagem do componente depende de `[mensagens]`, e uma referência
 * nova a cada evento faria a tela reagir a uma mudança que não aconteceu.
 */
export function mesclarMensagem(
  lista: readonly MensagemLocal[],
  chegada: MensagemDoChat
): MensagemLocal[] {
  const indice = lista.findIndex((m) => m.id === chegada.id)

  if (indice >= 0) {
    const atual = lista[indice]!
    if (
      atual.body === chegada.body &&
      atual.readByStaff === chegada.readByStaff &&
      atual.hidden === chegada.hidden &&
      !atual.pendente &&
      !atual.falhou
    ) {
      return lista as MensagemLocal[]
    }

    const copia = [...lista]
    copia[indice] = chegada
    return ordenarMensagens(copia)
  }

  return ordenarMensagens([...lista, chegada])
}

export function removerMensagem(
  lista: readonly MensagemLocal[],
  id: number
): MensagemLocal[] {
  return lista.filter((m) => m.id !== id)
}

/** Janela em que um eco ainda pode ser o mesmo envio. */
const JANELA_DO_ECO_MS = 60_000

/**
 * Qual mensagem otimista este eco confirma — ou `null`.
 *
 * Quem envia recebe o próprio evento de volta pelo socket. Sem casá-lo com a
 * bolha que já está na tela, a mensagem aparece duas vezes.
 *
 * **A correlação é necessariamente heurística.** `POST /orders/:id/chat` aceita
 * só `{ body }` — não há chave de idempotência para o servidor devolver. Um
 * `clientMessageId` no contrato apagaria esta função inteira, e vale como
 * bilhete para quando a API puder mudar.
 *
 * Casa a pendente **mais antiga** de texto igual, do mesmo autor, dentro da
 * janela. Mais antiga primeiro é o que faz "ok" enviado duas vezes seguidas
 * casar na ordem certa.
 *
 * **Não** se deduplica por "descarte todo evento cujo autor sou eu": isso
 * engoliria as mensagens do mesmo usuário enviadas de um segundo tablet, e
 * login compartilhado entre o turno é a norma numa loja.
 */
export function casarOtimista(
  lista: readonly MensagemLocal[],
  chegada: MensagemDoChat,
  meuUserId: number | null,
  agora: number,
  janelaMs: number = JANELA_DO_ECO_MS
): number | null {
  if (chegada.authorType !== 'staff') return null
  if (meuUserId === null || chegada.authorUserId !== meuUserId) return null

  const corpo = chegada.body.trim()

  for (const m of lista) {
    if (m.id > 0 || !m.pendente) continue
    if (m.body.trim() !== corpo) continue
    if (agora - new Date(m.createdAt).getTime() > janelaMs) continue
    return m.id
  }

  return null
}

/**
 * O único ponto de entrada de mensagem nova, venha do socket ou do POST.
 *
 * Casa a otimista, remove-a, mescla a real. **Nunca um `filter` seco na
 * resolução do POST**: se o eco chegar antes da resposta HTTP — comum em rede
 * de tablet ruim —, a otimista já foi embora, e um `filter` sem mescla
 * descartaria a mensagem real. Mesclando, as duas ordens de chegada terminam
 * numa bolha só.
 *
 * E o casamento falso — dois operadores no mesmo login enviando o mesmo texto —
 * se cura sozinho: a resolução do POST traz a mensagem real com **outro** id, e
 * a mescla a insere. Duas bolhas reais, nada perdido.
 */
export function aplicarChegada(
  lista: readonly MensagemLocal[],
  chegada: MensagemDoChat,
  meuUserId: number | null,
  agora: number
): MensagemLocal[] {
  const idLocal = casarOtimista(lista, chegada, meuUserId, agora)
  const base = idLocal === null ? lista : removerMensagem(lista, idLocal)
  return mesclarMensagem(base, chegada)
}

export function marcarFalha(
  lista: readonly MensagemLocal[],
  idLocal: number
): MensagemLocal[] {
  return lista.map((m) =>
    m.id === idLocal ? { ...m, pendente: false, falhou: true } : m
  )
}

/** Quantas mensagens a tela desenha antes de pedir para ver mais. */
export const JANELA_INICIAL = 200

/**
 * As últimas `limite` mensagens visíveis, e quantas ficaram para trás.
 *
 * `GET /orders/:id/chat` devolve a conversa inteira, sem paginação — e mudar a
 * API está fora deste trabalho. Medindo antes de reagir: uma mensagem serializada
 * dá ~250 B, então 200 delas são ~50 kB, ~7 kB comprimidos. **O fio não é o
 * problema.** O problema é o DOM: mil `article` reconstruídos a cada evento
 * recebido. Por isso a janela é de render, e não de rede.
 *
 * Ocultas saem aqui, mesmo que o servidor já as filtre. Custa nada, e ocultar
 * não gera linha no diário — ou seja, nenhum transporte entrega um "isto foi
 * ocultado" a quem já está com a conversa aberta.
 */
export function janelaDeMensagens(
  lista: readonly MensagemLocal[],
  limite: number = JANELA_INICIAL
): { visiveis: MensagemLocal[]; restantes: number } {
  const visiveisTotais = lista.filter((m) => !m.hidden)
  if (visiveisTotais.length <= limite) {
    return { visiveis: visiveisTotais, restantes: 0 }
  }

  return {
    visiveis: visiveisTotais.slice(-limite),
    restantes: visiveisTotais.length - limite,
  }
}

export interface GrupoDoDia {
  /** `YYYY-MM-DD` no fuso local — a chave, não o rótulo. */
  dia: string
  mensagens: MensagemLocal[]
}

/**
 * Parte a conversa em dias.
 *
 * A chave é local, e não UTC: às 21h de São Paulo o dia UTC já virou, e um
 * separador "Hoje" aparecendo no meio da tarde é a definição de confuso.
 */
export function agruparPorDia(lista: readonly MensagemLocal[]): GrupoDoDia[] {
  const grupos: GrupoDoDia[] = []

  for (const mensagem of lista) {
    const d = new Date(mensagem.createdAt)
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`

    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.dia === dia) ultimo.mensagens.push(mensagem)
    else grupos.push({ dia, mensagens: [mensagem] })
  }

  return grupos
}

/**
 * Agrupa mensagens seguidas do mesmo autor.
 *
 * É o que separa uma conversa de um log: hoje cada bolha carrega o próprio
 * rodapé com horário, e três respostas seguidas viram três carimbos iguais
 * empilhados. Um por grupo basta.
 *
 * Uma pendente nunca entra no grupo de uma confirmada — o estado dela é
 * diferente e ela precisa poder falhar sozinha, com o próprio botão de
 * reenviar.
 */
export function agruparPorAutor(lista: readonly MensagemLocal[]): MensagemLocal[][] {
  const grupos: MensagemLocal[][] = []

  for (const mensagem of lista) {
    const ultimo = grupos[grupos.length - 1]
    const anterior = ultimo?.[ultimo.length - 1]

    const mesmoAutor =
      anterior !== undefined &&
      anterior.authorType === mensagem.authorType &&
      anterior.authorUserId === mensagem.authorUserId &&
      // `system` nunca agrupa: cada aviso automático é um fato próprio.
      mensagem.authorType !== 'system' &&
      !anterior.pendente === !mensagem.pendente &&
      !anterior.falhou === !mensagem.falhou

    if (mesmoAutor) ultimo!.push(mensagem)
    else grupos.push([mensagem])
  }

  return grupos
}

/**
 * O `upToId` de `marcarLidas` — a última mensagem **do cliente**.
 *
 * Só mensagem de cliente conta porque é só ela que o servidor considera não
 * lida. Mandar o id de uma mensagem nossa marcaria um intervalo que não é nosso
 * para marcar.
 */
export function ultimaDoCliente(lista: readonly MensagemLocal[]): number | null {
  let ultima: number | null = null
  for (const m of lista) {
    if (m.id > 0 && m.authorType === 'customer') ultima = m.id
  }
  return ultima
}

/**
 * Mantém em memória só as conversas abertas recentemente.
 *
 * Um turno de dez horas passa por dezenas de pedidos; sem poda, toda conversa
 * aberta fica na memória da aba até alguém recarregar. `protegido` é a conversa
 * aberta agora, que nunca pode ser podada por baixo de quem está lendo.
 */
export function podarThreads<T extends { tocadaEm: number }>(
  threads: ReadonlyMap<number, T>,
  limite: number,
  protegido?: number
): Map<number, T> {
  if (threads.size <= limite) return new Map(threads)

  const ordenadas = [...threads.entries()].sort((a, b) => b[1].tocadaEm - a[1].tocadaEm)
  const mantidas = new Map<number, T>()

  for (const [id, valor] of ordenadas) {
    if (mantidas.size < limite || id === protegido) mantidas.set(id, valor)
  }

  return mantidas
}
