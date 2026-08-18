import {
  envelopeDeEventoSchema,
  type EnvelopeDeEvento,
  type Mudanca,
  type RespostaDeMudancas,
} from '@matsuya/contracts'

/**
 * O sincronizador de cursor — a peça que faz o Gestor de Pedidos não perder pedido.
 *
 * A ideia inteira cabe numa frase: **o socket é uma otimização; a correção vem
 * do número de sequência.** Todo evento carrega um `seq` monotônico por
 * unidade, e o cliente compara com o que já tem:
 *
 *   seq === cursor + 1   → aplica, avança o cursor
 *   seq <= cursor        → duplicata, ignora
 *   seq > cursor + 1     → LACUNA: busca o intervalo por HTTP antes de aplicar
 *
 * Sem isso, um evento perdido é invisível: a tela simplesmente não mostra o
 * pedido, ninguém recebe erro, e a loja descobre pelo telefone do cliente
 * perguntando da comida. Com isso, o pior caso vira um atraso de alguns
 * segundos.
 *
 * Esta classe é **deliberadamente sem socket e sem HTTP**: recebe eventos por
 * `aoReceberEvento` e busca lacunas por uma função injetada. É o que a torna
 * testável sem subir servidor — e esta é a lógica do Hub que mais precisa de
 * teste.
 */

export type EstadoDeSincronia =
  | 'inicial'
  | 'sincronizado'
  /** Detectou lacuna e está buscando o intervalo. */
  | 'recuperando'
  /** O intervalo não pode ser completado: só recarga completa resolve. */
  | 'recarga-necessaria'

export interface BuscadorDeMudancas {
  (params: { unityId: number; since: number; limit: number }): Promise<RespostaDeMudancas>
}

export interface OpcoesDoSincronizador {
  unityId: number
  buscarMudancas: BuscadorDeMudancas
  /** Chamado para cada mudança, em ordem de `seq`, já sem duplicata. */
  aplicar: (mudanca: Mudanca) => void
  /** Chamado quando só recarga completa resolve. */
  aoExigirRecarga: () => void
  aoMudarEstado?: (estado: EstadoDeSincronia) => void
  limite?: number
  /** Teto de páginas por recuperação, para uma lacuna enorme não travar a aba. */
  maximoDePaginas?: number
}

const LIMITE_PADRAO = 200
const MAXIMO_DE_PAGINAS_PADRAO = 25

export class Sincronizador {
  private cursor = 0
  private estado: EstadoDeSincronia = 'inicial'
  private recuperando: Promise<void> | null = null

  /**
   * Eventos que chegaram à frente do cursor enquanto uma recuperação estava em
   * curso. Sem esta fila, um evento recebido durante a busca do intervalo seria
   * descartado — e a lacuna que ele abriria só apareceria no próximo evento,
   * ou nunca.
   */
  private pendentes = new Map<number, Mudanca>()

  constructor(private readonly opcoes: OpcoesDoSincronizador) {}

  get cursorAtual(): number {
    return this.cursor
  }

  get estadoAtual(): EstadoDeSincronia {
    return this.estado
  }

  private mudarEstado(estado: EstadoDeSincronia) {
    if (this.estado === estado) return
    this.estado = estado
    this.opcoes.aoMudarEstado?.(estado)
  }

  /**
   * Define o cursor a partir do snapshot inicial.
   *
   * O snapshot e o cursor vêm na **mesma** resposta da API justamente para que
   * não exista janela entre "li os pedidos" e "descobri onde estou".
   */
  iniciarEm(cursor: number) {
    this.cursor = cursor
    this.pendentes.clear()
    this.mudarEstado('sincronizado')
  }

  /**
   * Entrada de um evento vindo do socket.
   *
   * Devolve o que foi feito com ele, o que serve tanto para teste quanto para
   * o indicador de conexão da interface.
   */
  aoReceberEvento(bruto: unknown): 'aplicado' | 'duplicata' | 'lacuna' | 'invalido' {
    const analisado = envelopeDeEventoSchema.safeParse(bruto)
    if (!analisado.success) return 'invalido'

    const envelope = analisado.data
    if (envelope.unityId !== this.opcoes.unityId) return 'invalido'

    const mudanca = this.envelopeParaMudanca(envelope)

    if (envelope.seq <= this.cursor) return 'duplicata'

    if (envelope.seq === this.cursor + 1 && this.estado !== 'recuperando') {
      this.opcoes.aplicar(mudanca)
      this.cursor = envelope.seq
      this.drenarPendentes()
      return 'aplicado'
    }

    // Guarda o evento antes de sair buscando: quando o intervalo chegar, ele
    // pode já cobrir este `seq`, e aí a fila só descarta a duplicata.
    this.pendentes.set(envelope.seq, mudanca)
    void this.recuperar()
    return 'lacuna'
  }

  /** Reconexão, divergência no heartbeat, ou volta do modo degradado. */
  async recuperar(): Promise<void> {
    if (this.estado === 'recarga-necessaria') return
    // Uma recuperação por vez. Duas em paralelo aplicariam o mesmo intervalo
    // duas vezes e brigariam pelo cursor.
    if (this.recuperando) return this.recuperando

    this.mudarEstado('recuperando')
    this.recuperando = this.executarRecuperacao().finally(() => {
      this.recuperando = null
    })
    return this.recuperando
  }

  private async executarRecuperacao(): Promise<void> {
    const limite = this.opcoes.limite ?? LIMITE_PADRAO
    const maximoDePaginas = this.opcoes.maximoDePaginas ?? MAXIMO_DE_PAGINAS_PADRAO

    for (let pagina = 0; pagina < maximoDePaginas; pagina += 1) {
      const resposta = await this.opcoes.buscarMudancas({
        unityId: this.opcoes.unityId,
        since: this.cursor,
        limit: limite,
      })

      if (resposta.snapshotRequired) {
        this.pendentes.clear()
        this.mudarEstado('recarga-necessaria')
        this.opcoes.aoExigirRecarga()
        return
      }

      for (const mudanca of resposta.changes) {
        if (mudanca.seq <= this.cursor) continue
        this.opcoes.aplicar(mudanca)
        this.cursor = mudanca.seq
        this.pendentes.delete(mudanca.seq)
      }

      if (!resposta.hasMore) {
        this.mudarEstado('sincronizado')
        this.drenarPendentes()
        return
      }
    }

    // Estourou o teto de páginas: a lacuna é grande demais para recuperar
    // incrementalmente sem prender a interface. Recarregar é mais rápido e
    // mais honesto do que continuar paginando às cegas.
    this.pendentes.clear()
    this.mudarEstado('recarga-necessaria')
    this.opcoes.aoExigirRecarga()
  }

  /**
   * Consome os eventos guardados que agora encaixam em sequência.
   *
   * Se sobrar um `seq` à frente com buraco no meio, dispara nova recuperação —
   * é o caso de dois eventos perdidos com um recebido entre eles.
   */
  private drenarPendentes() {
    if (this.pendentes.size === 0) return

    let avancou = true
    while (avancou) {
      avancou = false
      const proximo = this.pendentes.get(this.cursor + 1)
      if (proximo) {
        this.opcoes.aplicar(proximo)
        this.pendentes.delete(this.cursor + 1)
        this.cursor += 1
        avancou = true
      }
    }

    for (const seq of this.pendentes.keys()) {
      if (seq <= this.cursor) this.pendentes.delete(seq)
    }

    if (this.pendentes.size > 0 && this.estado !== 'recuperando') {
      void this.recuperar()
    }
  }

  /**
   * Resposta do heartbeat.
   *
   * Detecta o caso mais traiçoeiro: o socket segue "conectado", nenhum erro
   * aconteceu, e mesmo assim eventos deixaram de chegar — proxy segurando uma
   * sessão morta, ou uma room perdida num deploy. Sem esta checagem, o Hub
   * ficaria parado exibindo dados velhos com um indicador verde.
   */
  aoReceberHeartbeat(serverCursor: number | null) {
    if (serverCursor === null) return
    if (serverCursor > this.cursor) void this.recuperar()
  }

  /**
   * Traduz o envelope do socket para a mesma forma que a recuperação HTTP
   * devolve.
   *
   * **É de propósito que as duas formas sejam idênticas.** A mesma mudança pode
   * chegar pelos dois caminhos — pelo socket, e de novo dentro de um intervalo
   * recuperado — e é a igualdade de forma que permite ao dedupe por `seq` tratar
   * as duas como uma. Se o socket produzisse um formato próprio, a duplicata
   * viraria uma segunda linha na tela em vez de um descarte.
   */
  private envelopeParaMudanca(envelope: EnvelopeDeEvento): Mudanca {
    /*
     * Chat entra na mesma sequência, e essa é a razão de ele estar aqui.
     *
     * Toda mensagem grava uma linha no diário da loja e consome um `seq` da
     * **mesma** sequência que o quadro usa. Enquanto o Hub não tratava
     * `chat.message_posted`, o cursor não avançava nela — e o próximo evento de
     * pedido chegava com `seq > cursor + 1`, ou seja, como lacuna. Cada mensagem
     * enviada numa loja custava a todo Hub conectado daquela loja uma
     * recuperação HTTP do quadro inteiro. Curava-se sozinho, que é exatamente
     * por que ninguém notou.
     *
     * O envelope de chat tem outra forma — `data: { orderId, message }`, sem
     * `version` e sem `summary` —, então o ramo é obrigatório: pelo caminho de
     * baixo ele viraria uma mudança de pedido com `version: 0` e `summary: {}`.
     */
    if (envelope.type === 'chat.message_posted') {
      const dados = (envelope.data ?? {}) as {
        orderId?: number
        message?: Record<string, unknown>
      }

      return {
        seq: envelope.seq,
        entityType: 'chat_message',
        // `entityId` é o **pedido**, não a mensagem: é assim que a linha do
        // diário grava, e é por pedido que uma conversa é endereçada.
        entityId: Number(dados.orderId ?? 0),
        op: 'created',
        // Mensagem não tem versão — ela nasce e não muda. O `1` é o mesmo valor
        // que a API grava no diário, e existe só para o formato fechar.
        version: 1,
        summary: dados.message ?? {},
        occurredAt: envelope.occurredAt,
      }
    }

    const dados = (envelope.data ?? {}) as {
      orderId?: number
      version?: number
      summary?: Record<string, unknown>
    }

    return {
      seq: envelope.seq,
      entityType: 'order',
      entityId: Number(dados.orderId ?? 0),
      op: 'updated',
      version: Number(dados.version ?? 0),
      summary: dados.summary ?? {},
      occurredAt: envelope.occurredAt,
    }
  }
}
