import { io, type Socket } from 'socket.io-client'
import { Sincronizador, type EstadoDeSincronia } from '@matsuya/realtime'
import type { Mudanca, RespostaDeMudancas } from '@matsuya/contracts'
import { expirarSessao } from './cliente'

/**
 * Liga o socket aos sincronizadores de cursor.
 *
 * A divisão de trabalho: o socket entrega evento rápido, o sincronizador
 * garante que nenhum se perca. Se o socket cair inteiro, o modo degradado
 * assume — o Hub passa a perguntar por HTTP a cada 10 s e continua operando,
 * com uma faixa avisando que está atrasado.
 *
 * É por isso que a loja pode continuar trabalhando com a internet ruim: a
 * degradação é de latência, não de correção.
 *
 * **Um socket, N lojas.** O servidor entra numa sala por chamada de
 * `subscribe`, e um socket pode estar em várias — então acompanhar cinco lojas
 * custa uma conexão, não cinco. O que precisa ser por loja é o **cursor**:
 * `seq` é monotônico por unidade, e um cursor compartilhado veria buraco em
 * toda mudança. Daí um `Sincronizador` por loja, e o roteamento do evento pelo
 * `unityId` que ele carrega.
 */

export type EstadoDaConexao = 'conectando' | 'ao-vivo' | 'degradado' | 'desconectado'

export interface OpcoesDaConexao {
  urlDoSocket: string
  unityIds: number[]
  obterToken: () => string | null
  buscarMudancas: (params: {
    unityId: number
    since: number
    limit: number
  }) => Promise<RespostaDeMudancas>
  aplicar: (mudanca: Mudanca) => void
  /** Recebe a loja que precisa recarregar — só ela, não o quadro inteiro. */
  aoExigirRecarga: (unityId: number) => void
  /**
   * A loja abriu, fechou ou pausou.
   *
   * Fora do diário de propósito. O cursor existe para garantir que **nenhum
   * pedido se perca**, e paga por isso: toda mudança registrada consome um
   * `seq`, e um `seq` que o quadro descarta faz cada Hub enxergar lacuna e
   * pedir o intervalo por HTTP à toa. Loja fechada não tem essa exigência — se
   * o evento se perder, a próxima leitura de `/alerts` corrige em segundos, e
   * nenhum pedido depende do rótulo estar certo neste instante.
   */
  aoMudarOperacao?: (unityId: number) => void
  aoMudarEstado: (estado: EstadoDaConexao) => void
  aoMudarSincronia?: (estado: EstadoDeSincronia) => void
}

const INTERVALO_DO_HEARTBEAT = 15_000
const INTERVALO_DEGRADADO = 10_000
/** Tempo sem socket antes de assumir o modo degradado. */
const CARENCIA_ATE_DEGRADAR = 30_000

export class Conexao {
  private socket: Socket | null = null
  private readonly sincronizadores = new Map<number, Sincronizador>()
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
    for (const unityId of opcoes.unityIds) {
      this.sincronizadores.set(
        unityId,
        new Sincronizador({
          unityId,
          buscarMudancas: opcoes.buscarMudancas,
          aplicar: opcoes.aplicar,
          aoExigirRecarga: () => opcoes.aoExigirRecarga(unityId),
          aoMudarEstado: (e) => opcoes.aoMudarSincronia?.(e),
        })
      )
    }
  }

  /** Cursor de uma loja. Cada uma tem o seu, porque `seq` é por unidade. */
  cursorDe(unityId: number): number {
    return this.sincronizadores.get(unityId)?.cursorAtual ?? 0
  }

  /** Agora segundo o servidor. Base de todo cronômetro exibido no quadro. */
  agora(): number {
    return Date.now() + this.desvioDeRelogio
  }

  iniciarEm(unityId: number, cursor: number) {
    this.sincronizadores.get(unityId)?.iniciarEm(cursor)
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
      // Roteia pelo `unityId` do envelope. Entregar a todos os sincronizadores
      // funcionaria — cada um descarta o que não é dele —, mas esconderia um
      // evento de loja não assinada, que é sintoma de sala errada no servidor.
      const unityId = Number((evento as { unityId?: number } | null)?.unityId)
      this.sincronizadores.get(unityId)?.aoReceberEvento(evento)
    })

    /*
     * A corrida anda sem o status do pedido mudar — o entregador chega na loja
     * e o pedido segue em `ready`. Evento próprio por isso, e roteado para o
     * mesmo sincronizador: ele carrega `seq` como os outros, então a detecção
     * de lacuna continua valendo e o cursor não fica para trás.
     */
    this.socket.on('order.delivery_changed', (evento: unknown) => {
      const unityId = Number((evento as { unityId?: number } | null)?.unityId)
      this.sincronizadores.get(unityId)?.aoReceberEvento(evento)
    })

    this.socket.on('store.operation_changed', (evento: unknown) => {
      const unityId = Number((evento as { unityId?: number } | null)?.unityId)
      if (Number.isInteger(unityId)) this.opcoes.aoMudarOperacao?.(unityId)
    })

    this.socket.on('disconnect', () => {
      this.mudarEstado('desconectado')
      this.pararHeartbeat()
      // Não degrada na hora: a maioria das quedas se resolve em segundos, e
      // piscar "modo degradado" a cada oscilação ensina o operador a ignorar
      // o aviso — justamente quando ele passa a importar.
      this.agendarCarencia()
    })

    this.socket.on('connect_error', (erro: Error) => {
      /*
       * Token recusado é outra coisa que rede ruim, e tratá-los igual é o que
       * fazia o Hub reconectar para sempre com um token vencido — parecendo
       * oscilação de sinal enquanto na verdade ninguém mais entrava.
       *
       * O servidor emite exatamente `UNAUTHENTICATED` no handshake do `/ops`.
       */
      if (erro?.message === 'UNAUTHENTICATED') {
        this.mudarEstado('desconectado')
        expirarSessao()
        return
      }

      this.mudarEstado('desconectado')
      this.agendarCarencia()
    })
  }

  private assinar() {
    let concedidas = 0

    for (const unityId of this.opcoes.unityIds) {
      this.socket?.emit(
        'subscribe',
        { storeId: unityId, channels: ['orders'] },
        (resposta: { ok?: boolean; cursor?: number; error?: string }) => {
          if (!resposta?.ok) {
            // Escopo ou permissão negados nesta loja. Não derruba as outras:
            // insistir não resolve, e o HTTP responderia o mesmo 403.
            return
          }

          concedidas += 1
          this.mudarEstado('ao-vivo')

          // Cursor do servidor no momento da assinatura. Se estiver à frente
          // do nosso, perdemos eventos enquanto estávamos fora — e é aqui que
          // a reconexão recupera o que passou.
          if (typeof resposta.cursor === 'number') {
            this.sincronizadores.get(unityId)?.aoReceberHeartbeat(resposta.cursor)
          }

          if (concedidas === 1) this.iniciarHeartbeat()
        }
      )
    }
  }

  private iniciarHeartbeat() {
    this.pararHeartbeat()
    this.temporizadorDeHeartbeat = setInterval(() => {
      // Uma batida por loja: o cursor é por unidade, e uma batida só não teria
      // como perguntar por todas.
      for (const [unityId, sincronizador] of this.sincronizadores) {
        const enviadoEm = Date.now()
        this.socket?.emit(
          'ops:heartbeat',
          { storeId: unityId, cursor: sincronizador.cursorAtual },
          (resposta: { serverCursor: number | null; serverTime: string }) => {
            if (!resposta) return

            // Metade da ida e volta é uma aproximação boa o bastante do atraso
            // de rede; o erro residual é de dezenas de milissegundos, contra
            // minutos de desvio do relógio do tablet.
            const meiaViagem = (Date.now() - enviadoEm) / 2
            this.desvioDeRelogio =
              new Date(resposta.serverTime).getTime() + meiaViagem - Date.now()

            sincronizador.aoReceberHeartbeat(resposta.serverCursor)
          }
        )
      }
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
    const recuperarTodas = () => {
      for (const sincronizador of this.sincronizadores.values()) {
        void sincronizador.recuperar()
      }
    }
    recuperarTodas()
    this.temporizadorDegradado = setInterval(recuperarTodas, INTERVALO_DEGRADADO)
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
