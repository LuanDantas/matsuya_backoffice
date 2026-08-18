import type { SomDePedidoNovo, TipoDeAlerta } from './alertas'

/**
 * As preferências de som — o que a pessoa escolheu, guardado entre sessões.
 *
 * ## O defeito que este arquivo conserta
 *
 * `Alertas.estado` mora num objeto em memória e nada o persistia: quem
 * silenciava às 19h voltava a ouvir alerta no próximo recarregamento, sem
 * entender por quê. Num tablet de loja, que recarrega sozinho, isso é o alarme
 * ressuscitando do nada.
 *
 * ## O que se persiste, e o que não
 *
 * **Preferência, nunca estado de máquina.** `bloqueado`, `pronto` e
 * `indisponivel` são sobre o **navegador** — se a política de autoplay já foi
 * satisfeita, se existe `AudioContext` — e precisam nascer do zero a cada carga,
 * porque a resposta pode ser outra nesta aba. `mudo`, o volume e quais eventos
 * tocam são escolha da pessoa, e é só isso que fica guardado.
 *
 * ## Por que as regras moram aqui e não no componente
 *
 * O `vitest` deste repositório roda sem DOM, então lógica dentro de componente é
 * lógica que ninguém consegue testar. É o mesmo motivo — e o mesmo desenho — de
 * `app/silenciados.ts`.
 */

/** Junto das outras cinco chaves que o Hub já escreve. */
export const CHAVE_DO_SOM = 'matsuya.hub.som'

export interface PreferenciasDeSom {
  /** Escolha da pessoa. Diferente de "o navegador não deixa tocar". */
  mudo: boolean
  /** 0 a 1. **Zero não é mudo** — ver `podeSoar`. */
  volume: number
  /** Quais eventos podem soar. */
  eventos: Record<TipoDeAlerta, boolean>
  /** Qual das três variantes toca em "pedido recebido". */
  somDePedidoNovo: SomDePedidoNovo
}

export const PADRAO: PreferenciasDeSom = {
  mudo: false,
  // 0,7 e não 1: os padrões já foram calibrados para serem audíveis num balcão
  // barulhento, e o topo da escala existe para quem precisa de mais, não como
  // ponto de partida.
  volume: 0.7,
  eventos: { 'pedido-novo': true, 'sla-estourado': true, erro: true },
  // O som que o Hub sempre teve. Quem já se acostumou não tem o alarme trocado
  // por baixo por causa de uma funcionalidade nova.
  somDePedidoNovo: 'duas-notas',
}

const SONS: SomDePedidoNovo[] = ['duas-notas', 'telefone', 'campainha']

const TIPOS: TipoDeAlerta[] = ['pedido-novo', 'sla-estourado', 'erro']

/**
 * Mescla o que veio do armazenamento com o padrão, campo a campo.
 *
 * **Tolera lixo de propósito.** O que está no `localStorage` foi escrito por
 * uma versão anterior deste código, ou por alguém com o console aberto. Um
 * `JSON.parse` que devolve `{ volume: "alto" }` não pode derrubar a tela nem
 * deixar o volume `NaN` — cada campo que não serve cai no padrão sozinho, e o
 * resto sobrevive.
 */
export function mesclarPreferencias(bruto: unknown): PreferenciasDeSom {
  if (!bruto || typeof bruto !== 'object') return { ...PADRAO, eventos: { ...PADRAO.eventos } }

  const entrada = bruto as Partial<PreferenciasDeSom>
  const eventos = { ...PADRAO.eventos }

  if (entrada.eventos && typeof entrada.eventos === 'object') {
    for (const tipo of TIPOS) {
      const valor = (entrada.eventos as Record<string, unknown>)[tipo]
      if (typeof valor === 'boolean') eventos[tipo] = valor
    }
  }

  return {
    mudo: typeof entrada.mudo === 'boolean' ? entrada.mudo : PADRAO.mudo,
    volume: normalizarVolume(entrada.volume),
    eventos,
    // Um nome de som que não existe mais — porque a lista mudou entre versões —
    // não pode deixar o alerta mudo: cai no padrão, que sempre existe.
    somDePedidoNovo: SONS.includes(entrada.somDePedidoNovo as SomDePedidoNovo)
      ? (entrada.somDePedidoNovo as SomDePedidoNovo)
      : PADRAO.somDePedidoNovo,
  }
}

/** Grampeia entre 0 e 1 e recusa o que não é número. */
export function normalizarVolume(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return PADRAO.volume
  return Math.max(0, Math.min(1, valor))
}

/**
 * Este tipo pode soar agora?
 *
 * **Volume zero não é mudo, e é de propósito que sejam coisas diferentes.** São
 * duas formas de ficar em silêncio; fazer uma significar a outra é como um
 * controle passa a mentir sobre o outro — silenciar zeraria o volume que a
 * pessoa tinha ajustado, e arrastar até zero marcaria como mudo um som que ela
 * só queria baixo. Mudo é a chave; volume é quanto. Aqui os dois calam, mas
 * cada um continua guardando a sua própria resposta.
 */
export function podeSoar(preferencias: PreferenciasDeSom, tipo: TipoDeAlerta): boolean {
  if (preferencias.mudo) return false
  if (preferencias.volume <= 0) return false
  return preferencias.eventos[tipo] !== false
}

/**
 * O ganho mestre, a partir do volume.
 *
 * **Curva quadrática, e não o valor cru.** O ouvido responde a intensidade de
 * forma aproximadamente logarítmica: um deslizante linear parece não fazer nada
 * na metade de cima e desabar de repente perto do fim. Elevar ao quadrado é a
 * aproximação barata que faz o meio do curso soar como meio.
 */
export function ganhoDoVolume(volume: number): number {
  const v = normalizarVolume(volume)
  return v * v
}

/**
 * O próximo volume, a partir de um giro da roda do mouse.
 *
 * **Só é chamado com o controle focado** — ver `SomDosAlertas`. Roda que muda
 * valor só por estar por baixo do ponteiro rouba a rolagem da página, e é o
 * jeito clássico de deixar um painel de ajustes impossível de percorrer.
 *
 * Para cima aumenta. `deltaY` é negativo quando se gira para cima, então o
 * sinal é invertido de propósito: seguir o `deltaY` cru faria a roda baixar o
 * volume ao subir, que é o oposto do que qualquer controle de volume faz.
 *
 * **O passo da roda é maior que o do arraste, e de propósito.** O deslizante
 * anda de 1 em 1 porque o dedo pede precisão; um entalhe de roda é um gesto
 * grosso, e 1% por entalhe exigiria cem giros para atravessar a escala. Dois
 * por cento atravessa em cinquenta e continua fino o bastante para não formar
 * degrau visível.
 */
export function proximoVolumeDaRoda(atual: number, deltaY: number, passo = 0.02): number {
  if (deltaY === 0) return normalizarVolume(atual)
  const direcao = deltaY < 0 ? 1 : -1
  const bruto = normalizarVolume(atual) + direcao * passo
  // Arredonda no centésimo: somar float repetidamente acumula ruído
  // (0.1 + 0.2 = 0.30000000000000004), e esse ruído viraria "71%" onde deveria
  // haver "70%" na tela.
  return normalizarVolume(Math.round(bruto * 100) / 100)
}

/** Lê do armazenamento, sem nunca lançar. */
export function lerPreferencias(armazenamento: Storage | null = seguro()): PreferenciasDeSom {
  if (!armazenamento) return mesclarPreferencias(null)

  try {
    const bruto = armazenamento.getItem(CHAVE_DO_SOM)
    return mesclarPreferencias(bruto ? JSON.parse(bruto) : null)
  } catch {
    // Modo privado, cota estourada, JSON quebrado. Silêncio no console é ruim,
    // mas derrubar o boot do Hub por causa de uma preferência de som é pior.
    return mesclarPreferencias(null)
  }
}

export function gravarPreferencias(
  preferencias: PreferenciasDeSom,
  armazenamento: Storage | null = seguro()
): void {
  if (!armazenamento) return
  try {
    armazenamento.setItem(CHAVE_DO_SOM, JSON.stringify(preferencias))
  } catch {
    // Idem: não gravou, a preferência vale só nesta sessão.
  }
}

/** `localStorage` pode nem existir — `vitest` roda em node, sem DOM. */
function seguro(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
