import type { ReactNode } from 'react'
import { Icone, type NomeDoIcone } from './Icone'

/**
 * A faixa de estado do cartão — a linha que diz o que está acontecendo.
 *
 * Ocupa a largura toda de propósito. Um chip pequeno num canto compete com o
 * número do pedido pela atenção e perde; uma faixa não compete, ela ocupa uma
 * fatia própria do cartão.
 *
 * `aviso` é o âmbar da contagem regressiva: prazo correndo, ainda dentro. Vira
 * `critico` quando estoura — e é a **mudança** de cor, não a cor em si, que o
 * operador percebe pelo canto do olho.
 *
 * O tom `critico` é o único elemento saturado da interface inteira, e é o que
 * faz o atraso ser visto de dois metros. **Se um segundo estado ganhar
 * preenchimento sólido, o atraso deixa de se destacar** — o valor dele vem
 * inteiramente de ser o único. Resistir a promover outros tons é a regra mais
 * fácil de quebrar e a mais cara de recuperar.
 */

export type TomDaPilula = 'neutro' | 'aviso' | 'sucesso' | 'perigo' | 'critico'

export interface PropsDaPilula {
  tom?: TomDaPilula
  icone?: NomeDoIcone
  children: ReactNode
}

export function PilulaDeEstado({ tom = 'neutro', icone, children }: PropsDaPilula) {
  return (
    <p className="ui-pilula" data-tom={tom}>
      {icone && <Icone nome={icone} tamanho={14} />}
      <span>{children}</span>
    </p>
  )
}
