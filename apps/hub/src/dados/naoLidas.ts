import type { MensagemDoChat } from '@matsuya/api-client'

/**
 * As não-lidas, somadas entre as lojas selecionadas.
 *
 * ## Por que este arquivo existe
 *
 * `Casca.tsx` tinha `const naoLidasTotal = 0` escrito à mão, com a justificativa
 * "sem endpoint agregado de não lidas por seleção", e `naoLidas={0}` em mais
 * dois lugares. O endpoint por loja existe; o que faltava era somar as N lojas
 * que o operador escolheu.
 *
 * ## A parte incômoda, dita de uma vez
 *
 * O servidor conta **só** mensagem de cliente não lida, e nada neste sistema
 * cria mensagem de cliente — o app do cliente não escreve, e a API só sabe
 * produzir `staff`. Então **agregar corretamente hoje dá zero**.
 *
 * O que muda é que o número passa a ser *calculado e verdadeiro* em vez de
 * *fixo e certo por coincidência*, e acende sozinho no dia em que houver quem
 * escreva do outro lado.
 *
 * A tentação é fazer a insígnia sair de zero contando mensagem de outro tablet.
 * **Não.** A próxima releitura do servidor — que conta só cliente — devolveria a
 * zero, e uma insígnia que aparece e some sem ninguém ter lido nada ensina o
 * operador a ignorar a insígnia para sempre. Ver `novidades` em
 * `useConversas.ts`: aquilo é outro número, local, que nunca vira contagem.
 */

/**
 * O que uma loja respondeu.
 *
 * `porPedido: null` significa que a **loja falhou** — distinto de `{}`, que é a
 * loja tendo respondido "nenhuma". Confundir os dois é como uma insígnia passa
 * a dizer 3 quando a realidade é 8.
 */
export interface LeituraDeLoja {
  unityId: number
  porPedido: Record<string, number> | null
}

export interface NaoLidas {
  porPedido: Map<number, number>
  total: number
  /** Lojas cuja leitura falhou. Reportadas, nunca contadas como zero. */
  lojasComFalha: number[]
}

export function agregarNaoLidas(leituras: readonly LeituraDeLoja[]): NaoLidas {
  const porPedido = new Map<number, number>()
  const lojasComFalha: number[] = []

  for (const leitura of leituras) {
    if (leitura.porPedido === null) {
      lojasComFalha.push(leitura.unityId)
      continue
    }

    for (const [orderId, quantidade] of Object.entries(leitura.porPedido)) {
      const id = Number(orderId)
      if (!Number.isInteger(id) || quantidade <= 0) continue
      // Id de pedido é único no sistema inteiro, então somar entre lojas nunca
      // colide — a soma é defensiva, não esperada.
      porPedido.set(id, (porPedido.get(id) ?? 0) + quantidade)
    }
  }

  return { porPedido, total: somar(porPedido), lojasComFalha }
}

export function somar(porPedido: ReadonlyMap<number, number>): number {
  let total = 0
  for (const n of porPedido.values()) total += n
  return total
}

/**
 * Conta uma mensagem que acabou de chegar pelo socket.
 *
 * **Só mensagem de cliente conta** — a mesma semântica do servidor. É isso que
 * faz a contagem local e a releitura do servidor concordarem, e portanto que a
 * insígnia se cure sozinha em vez de piscar.
 */
export function contarChegada(
  atual: ReadonlyMap<number, number>,
  orderId: number,
  mensagem: MensagemDoChat
): Map<number, number> {
  if (mensagem.authorType !== 'customer') return new Map(atual)

  const proxima = new Map(atual)
  proxima.set(orderId, (proxima.get(orderId) ?? 0) + 1)
  return proxima
}

/**
 * Zera um pedido depois de `marcarLidas` **ter respondido**.
 *
 * Não é para ser chamado otimisticamente: se a marcação falhar e a contagem já
 * tiver sido zerada, a insígnia volta na próxima releitura sem que ninguém
 * entenda por quê.
 */
export function zerarPedido(
  atual: ReadonlyMap<number, number>,
  orderId: number
): Map<number, number> {
  if (!atual.has(orderId)) return new Map(atual)
  const proxima = new Map(atual)
  proxima.delete(orderId)
  return proxima
}
