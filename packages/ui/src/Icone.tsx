import type { SVGProps } from 'react'

/**
 * Conjunto de ícones em SVG, desenhado à mão sobre a grade de 24 px.
 *
 * Por que não uma biblioteca: o Hub precisa abrir sem rede, e o orçamento de
 * bundle dele existe para não virar o console da matriz. Um pacote de ícones
 * completo custa mais do que os oito traços que este produto realmente usa.
 *
 * Por que não emoji: emoji é renderizado pela fonte do sistema. O mesmo
 * caractere vira um desenho diferente em cada tablet, não aceita cor do tema e
 * não escala com o texto. Ícone de interface é elemento de marca, não conteúdo.
 *
 * Traço de 1,75 px e pontas arredondadas em todos, sem exceção: espessura
 * misturada é o que faz uma tela parecer montada com peças de origens
 * diferentes.
 */

export type NomeDoIcone =
  | 'check'
  | 'x'
  | 'relogio'
  | 'alerta'
  | 'moto'
  | 'sacola'
  | 'seta-direita'
  | 'seta-esquerda'
  | 'atualizar'
  | 'wifi'
  | 'wifi-cortado'
  | 'loja'
  | 'sair'
  | 'pessoa'
  | 'lupa'
  | 'tela-cheia'
  | 'casa'
  | 'balao'
  | 'lista'
  | 'engrenagem'
  | 'menu'
  | 'mapa'

const CAMINHOS: Record<NomeDoIcone, string> = {
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  moto: 'M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 15h8M14 6h3l2 6M6 12l3-6h5',
  sacola: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 0 1-8 0',
  'seta-direita': 'M5 12h14M13 5l7 7-7 7',
  'seta-esquerda': 'M19 12H5M11 19l-7-7 7-7',
  atualizar: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  wifi: 'M5 12.5a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M12 20h.01M1.5 9a17 17 0 0 1 21 0',
  'wifi-cortado': 'M1.5 9a17 17 0 0 1 6-4M12 20h.01M8.5 16a6 6 0 0 1 5.7-1.1M18.5 12a11 11 0 0 0-3.3-2M2 2l20 20',
  loja: 'M3 9V7l2-4h14l2 4v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0ZM5 11v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  pessoa: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  lupa: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  'tela-cheia': 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3',
  casa: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5M9.5 21v-6h5v6',
  balao: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.6-4.8A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z',
  lista: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  engrenagem: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  mapa: 'M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3ZM9 3v15M15 6v15',
}

export interface PropsDoIcone extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  nome: NomeDoIcone
  /** Em pixels. Acompanha o tamanho do texto ao lado, não um valor solto. */
  tamanho?: number
  /**
   * Texto para leitor de tela. Ausente ⇒ o ícone é decorativo e fica oculto —
   * que é o certo quando há rótulo visível ao lado.
   */
  rotulo?: string
}

export function Icone({ nome, tamanho = 20, rotulo, ...resto }: PropsDoIcone) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      focusable="false"
      {...resto}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  )
}
