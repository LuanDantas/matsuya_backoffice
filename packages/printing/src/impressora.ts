import { montarComanda, type DadosDaComanda, type LarguraDoPapel } from './comanda'

/**
 * Envio da comanda para a impressora.
 *
 * Dois caminhos, nesta ordem de preferência:
 *
 * 1. **Agente local** — um serviço na rede da loja que fala ESC/POS direto com
 *    a impressora térmica. Imprime sem diálogo, sem margem, sem alguém apertar
 *    nada. É o único caminho que funciona numa cozinha de verdade.
 * 2. **Navegador** — `window.print()` num iframe oculto. Exige que alguém
 *    confirme o diálogo, o que numa cozinha significa que a comanda sai
 *    quando alguém lembrar.
 *
 * O agente ainda não existe; o contrato dele está declarado aqui para que o
 * Hub já saiba conversar quando ele existir, e para que a troca não exija
 * mexer em nenhuma tela.
 *
 * **A fila é o que importa.** Impressora sem papel, agente reiniciando, tablet
 * com Wi-Fi oscilando — em todos esses casos a comanda precisa sair depois, e
 * não sumir. Um pedido aceito cuja comanda nunca chegou à cozinha é comida que
 * não começou a ser feita e ninguém sabe.
 */

export type ResultadoDaImpressao = 'impresso' | 'enfileirado' | 'falhou'

export interface TrabalhoDeImpressao {
  id: string
  dados: DadosDaComanda
  criadoEm: number
  tentativas: number
  ultimoErro?: string
}

export interface OpcoesDaImpressora {
  /**
   * URL do agente local, ex.: `http://localhost:9110`. Ausente ⇒ só navegador.
   *
   * 9110 e não 9100: a 9100 é a porta do protocolo de impressão bruta
   * (JetDirect), que é o que as próprias impressoras de rede escutam. Um agente
   * anunciado nessa porta colide com qualquer serviço de impressão na mesma
   * máquina e confunde quem for diagnosticar. É a porta que o ADR-0017 escolhe
   * e a que `@matsuya/agente-de-impressao` abre por padrão.
   */
  urlDoAgente?: string
  largura?: LarguraDoPapel
  /** Chamada a cada mudança na fila, para a interface mostrar o que falta. */
  aoMudarFila?: (fila: TrabalhoDeImpressao[]) => void
}

const MAXIMO_DE_TENTATIVAS = 5
const INTERVALO_DE_TENTATIVA = 15_000

export class Impressora {
  private fila: TrabalhoDeImpressao[] = []
  private temporizador: ReturnType<typeof setInterval> | null = null
  private drenando = false

  constructor(private readonly opcoes: OpcoesDaImpressora = {}) {}

  get pendentes(): TrabalhoDeImpressao[] {
    return [...this.fila]
  }

  get temAgente(): boolean {
    return Boolean(this.opcoes.urlDoAgente)
  }

  async imprimir(dados: DadosDaComanda): Promise<ResultadoDaImpressao> {
    const trabalho: TrabalhoDeImpressao = {
      id: `${dados.code}-${Date.now()}`,
      dados,
      criadoEm: Date.now(),
      tentativas: 0,
    }

    const resultado = await this.tentar(trabalho)
    if (resultado === 'impresso') return 'impresso'

    this.fila.push(trabalho)
    this.anunciar()
    this.agendarDrenagem()
    return 'enfileirado'
  }

  /** Reimpressão manual: marca o papel, para ninguém confundir com pedido novo. */
  reimprimir(dados: DadosDaComanda): Promise<ResultadoDaImpressao> {
    return this.imprimir({ ...dados, reimpressao: true })
  }

  private async tentar(trabalho: TrabalhoDeImpressao): Promise<ResultadoDaImpressao> {
    trabalho.tentativas += 1

    if (this.opcoes.urlDoAgente) {
      try {
        const resposta = await fetch(`${this.opcoes.urlDoAgente}/imprimir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            largura: this.opcoes.largura ?? 80,
            comanda: trabalho.dados,
          }),
          // O agente é local: se não responder em 4 s, ou está reiniciando ou
          // não está lá. Esperar mais só atrasa a queda para o navegador.
          signal: AbortSignal.timeout(4000),
        })
        if (resposta.ok) return 'impresso'
        trabalho.ultimoErro = `Agente respondeu ${resposta.status}`
      } catch (falha) {
        trabalho.ultimoErro =
          falha instanceof Error ? falha.message : 'Agente local não respondeu'
      }
    }

    return this.imprimirPeloNavegador(trabalho.dados) ? 'impresso' : 'falhou'
  }

  /**
   * Impressão pelo navegador, num iframe oculto.
   *
   * Iframe e não `window.open`: uma janela nova é bloqueada por bloqueador de
   * pop-up e, num tablet em quiosque, pode nem ter onde aparecer.
   */
  private imprimirPeloNavegador(dados: DadosDaComanda): boolean {
    if (typeof document === 'undefined') return false

    try {
      const quadro = document.createElement('iframe')
      quadro.setAttribute('aria-hidden', 'true')
      quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
      document.body.appendChild(quadro)

      const doc = quadro.contentWindow?.document
      if (!doc) {
        quadro.remove()
        return false
      }

      doc.open()
      doc.write(montarComanda(dados, this.opcoes.largura ?? 80))
      doc.close()

      quadro.contentWindow?.focus()
      quadro.contentWindow?.print()

      // Remove depois do diálogo. Remover na hora cancelaria a impressão em
      // alguns navegadores, que leem o documento de forma assíncrona.
      setTimeout(() => quadro.remove(), 1000)
      return true
    } catch {
      return false
    }
  }

  private agendarDrenagem() {
    if (this.temporizador) return
    this.temporizador = setInterval(() => void this.drenar(), INTERVALO_DE_TENTATIVA)
  }

  /** Reprocessa a fila. Chamada pelo temporizador e pelo botão "tentar de novo". */
  async drenar(): Promise<void> {
    if (this.drenando || this.fila.length === 0) return
    this.drenando = true

    try {
      const restantes: TrabalhoDeImpressao[] = []

      for (const trabalho of this.fila) {
        if (trabalho.tentativas >= MAXIMO_DE_TENTATIVAS) {
          // Desistir em silêncio seria pior: o trabalho fica na fila,
          // visível, para alguém decidir o que fazer.
          trabalho.ultimoErro = 'Máximo de tentativas atingido. Imprima manualmente.'
          restantes.push(trabalho)
          continue
        }

        const resultado = await this.tentar(trabalho)
        if (resultado !== 'impresso') restantes.push(trabalho)
      }

      this.fila = restantes
      this.anunciar()

      if (this.fila.length === 0 && this.temporizador) {
        clearInterval(this.temporizador)
        this.temporizador = null
      }
    } finally {
      this.drenando = false
    }
  }

  descartar(id: string) {
    this.fila = this.fila.filter((t) => t.id !== id)
    this.anunciar()
  }

  private anunciar() {
    this.opcoes.aoMudarFila?.(this.pendentes)
  }

  parar() {
    if (!this.temporizador) return
    clearInterval(this.temporizador)
    this.temporizador = null
  }
}
