import { io, type Socket } from 'socket.io-client'
import { Sincronizador, type EstadoDeSincronia } from '@matsuya/realtime'
import type { Mudanca, RespostaDeMudancas } from '@matsuya/contracts'

/**
 * Liga o socket ao sincronizador de cursor.
 *
 * A divisão de trabalho: o socket entrega evento rápido, o sincronizador
 * garante que nenhum se perca. Se o socket cair inteiro, o modo degradado
 * assume — o Hub passa a perguntar por HTTP a cada 10 s e continua operando,
 * com uma faixa avisando que está atrasado.
 *
 * É por isso que a loja pode continuar trabalhando com a internet ruim: a
 * degradação é de latência, não de correção.
 */

export type EstadoDaConexao = 'conectando' | 'ao-vivo' | 'degradado' | 'desconectado'

export interface OpcoesDaConexao {
  urlDoSocket: string
  unityId: number
  obterToken: () => string | null
  buscarMudancas: (params: {
    unityId: number
    since: number
    limit: number
  }) => Promise<RespostaDeMudancas>
  aplicar: (mudanca: Mudanca) => void
  aoExigirRecarga: () => void
  aoMudarEstado: (estado: EstadoDaConexao) => void
  aoMudarSincronia?: (estado: EstadoDeSincronia) => void
}

const INTERVALO_DO_HEARTBEAT = 15_000
const INTERVALO_DEGRADADO = 10_000
/** Tempo sem socket antes de assumir o modo degradado. */
const CARENCIA_ATE_DEGRADAR = 30_000

export class Conexao {
  private socket: Socket | null = null
  private readonly sincronizador: Sincronizador
  private temporizadorDeHeartbeat: ReturnType<typeof setInterval> | null = null
  private temporizadorDegradado: ReturnType<typeof setInterval> | null = null
  private temporizadorDeCarencia: ReturnType<typeof setTimeout> | null = null
  private estado: EstadoDaConexao = 'conectando'

  /**
   * Diferença entre o relógio do servidor e o do tablet, em milissegundos.
   *
   * Os cronômetros de SLA são calculados contra isto, e não contra
   * `Date.now()`: o relógio de um tablet de loja erra por minutos, e um
   * cronômetro de SLA errado é pior do que cronômetro nenhum — ele faz o
   * operador confiar num número falso.
   */
  private desvioDeRelogio = 0

  constructor(private readonly opcoes: OpcoesDaConexao) {
    this.sincronizador = new Sincronizador({
      unityId: opcoes.unityId,
      buscarMudancas: opcoes.buscarMudancas,
      aplicar: opcoes.aplicar,
      aoExigirRecarga: opcoes.aoExigirRecarga,
      aoMudarEstado: (e) => opcoes.aoMudarSincronia?.(e),
    })
  }

  get cursor(): number {
    return this.sincronizador.cursorAtual
  }

  /** Agora segundo o servidor. Base de todo cronômetro exibido no quadro. */
  agora(): number {
    return Date.now() + this.desvioDeRelogio
  }

  iniciarEm(cursor: number) {
    this.sincronizador.iniciarEm(cursor)
  }

  conectar() {
    const token = this.opcoes.obterToken()
    if (!token) return

    this.mudarEstado('conectando')

    this.socket = io(`${this.opcoes.urlDoSocket}/ops`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    })

    this.socket.on('connect', () => {
      this.cancelarCarencia()
      this.pararModoDegradado()
      this.assinar()
    })

    this.socket.on('order.status_changed', (evento: unknown) => {
      this.sincronizador.aoReceberEvento(evento)
    })

    this.socket.on('disconnect', () => {
      this.mudarEstado('desconectado')
      this.pararHeartbeat()
      // Não degrada na hora: a maioria das quedas se resolve em segundos, e
      // piscar "modo degradado" a cada oscilação ensina o operador a ignorar
      // o aviso — justamente quando ele passa a importar.
      this.agendarCarencia()
    })

    this.socket.on('connect_error', () => {
      this.mudarEstado('desconectado')
      this.agendarCarencia()
    })
  }

  private assinar() {
    this.socket?.emit(
      'subscribe',
      { storeId: this.opcoes.unityId, channels: ['orders'] },
      (resposta: { ok?: boolean; cursor?: number; error?: string }) => {
        if (!resposta?.ok) {
          // Escopo ou permissão negados: reconectar não resolve, e insistir só
          // gera ruído. O modo degradado também não vai funcionar, porque o
          // HTTP responderia o mesmo 403.
          this.mudarEstado('desconectado')
          return
        }

        this.mudarEstado('ao-vivo')

        // Cursor do servidor no momento da assinatura. Se estiver à frente do
        // nosso, perdemos eventos enquanto estávamos fora — e é exatamente
        // aqui que a reconexão recupera o que passou.
        if (typeof resposta.cursor === 'number') {
          this.sincronizador.aoReceberHeartbeat(resposta.cursor)
        }

        this.iniciarHeartbeat()
      }
    )
  }

  private iniciarHeartbeat() {
    this.pararHeartbeat()
    this.temporizadorDeHeartbeat = setInterval(() => {
      const enviadoEm = Date.now()
      this.socket?.emit(
        'ops:heartbeat',
        { storeId: this.opcoes.unityId, cursor: this.sincronizador.cursorAtual },
        (resposta: { serverCursor: number | null; serverTime: string }) => {
          if (!resposta) return

          // Metade da ida e volta é uma aproximação boa o bastante do atraso
          // de rede; o erro residual é de dezenas de milissegundos, contra
          // minutos de desvio do relógio do tablet.
          const meiaViagem = (Date.now() - enviadoEm) / 2
          this.desvioDeRelogio =
            new Date(resposta.serverTime).getTime() + meiaViagem - Date.now()

          this.sincronizador.aoReceberHeartbeat(resposta.serverCursor)
        }
      )
    }, INTERVALO_DO_HEARTBEAT)
  }

  private agendarCarencia() {
    if (this.temporizadorDeCarencia) return
    this.temporizadorDeCarencia = setTimeout(() => {
      this.temporizadorDeCarencia = null
      this.iniciarModoDegradado()
    }, CARENCIA_ATE_DEGRADAR)
  }

  private cancelarCarencia() {
    if (!this.temporizadorDeCarencia) return
    clearTimeout(this.temporizadorDeCarencia)
    this.temporizadorDeCarencia = null
  }

  private iniciarModoDegradado() {
    if (this.temporizadorDegradado) return
    this.mudarEstado('degradado')
    void this.sincronizador.recuperar()
    this.temporizadorDegradado = setInterval(() => {
      void this.sincronizador.recuperar()
    }, INTERVALO_DEGRADADO)
  }

  private pararModoDegradado() {
    if (!this.temporizadorDegradado) return
    clearInterval(this.temporizadorDegradado)
    this.temporizadorDegradado = null
  }

  private pararHeartbeat() {
    if (!this.temporizadorDeHeartbeat) return
    clearInterval(this.temporizadorDeHeartbeat)
    this.temporizadorDeHeartbeat = null
  }

  private mudarEstado(estado: EstadoDaConexao) {
    if (this.estado === estado) return
    this.estado = estado
    this.opcoes.aoMudarEstado(estado)
  }

  desconectar() {
    this.cancelarCarencia()
    this.pararHeartbeat()
    this.pararModoDegradado()
    this.socket?.disconnect()
    this.socket = null
  }
}
