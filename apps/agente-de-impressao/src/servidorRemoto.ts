import { io, type Socket } from 'socket.io-client'
import type { DadosDaComanda } from '@matsuya/printing/comanda'
import type { FilaDeImpressao } from './fila'
import { estaOnline, type Impressora } from './transporte'

/**
 * A ligação com o backend — a metade do agente que faltava.
 *
 * Sem ela, o agente só imprime o que o Hub lhe entrega pela LAN, e o Hub só
 * entrega **enquanto está aberto**. Tablet dormindo, aba fechada, navegador
 * reiniciando: o pedido é aceito e a comanda não sai. O servidor já monta a
 * comanda no aceite e publica no canal `print`; aqui é quem escuta.
 *
 * ## Token de dispositivo, não login
 *
 * O agente roda sem ninguém logado e precisa reconectar sozinho depois da queda
 * de luz das três da manhã. Um JWT de usuário expira, e renová-lo exigiria
 * guardar a senha de alguém no disco da loja — a pior credencial possível de
 * deixar lá, porque abre o sistema inteiro e não só a impressora. O token de
 * dispositivo vale para uma unidade, só para o canal de impressão, e é
 * revogável sem trocar a senha de ninguém.
 *
 * ## O que acontece quando a internet cai
 *
 * Nada de grave, e é o ponto do desenho: o Hub continua alcançando o agente
 * pela LAN, e a fila local segue imprimindo. Esta conexão é o caminho **extra**,
 * não o principal. Por isso a reconexão é silenciosa e infinita — um agente que
 * desiste de reconectar é um agente que precisa de alguém indo até a loja.
 */

export interface OpcoesDoRemoto {
  /** Base da API, ex.: `https://mastsuya-api.onrender.com`. */
  url: string
  token: string
  unityId: number
  fila: FilaDeImpressao
  impressoras: Impressora[]
  /** Intervalo do heartbeat. §7.3 pede 30 s. */
  intervaloDoHeartbeatMs?: number
}

interface TrabalhoRecebido {
  id: string
  orderId: number
  papel: 'cozinha' | 'balcao'
  comanda: DadosDaComanda
}

const HEARTBEAT_PADRAO_MS = 30_000

export class ServidorRemoto {
  private socket: Socket | null = null
  private relogio: ReturnType<typeof setInterval> | null = null

  constructor(private readonly opcoes: OpcoesDoRemoto) {}

  conectar(): void {
    if (this.socket) return

    this.socket = io(`${this.opcoes.url}/ops`, {
      auth: { token: this.opcoes.token },
      transports: ['websocket'],
      // Infinita e com espera crescente: a loja não tem quem reinicie serviço,
      // e desistir transformaria uma oscilação de rede numa visita técnica.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
    })

    this.socket.on('connect', () => {
      console.log('[agente] conectado ao servidor')

      /*
       * O servidor concede rooms; o cliente pede. Pedir só `print` não é
       * gentileza — o handshake recusa qualquer outro canal para dispositivo,
       * e pedir a mais derrubaria a assinatura inteira.
       */
      this.socket?.emit(
        'subscribe',
        { storeId: this.opcoes.unityId, channels: ['print'] },
        (resposta: { ok?: boolean; error?: string }) => {
          if (resposta?.error) {
            console.error(`[agente] servidor recusou a assinatura: ${resposta.error}`)
          }
        }
      )
    })

    this.socket.on('connect_error', (erro) => {
      // Sem `console.error` a cada tentativa: com reconexão infinita isso
      // encheria o disco da loja em um fim de semana.
      if (this.socket?.active) return
      console.error(`[agente] não foi possível conectar: ${erro.message}`)
    })

    this.socket.on('print.job', (trabalho: TrabalhoRecebido) => {
      void this.imprimir(trabalho)
    })

    this.iniciarHeartbeat()
  }

  /**
   * Recebe a comanda do servidor e entrega à fila local.
   *
   * A fila é que decide o resto — dedupe, ordem, retry. Se o Hub já mandou a
   * mesma comanda pela LAN, aqui vira no-op: é exatamente para isso que a
   * dedupe existe, e é o que torna seguro ter dois caminhos de entrada.
   */
  private async imprimir(trabalho: TrabalhoRecebido): Promise<void> {
    if (!trabalho?.comanda?.code) return

    const criados = this.opcoes.fila.enfileirar(trabalho.comanda, [trabalho.papel])

    if (criados.length === 0) {
      // Duplicata: o Hub chegou antes. O servidor precisa saber que saiu.
      await this.relatar(trabalho.id, 'impresso')
      return
    }

    await this.opcoes.fila.aguardar()

    const falhou = criados.some(
      (c) => this.opcoes.fila.todos.find((t) => t.id === c.id)?.estado === 'falhou'
    )

    const erro = falhou
      ? this.opcoes.fila.todos.find((t) => t.id === criados[0]!.id)?.ultimoErro
      : undefined

    await this.relatar(trabalho.id, falhou ? 'falhou' : 'impresso', erro)
  }

  /**
   * Conta ao servidor o que aconteceu com o papel.
   *
   * É o que separa "entreguei a comanda" de "a comanda saiu" no relatório. Sem
   * isso, a taxa de falha por unidade seria sempre zero e a impressora quebrada
   * continuaria invisível — que é a situação de hoje.
   */
  private async relatar(jobId: string, status: string, erro?: string): Promise<void> {
    try {
      await fetch(`${this.opcoes.url}/agente/impressao/${jobId}/resultado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opcoes.token}`,
        },
        body: JSON.stringify({ status, erro }),
      })
    } catch (falha) {
      // Relato perdido não pode virar comanda perdida: o papel já saiu, e o que
      // se perde aqui é uma linha de relatório.
      console.warn(
        `[agente] não consegui relatar o trabalho ${jobId}: ${
          falha instanceof Error ? falha.message : falha
        }`
      )
    }
  }

  /**
   * O heartbeat, com o estado real das impressoras.
   *
   * O valor dele não é dizer que o agente está vivo — o socket já diz. É dizer
   * que a **impressora** está viva, que é outra coisa: o agente pode estar
   * perfeito com a térmica da cozinha desligada no tomada. É isso que acende o
   * indicador antes do primeiro pedido falhar.
   */
  private iniciarHeartbeat(): void {
    if (this.relogio) return

    const bater = async () => {
      const impressoras = await Promise.all(
        this.opcoes.impressoras.map(async (i) => ({
          nome: i.nome,
          papel: i.papel,
          online: await estaOnline(i),
        }))
      )

      try {
        await fetch(`${this.opcoes.url}/agente/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.opcoes.token}`,
          },
          body: JSON.stringify({ impressoras }),
        })
      } catch {
        // Internet fora. A loja continua imprimindo pela LAN, que é o desenho.
      }
    }

    void bater()

    this.relogio = setInterval(
      () => void bater(),
      this.opcoes.intervaloDoHeartbeatMs ?? HEARTBEAT_PADRAO_MS
    )

    this.relogio.unref?.()
  }

  desconectar(): void {
    if (this.relogio) {
      clearInterval(this.relogio)
      this.relogio = null
    }

    this.socket?.disconnect()
    this.socket = null
  }
}
