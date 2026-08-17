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
  /**
   * Fecha o âmbar um degrau, para os últimos minutos do prazo.
   *
   * Só tem efeito em `aviso` — nos outros tons não há o que apertar, e o
   * atributo é ignorado.
   */
  aperto?: boolean
  /**
   * Há um prazo correndo por trás deste texto.
   *
   * Liga o reflexo que atravessa a faixa. É o que dá presença ao tempo: o
   * "8min" fica parado por sessenta segundos, e faixa parada não parece estar
   * contando nada. Fica de fora do atraso — lá o vermelho já é o mais forte da
   * tela — e de tudo que não tem relógio, porque brilho em tudo vira ruído.
   */
  contando?: boolean
  children: ReactNode
}

export function PilulaDeEstado({
  tom = 'neutro',
  icone,
  aperto = false,
  contando = false,
  children,
}: PropsDaPilula) {
  return (
    <p
      className="ui-pilula"
      data-tom={tom}
      data-aperto={aperto || undefined}
      data-contando={contando || undefined}
    >
      {icone && <Icone nome={icone} tamanho={14} />}
      <span>{children}</span>
    </p>
  )
}
