import type { SVGProps } from 'react'

/**
 * A marca do produto — uma comanda com visto.
 *
 * ## Por que não um ícone do conjunto
 *
 * `Icone` desenha um traço só, 1.75px, sem preenchimento: é a linguagem certa
 * para os 27 símbolos de interface, que precisam ser lidos em 14px ao lado de
 * texto e mudar de cor conforme o estado. Uma marca tem trabalho diferente —
 * ela é o único desenho da tela que não muda, e precisa se sustentar sozinha no
 * ícone da aba, com 16px e sem legenda.
 *
 * Daí ser um objeto à parte: crachá preenchido, duas cores, formas fechadas.
 *
 * ## Por que uma comanda
 *
 * É o objeto que o produto inteiro gira em torno: o pedido que chega, é aceito,
 * vira papel na cozinha e sai pela porta. O visto diz o que o gestor faz com
 * ele. Um carrinho ou um prato seriam de outro produto — venda e cardápio, não
 * operação.
 *
 * A borda serrilhada do rodapé é o que a faz ler como comanda e não como folha.
 * Em 16px ela vira uma ondulação, mas a silhueta continua sendo a de um papel
 * de impressora térmica.
 *
 * A comanda ocupa quase toda a largura do crachá. Numa primeira versão ela era
 * estreita, e em 16px sobrava vermelho dos dois lados: o que se via era um
 * quadrado com um risco no meio, não um papel.
 */
export function Marca({ tamanho = 32, ...resto }: SVGProps<SVGSVGElement> & { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...resto}
    >
      {/* O crachá segue `currentColor`, então herda a cor de marca de quem o
          usa — e acompanha o tema sem uma segunda declaração. */}
      <rect width="32" height="32" rx="8" fill="currentColor" />

      {/* A comanda. `--superficie-1` e não branco cravado: no tema escuro o
          papel deixa de ser branco junto com o resto da interface. */}
      <path
        d="M7.5 8a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v19l-2.83-2-2.83 2-2.84-2-2.83 2-2.83-2L7.5 27z"
        fill="var(--superficie-1, #ffffff)"
      />

      {/* O visto, no corpo da comanda. Traço grosso e pontas arredondadas para
          não sumir quando o ícone cai para 16px. */}
      <path
        d="m11.9 15.7 2.8 2.8 5.4-5.9"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
