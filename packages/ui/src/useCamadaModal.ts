import { useEffect, type RefObject } from 'react'

/**
 * O comportamento que toda camada sobreposta precisa ter.
 *
 * Extraído do `Modal` quando o `Drawer` apareceu, porque são exatamente as
 * mesmas quatro regras — e a segunda cópia de uma armadilha de foco é a que
 * esquece de devolver o foco.
 *
 * 1. **Esc fecha.** Toda tela que prende o usuário precisa de saída.
 * 2. **O foco entra e não escapa.** Sem isso um Tab leva o cursor para trás do
 *    véu, e quem navega por teclado fica preso num limbo invisível.
 * 3. **O foco volta para onde estava.** Fechar e o cursor reiniciar no topo da
 *    página é como se perde o lugar numa lista longa.
 * 4. **O fundo não rola.** Rolar o quadro por baixo faz o operador perder a
 *    referência do pedido que estava olhando.
 */

const SELETOR_FOCAVEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useCamadaModal(
  aberta: boolean,
  painel: RefObject<HTMLElement | null>,
  aoFechar: () => void
) {
  useEffect(() => {
    if (!aberta) return

    const focoAnterior = document.activeElement as HTMLElement | null

    // O primeiro foco vai para o painel, não para o primeiro botão: numa
    // confirmação destrutiva, começar com o foco em "Confirmar" é convite para
    // um Enter distraído.
    painel.current?.focus()

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.stopPropagation()
        aoFechar()
        return
      }

      if (evento.key !== 'Tab') return

      const focaveis = painel.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)
      if (!focaveis || focaveis.length === 0) return

      const primeiro = focaveis[0]!
      const ultimo = focaveis[focaveis.length - 1]!

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', aoTeclar, true)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', aoTeclar, true)
      document.body.style.overflow = overflowAnterior
      focoAnterior?.focus()
    }
  }, [aberta, aoFechar, painel])
}
