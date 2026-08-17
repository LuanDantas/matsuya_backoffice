import type { DadosDaComanda } from '@matsuya/printing/comanda'
import { montarBytes, type PapelDaImpressora } from './escpos'
import { enviarBytes, type Impressora } from './transporte'

/**
 * A fila do agente, que é a razão de o agente existir.
 *
 * O ADR-0017 é explícito: **a fila autoritativa vive aqui**, não no navegador.
 * O motivo é o dia a dia da loja — o tablet do balcão é atualizado, a aba é
 * fechada, o Wi-Fi oscila. Se a fila morasse no Hub, cada um desses eventos
 * apagaria comandas que ainda não saíram, e um pedido aceito cuja comanda nunca
 * chegou à cozinha é comida que não começou a ser feita e ninguém sabe.
 *
 * ## Três garantias, e por que cada uma
 *
 * **Deduplicação por chave, com janela.** Reconexão do socket, retry do backend
 * e o operador clicando duas vezes produzem o mesmo trabalho. Sem dedupe, a
 * cozinha monta o prato duas vezes. A janela é de 10 minutos porque
 * reimpressão legítima do mesmo pedido acontece — e depois de dez minutos ela é
 * quase certamente intencional.
 *
 * **Serialização por impressora.** Duas comandas concorrentes na mesma
 * impressora térmica entrelaçam os bytes: sai um papel com metade de cada
 * pedido. Cada impressora tem sua corrente de promessas; impressoras diferentes
 * seguem em paralelo, porque não disputam nada.
 *
 * **Ordem de aceite.** Dentro de uma impressora as comandas saem na ordem em
 * que entraram na fila, que é a ordem de aceite. A cozinha trabalha de cima
 * para baixo no trilho, e papel fora de ordem faz o pedido antigo esperar.
 */

export type EstadoDoTrabalho = 'aguardando' | 'imprimindo' | 'impresso' | 'falhou'

export interface Trabalho {
  id: string
  chave: string
  comanda: DadosDaComanda
  papel: PapelDaImpressora
  impressora: string
  estado: EstadoDoTrabalho
  tentativas: number
  criadoEm: number
  ultimoErro?: string
}

/** §7.3: `retry(1..3, backoff 2s/6s/15s)`. */
const ESPERAS_MS = [2_000, 6_000, 15_000]
const MAXIMO_DE_TENTATIVAS = ESPERAS_MS.length + 1

/** Janela de deduplicação. */
export const JANELA_DE_DEDUPE_MS = 10 * 60 * 1000

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface OpcoesDaFila {
  impressoras: Impressora[]
  /** Injetável para teste; por padrão fala com o hardware. */
  enviar?: (impressora: Impressora, bytes: Buffer) => Promise<void>
  agora?: () => number
  aoMudar?: (trabalhos: Trabalho[]) => void
}

export class FilaDeImpressao {
  private readonly trabalhos: Trabalho[] = []
  /** Uma corrente de promessas por impressora — é o que serializa. */
  private readonly correntes = new Map<string, Promise<void>>()
  private readonly vistos = new Map<string, number>()

  constructor(private readonly opcoes: OpcoesDaFila) {}

  private get enviar() {
    return this.opcoes.enviar ?? enviarBytes
  }

  private get agora() {
    return this.opcoes.agora ?? Date.now
  }

  get pendentes(): Trabalho[] {
    return this.trabalhos.filter((t) => t.estado === 'aguardando' || t.estado === 'imprimindo')
  }

  get todos(): Trabalho[] {
    return [...this.trabalhos]
  }

  /**
   * Enfileira a comanda em todas as impressoras cujo papel a recebe.
   *
   * Devolve os trabalhos criados. Lista vazia significa duplicata descartada ou
   * nenhuma impressora configurada para aquele papel — os dois são resultados
   * legítimos, não erro.
   */
  enfileirar(comanda: DadosDaComanda, papeis: PapelDaImpressora[] = ['cozinha', 'balcao']): Trabalho[] {
    const criados: Trabalho[] = []

    for (const papel of papeis) {
      for (const impressora of this.opcoes.impressoras.filter((i) => i.papel === papel)) {
        const chave = `${comanda.code}:${papel}:${impressora.nome}:${comanda.reimpressao ? 're' : 'orig'}`

        if (this.jaVisto(chave)) continue

        this.vistos.set(chave, this.agora())

        const trabalho: Trabalho = {
          id: `${chave}:${this.agora()}`,
          chave,
          comanda,
          papel,
          impressora: impressora.nome,
          estado: 'aguardando',
          tentativas: 0,
          criadoEm: this.agora(),
        }

        this.trabalhos.push(trabalho)
        criados.push(trabalho)
        this.encadear(impressora, trabalho)
      }
    }

    if (criados.length > 0) this.anunciar()
    return criados
  }

  private jaVisto(chave: string): boolean {
    const quando = this.vistos.get(chave)
    if (quando === undefined) return false

    if (this.agora() - quando > JANELA_DE_DEDUPE_MS) {
      this.vistos.delete(chave)
      return false
    }

    return true
  }

  /**
   * Põe o trabalho no fim da corrente daquela impressora.
   *
   * `catch` na cauda de propósito: se uma falha escapasse, a corrente ficaria
   * rejeitada para sempre e **nenhuma comanda seguinte imprimiria naquela
   * impressora** — uma comanda perdida viraria a impressora inteira perdida.
   */
  private encadear(impressora: Impressora, trabalho: Trabalho): void {
    const anterior = this.correntes.get(impressora.nome) ?? Promise.resolve()

    const proxima = anterior
      .then(() => this.executar(impressora, trabalho))
      .catch(() => undefined)

    this.correntes.set(impressora.nome, proxima)
  }

  private async executar(impressora: Impressora, trabalho: Trabalho): Promise<void> {
    const bytes = montarBytes(trabalho.comanda, {
      largura: impressora.largura,
      papel: trabalho.papel,
    })

    for (let tentativa = 1; tentativa <= MAXIMO_DE_TENTATIVAS; tentativa++) {
      trabalho.estado = 'imprimindo'
      trabalho.tentativas = tentativa
      this.anunciar()

      try {
        await this.enviar(impressora, bytes)
        trabalho.estado = 'impresso'
        delete trabalho.ultimoErro
        this.anunciar()
        return
      } catch (erro) {
        trabalho.ultimoErro = erro instanceof Error ? erro.message : String(erro)

        const espera = ESPERAS_MS[tentativa - 1]
        if (espera === undefined) break

        trabalho.estado = 'aguardando'
        this.anunciar()
        await dormir(espera)
      }
    }

    /*
     * `falhou` e o trabalho **continua na lista**. Sumir seria o pior desfecho:
     * a loja não saberia que aquela comanda nunca saiu. Visível, ela vira o
     * alerta não descartável no card e a oferta de imprimir pelo navegador.
     */
    trabalho.estado = 'falhou'
    this.anunciar()
  }

  /** Refaz um trabalho que falhou. A dedupe não atrapalha: é decisão humana. */
  reenfileirar(id: string): boolean {
    const trabalho = this.trabalhos.find((t) => t.id === id && t.estado === 'falhou')
    if (!trabalho) return false

    const impressora = this.opcoes.impressoras.find((i) => i.nome === trabalho.impressora)
    if (!impressora) return false

    trabalho.estado = 'aguardando'
    trabalho.tentativas = 0
    this.encadear(impressora, trabalho)
    this.anunciar()
    return true
  }

  /** Espera a fila esvaziar. Existe para teste e para o desligamento limpo. */
  async aguardar(): Promise<void> {
    await Promise.all([...this.correntes.values()])
  }

  private anunciar(): void {
    this.opcoes.aoMudar?.(this.todos)
  }
}
