import { useId, type ReactNode } from 'react'
import { Icone } from './Icone'

/**
 * Contêiner de coluna e de seção, com cabeçalho padronizado.
 *
 * Antes existiam três cabeçalhos diferentes na mesma tela — coluna do quadro,
 * painel de exceções e seção da grade —, cada um com sua tipografia e seu jeito
 * de mostrar a contagem. Três variações de uma mesma coisa fazem o olho tratar
 * cada uma como um objeto distinto, e o operador para de reconhecer o padrão.
 *
 * A contagem é um badge escuro, não um selo colorido: o número não é um estado,
 * é uma quantidade. Colorir quantidades gasta cor sem informar nada.
 */

export interface PropsDoPainel {
  titulo: string
  contagem?: number
  /** Chips à direita do título — usados pelo modo denso. */
  acessorio?: ReactNode
  /** Habilita o recolher. Só o modo Expedição usa. */
  recolhivel?: boolean
  recolhido?: boolean
  aoAlternar?: () => void
  /** Cor de acento na borda esquerda, para o painel de exceções. */
  acento?: 'nenhum' | 'urgente'
  children: ReactNode
}

export function PainelDeSecao({
  titulo,
  contagem,
  acessorio,
  recolhivel = false,
  recolhido = false,
  aoAlternar,
  acento = 'nenhum',
  children,
}: PropsDoPainel) {
  const idDoCorpo = useId()

  return (
    <section className="ui-painel" data-acento={acento} data-recolhido={recolhido || undefined}>
      <header className="ui-painel__cabecalho">
        <h2 className="ui-painel__titulo">
          {titulo}
          {typeof contagem === 'number' && (
            <span className="ui-painel__contagem num">{contagem}</span>
          )}
        </h2>

        <div className="ui-painel__acessorio">
          {acessorio}
          {recolhivel && (
            <button
              type="button"
              className="ui-painel__recolher"
              onClick={aoAlternar}
              aria-expanded={!recolhido}
              aria-controls={idDoCorpo}
            >
              <Icone
                nome="seta-direita"
                tamanho={16}
                rotulo={recolhido ? `Expandir ${titulo}` : `Recolher ${titulo}`}
              />
            </button>
          )}
        </div>
      </header>

      {/* Escondido por atributo, não desmontado: recolher e expandir uma seção
          não pode custar uma remontagem de trinta cartões. */}
      <div className="ui-painel__corpo" id={idDoCorpo} hidden={recolhido}>
        {children}
      </div>
    </section>
  )
}
