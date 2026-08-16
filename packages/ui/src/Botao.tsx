import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icone, type NomeDoIcone } from './Icone'

/**
 * Botão.
 *
 * Três coisas que a operação de balcão impõe e que este componente garante:
 *
 * - **Altura mínima de 44 px, sempre.** Não há variante pequena. Um botão que
 *   o operador erra duas vezes custa mais tempo do que o espaço que economiza.
 * - **Estado de carregamento embutido.** Enquanto a requisição corre o botão
 *   fica desabilitado e mostra o giro; sem isso, o toque duplo em rede lenta
 *   manda a mesma transição duas vezes.
 * - **A largura não muda ao carregar.** O rótulo fica no lugar e o giro entra
 *   ao lado, para o dedo não perder o alvo no meio do gesto.
 */

export type EnfaseDoBotao = 'primaria' | 'secundaria' | 'destrutiva' | 'fantasma'

export interface PropsDoBotao extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  enfase?: EnfaseDoBotao
  carregando?: boolean
  icone?: NomeDoIcone
  /** Ocupa toda a largura disponível. */
  largo?: boolean
  children: ReactNode
}

export function Botao({
  enfase = 'secundaria',
  carregando = false,
  icone,
  largo = false,
  disabled,
  children,
  ...resto
}: PropsDoBotao) {
  const inativo = disabled || carregando

  return (
    <button
      type="button"
      data-enfase={enfase}
      data-largo={largo || undefined}
      data-carregando={carregando || undefined}
      className="ui-botao"
      disabled={inativo}
      // `aria-busy` avisa o leitor de tela que a ação está em curso; sem ele,
      // um botão desabilitado sem explicação parece um botão quebrado.
      aria-busy={carregando || undefined}
      {...resto}
    >
      {carregando ? (
        <span className="ui-botao__giro" aria-hidden="true" />
      ) : (
        icone && <Icone nome={icone} tamanho={18} />
      )}
      <span>{children}</span>
    </button>
  )
}
