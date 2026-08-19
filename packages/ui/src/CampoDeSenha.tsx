import { useState, type InputHTMLAttributes, type Ref } from 'react'
import { Icone } from './Icone'
import { CampoLinha } from './primitivos'

/**
 * Campo de senha com o botão de ver o que foi digitado.
 *
 * ## Por que ele existe
 *
 * O par campo + olho estava escrito duas vezes no Hub — na tela de entrada e na
 * de recuperar senha — e o diálogo de trocar a senha seria a terceira, com três
 * campos dentro. Cada cópia carrega a mesma acessibilidade miúda: `aria-pressed`,
 * rótulo que muda com o estado, e o botão ancorado no topo do input em vez de
 * centralizado. Uma dessas cópias envelheceria sem ninguém notar.
 *
 * ## Ver a senha não é enfeite
 *
 * Teclado de tablete erra, e a alternativa a mostrar é apagar tudo e digitar de
 * novo às cegas — com o salão cheio, às onze da noite. O rótulo do botão muda
 * junto com o ícone porque quem usa leitor de tela precisa do **estado**, não
 * só da ação: "Mostrar a senha" num botão já apertado seria mentira.
 *
 * ## Quando NÃO usar o olho
 *
 * `revelavel={false}` para o campo de senha atual numa troca: ninguém precisa
 * reler o que já sabe, e um olho a menos é um alvo a menos entre os três campos.
 */

export interface PropsDoCampoDeSenha
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id: string
  rotulo: string
  ajuda?: string
  erro?: string
  obrigatorio?: boolean
  ref?: Ref<HTMLInputElement>
  /** Padrão `true`. Desligue onde revelar não ajuda. */
  revelavel?: boolean
}

export function CampoDeSenha({
  revelavel = true,
  ...resto
}: PropsDoCampoDeSenha) {
  const [visivel, definirVisivel] = useState(false)

  return (
    <div className="ui-senha">
      <CampoLinha type={visivel ? 'text' : 'password'} {...resto} />

      {revelavel && (
        <button
          type="button"
          className="ui-senha__olho"
          onClick={() => definirVisivel((v) => !v)}
          aria-label={visivel ? 'Ocultar a senha' : 'Mostrar a senha'}
          aria-pressed={visivel}
          aria-controls={resto.id}
        >
          <Icone nome={visivel ? 'olho-cortado' : 'olho'} tamanho={20} />
        </button>
      )}
    </div>
  )
}
