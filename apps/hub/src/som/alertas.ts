/**
 * Alertas sonoros do Order Hub.
 *
 * Sintetizados com a Web Audio API, sem arquivo de áudio. Três motivos, nesta
 * ordem de importância:
 *
 * 1. **Funciona offline no primeiro carregamento.** Um `.mp3` que não baixou é
 *    um alarme que não toca — e o alarme que não toca é a razão de o pedido
 *    ficar dez minutos sem aceite.
 * 2. Não consome o orçamento de bundle nem uma requisição.
 * 3. Um tom puro corta o ruído de cozinha melhor do que um som gravado, que
 *    perde definição no alto-falante pequeno de um tablet.
 *
 * A política de autoplay dos navegadores exige um gesto do usuário antes de
 * qualquer som. Por isso `destravar()` precisa ser chamado no primeiro toque —
 * e por isso o Hub avisa, com um botão, quando o som ainda está bloqueado. Um
 * alarme que o operador **acha** que está ligado é pior do que um desligado.
 */

export type TipoDeAlerta = 'pedido-novo' | 'sla-estourado' | 'erro'

interface Nota {
  hz: number
  /** Segundos. */
  duracao: number
  /** Atraso em relação ao início, em segundos. */
  atraso: number
}

/**
 * Padrões distintos, não só alturas distintas.
 *
 * Quem está de costas para o tablet precisa saber o que aconteceu sem olhar —
 * e ritmo se distingue melhor que timbre no meio do barulho. Pedido novo sobe
 * (duas notas ascendentes, convidativo); SLA estourado repete três vezes na
 * mesma nota alta (insistente); erro desce (duas notas graves).
 */
const PADROES: Record<TipoDeAlerta, { notas: Nota[]; volume: number }> = {
  'pedido-novo': {
    notas: [
      { hz: 880, duracao: 0.12, atraso: 0 },
      { hz: 1320, duracao: 0.18, atraso: 0.13 },
    ],
    volume: 0.35,
  },
  'sla-estourado': {
    notas: [
      { hz: 1046, duracao: 0.14, atraso: 0 },
      { hz: 1046, duracao: 0.14, atraso: 0.22 },
      { hz: 1046, duracao: 0.22, atraso: 0.44 },
    ],
    volume: 0.45,
  },
  erro: {
    notas: [
      { hz: 440, duracao: 0.14, atraso: 0 },
      { hz: 330, duracao: 0.2, atraso: 0.15 },
    ],
    volume: 0.3,
  },
}

type EstadoDoSom = 'bloqueado' | 'pronto' | 'indisponivel' | 'mudo'

class Alertas {
  private contexto: AudioContext | null = null
  private estado: EstadoDoSom = 'bloqueado'
  private ouvintes = new Set<(estado: EstadoDoSom) => void>()

  get situacao(): EstadoDoSom {
    return this.estado
  }

  observar(ouvinte: (estado: EstadoDoSom) => void): () => void {
    this.ouvintes.add(ouvinte)
    ouvinte(this.estado)
    return () => this.ouvintes.delete(ouvinte)
  }

  private anunciar(estado: EstadoDoSom) {
    if (this.estado === estado) return
    this.estado = estado
    for (const ouvinte of this.ouvintes) ouvinte(estado)
  }

  /** Precisa ser chamado a partir de um gesto do usuário. */
  async destravar(): Promise<boolean> {
    if (this.estado === 'mudo') return false

    try {
      const Construtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

      if (!Construtor) {
        this.anunciar('indisponivel')
        return false
      }

      this.contexto ??= new Construtor()
      if (this.contexto.state === 'suspended') await this.contexto.resume()

      const funcionou = this.contexto.state === 'running'
      this.anunciar(funcionou ? 'pronto' : 'bloqueado')
      return funcionou
    } catch {
      this.anunciar('indisponivel')
      return false
    }
  }

  silenciar() {
    this.anunciar('mudo')
  }

  async religar() {
    this.anunciar('bloqueado')
    await this.destravar()
  }

  tocar(tipo: TipoDeAlerta) {
    if (this.estado !== 'pronto' || !this.contexto) return

    const { notas, volume } = PADROES[tipo]
    const agora = this.contexto.currentTime

    for (const nota of notas) {
      const oscilador = this.contexto.createOscillator()
      const ganho = this.contexto.createGain()

      // Onda triangular: mais suave que a quadrada, mais presente que a
      // senoidal. Seis horas ouvindo onda quadrada é tortura.
      oscilador.type = 'triangle'
      oscilador.frequency.value = nota.hz

      const inicio = agora + nota.atraso
      const fim = inicio + nota.duracao

      // Rampa de ataque e queda: um tom que corta seco estala no alto-falante.
      ganho.gain.setValueAtTime(0, inicio)
      ganho.gain.linearRampToValueAtTime(volume, inicio + 0.015)
      ganho.gain.setValueAtTime(volume, fim - 0.04)
      ganho.gain.linearRampToValueAtTime(0, fim)

      oscilador.connect(ganho).connect(this.contexto.destination)
      oscilador.start(inicio)
      oscilador.stop(fim + 0.02)
    }
  }
}

export const alertas = new Alertas()
export type { EstadoDoSom }
