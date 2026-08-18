import {
  ganhoDoVolume,
  gravarPreferencias,
  lerPreferencias,
  normalizarVolume,
  podeSoar,
  type PreferenciasDeSom,
} from './preferencias'

/**
 * Alertas sonoros do Gestor de Pedidos.
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

/**
 * As três opções de som para **pedido recebido**.
 *
 * Só este evento tem escolha, e de propósito: é o que toca dezenas de vezes por
 * turno, e é o único em que faz diferença poder trocar quando o som padrão se
 * confunde com o de outro aparelho da loja. Prazo estourado e erro tocam raro e
 * precisam ser reconhecíveis — dar variantes a eles seria transformar um alarme
 * numa preferência estética.
 *
 * Os nomes descrevem o som, e não são "Som 1, 2 e 3": num seletor de três, o
 * número obriga a ouvir os três toda vez para lembrar qual era qual.
 */
export type SomDePedidoNovo = 'duas-notas' | 'telefone' | 'campainha'

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
/**
 * As variantes de "pedido recebido".
 *
 * Distintas por **ritmo e direção**, não só por altura: quem está de costas para
 * o tablet identifica um padrão rítmico muito antes de identificar um timbre no
 * meio do barulho de cozinha.
 */
const SONS_DE_PEDIDO_NOVO: Record<SomDePedidoNovo, { notas: Nota[]; volume: number }> = {
  // Sobe. É o som que o Hub sempre teve, e continua sendo o padrão — trocar o
  // som de quem já se acostumou seria mudar um alarme sem avisar.
  'duas-notas': {
    notas: [
      { hz: 880, duracao: 0.12, atraso: 0 },
      { hz: 1320, duracao: 0.18, atraso: 0.13 },
    ],
    volume: 0.35,
  },

  /*
   * Telefone tocando: dois trinados de tons alternados.
   *
   * É a **alternância rápida** entre duas alturas próximas que o ouvido lê como
   * campainha de telefone — não a altura em si. Duas rajadas de quatro notinhas
   * de 60 ms, com uma pausa curta entre elas, reproduzem o padrão do toque sem
   * precisar de amostra gravada.
   *
   * O mais alto dos três, de propósito: é o som para quem pediu algo que corte
   * o barulho da cozinha.
   */
  telefone: {
    notas: [
      { hz: 1000, duracao: 0.06, atraso: 0 },
      { hz: 800, duracao: 0.06, atraso: 0.07 },
      { hz: 1000, duracao: 0.06, atraso: 0.14 },
      { hz: 800, duracao: 0.06, atraso: 0.21 },

      // A pausa entre as duas rajadas é o que separa "telefone" de "alarme".
      { hz: 1000, duracao: 0.06, atraso: 0.36 },
      { hz: 800, duracao: 0.06, atraso: 0.43 },
      { hz: 1000, duracao: 0.06, atraso: 0.5 },
      { hz: 800, duracao: 0.06, atraso: 0.57 },
    ],
    volume: 0.55,
  },

  // Desce, em duas notas longas e graves: o "din-don" de campainha de porta.
  // É o mais distinguível dos três num ambiente barulhento, e o mais lento.
  campainha: {
    notas: [
      { hz: 784, duracao: 0.26, atraso: 0 },
      { hz: 622, duracao: 0.4, atraso: 0.26 },
    ],
    volume: 0.38,
  },
}

const PADROES: Record<TipoDeAlerta, { notas: Nota[]; volume: number }> = {
  // Substituído em `tocar` pela variante escolhida — fica aqui para o tipo
  // fechar e para haver um padrão caso a preferência esteja ilegível.
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

  /**
   * O ganho mestre — o único lugar onde volume existe.
   *
   * Fica entre o ganho de cada nota e a saída. Os volumes de `PADROES` deixam
   * de ser absolutos e viram **proporção** deste: é o que mantém "prazo
   * estourado" mais alto que "pedido novo" em qualquer posição do controle,
   * em vez de os três se achatarem no mesmo nível.
   */
  private mestre: GainNode | null = null

  private estado: EstadoDoSom = 'bloqueado'
  private ouvintes = new Set<(estado: EstadoDoSom) => void>()

  /**
   * Preferência da pessoa, lida do armazenamento **na construção**.
   *
   * O estado da máquina (`bloqueado`/`pronto`/`indisponivel`) continua nascendo
   * do zero: ele é sobre o navegador desta aba, não sobre a escolha de ninguém.
   * O `mudo` é escolha, e é aplicado por cima logo abaixo.
   */
  private preferencias: PreferenciasDeSom = lerPreferencias()

  constructor() {
    // Silenciado na sessão passada nasce silenciado — era exatamente isto que
    // faltava: quem silenciava às 19h voltava a ouvir alerta no próximo F5.
    if (this.preferencias.mudo) this.estado = 'mudo'
  }

  get situacao(): EstadoDoSom {
    return this.estado
  }

  get volume(): number {
    return this.preferencias.volume
  }

  get eventos(): Readonly<Record<TipoDeAlerta, boolean>> {
    return this.preferencias.eventos
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

      // O mestre nasce com o contexto e vive tanto quanto ele: recriá-lo a
      // cada som perderia a posição do volume no meio de uma sequência.
      if (!this.mestre) {
        this.mestre = this.contexto.createGain()
        this.mestre.gain.value = ganhoDoVolume(this.preferencias.volume)
        this.mestre.connect(this.contexto.destination)
      }

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
    // **Não zera o volume.** Mudo e volume são respostas separadas: apagar o
    // volume aqui faria religar devolver o som num nível que a pessoa não
    // escolheu. Ver `podeSoar` em `preferencias.ts`.
    this.guardar({ ...this.preferencias, mudo: true })
    this.anunciar('mudo')
  }

  async religar() {
    this.guardar({ ...this.preferencias, mudo: false })
    this.anunciar('bloqueado')
    await this.destravar()
  }

  /**
   * 0 a 1. Aplica no nó vivo, para a mudança valer no som seguinte.
   *
   * **A gravação em disco é adiada; o resto é imediato.** Com o deslizante
   * contínuo, arrastar dispara ~60 mudanças por segundo, e `localStorage` é
   * síncrono — gravar em toda uma delas é o que faz um controle desses engasgar
   * num tablete. O valor em memória, o ganho e a tela andam na hora; só a
   * escrita espera o arraste parar.
   */
  definirVolume(volume: number) {
    const proximo = normalizarVolume(volume)
    this.preferencias = { ...this.preferencias, volume: proximo }
    if (this.mestre) this.mestre.gain.value = ganhoDoVolume(proximo)

    for (const ouvinte of this.ouvintes) ouvinte(this.estado)
    this.agendarGravacao()
  }

  /**
   * Adia a gravação e a garante antes de a página sumir.
   *
   * O `pagehide` é a rede de segurança: sem ele, soltar o deslizante e fechar a
   * aba dentro da janela de espera perderia a escolha — um defeito raro,
   * silencioso, e que só apareceria como "às vezes não salva".
   */
  private relogioDaGravacao: ReturnType<typeof setTimeout> | null = null

  private agendarGravacao() {
    if (this.relogioDaGravacao) clearTimeout(this.relogioDaGravacao)

    this.relogioDaGravacao = setTimeout(() => {
      this.relogioDaGravacao = null
      gravarPreferencias(this.preferencias)
    }, 250)

    if (!this.ouvindoSaida && typeof window !== 'undefined') {
      this.ouvindoSaida = true
      window.addEventListener('pagehide', () => this.gravarAgora())
    }
  }

  private ouvindoSaida = false

  /** Descarrega a gravação pendente, se houver. */
  private gravarAgora() {
    if (!this.relogioDaGravacao) return
    clearTimeout(this.relogioDaGravacao)
    this.relogioDaGravacao = null
    gravarPreferencias(this.preferencias)
  }

  /** Cancela a pendente sem gravar — para quem vai gravar em seguida. */
  private cancelarGravacao() {
    if (!this.relogioDaGravacao) return
    clearTimeout(this.relogioDaGravacao)
    this.relogioDaGravacao = null
  }

  get somDePedidoNovo(): SomDePedidoNovo {
    return this.preferencias.somDePedidoNovo
  }

  definirSomDePedidoNovo(som: SomDePedidoNovo) {
    this.guardar({ ...this.preferencias, somDePedidoNovo: som })
  }

  definirEvento(tipo: TipoDeAlerta, ligado: boolean) {
    this.guardar({
      ...this.preferencias,
      eventos: { ...this.preferencias.eventos, [tipo]: ligado },
    })
  }

  /**
   * Grava na hora.
   *
   * Vale para mudo, chaves e escolha de som: são **cliques**, um de cada vez, e
   * adiar a escrita ali só criaria uma janela para perder a escolha sem ganhar
   * nada. O volume é o único que chega em rajada — ver `definirVolume`.
   */
  private guardar(preferencias: PreferenciasDeSom) {
    this.preferencias = preferencias
    // Cancela — não descarrega — a gravação adiada: escrever aqui e no timer
    // gravaria duas vezes o mesmo objeto. A linha seguinte já persiste tudo,
    // inclusive o volume que estava pendente.
    this.cancelarGravacao()
    gravarPreferencias(preferencias)
    // Os ouvintes acompanham o estado; a preferência mudou junto, e quem
    // desenha a tela precisa redesenhar. Reanunciar o mesmo estado não passa
    // pelo `anunciar`, que descarta repetição — daí o laço direto.
    for (const ouvinte of this.ouvintes) ouvinte(this.estado)
  }

  /**
   * Toca um alerta.
   *
   * `forcar` existe para a **prévia** dos ajustes: ela precisa soar mesmo com o
   * evento desligado, senão o botão que demonstra o som não teria o que
   * demonstrar justamente quando alguém está decidindo se liga aquilo. O mudo e
   * o "navegador não deixa" continuam valendo — forçar ali seria tocar som que
   * a pessoa acabou de proibir.
   */
  tocar(tipo: TipoDeAlerta, forcar = false) {
    if (this.estado !== 'pronto' || !this.contexto) return
    if (!forcar && !podeSoar(this.preferencias, tipo)) return
    if (forcar && this.preferencias.volume <= 0) return

    // "Pedido recebido" é o único com variante escolhível — ver `SomDePedidoNovo`.
    const { notas, volume } =
      tipo === 'pedido-novo'
        ? SONS_DE_PEDIDO_NOVO[this.preferencias.somDePedidoNovo]
        : PADROES[tipo]
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

      oscilador.connect(ganho).connect(this.mestre ?? this.contexto.destination)
      oscilador.start(inicio)
      oscilador.stop(fim + 0.02)
    }
  }
}

export const alertas = new Alertas()
export type { EstadoDoSom }
