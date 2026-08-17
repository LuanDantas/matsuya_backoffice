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
  /**
   * Quantidade de itens fora do prazo nesta seção.
   *
   * Vira um **chip com texto**, e não um segundo número ao lado da contagem.
   * Dois círculos com números diferentes no mesmo cabeçalho — um preto, um
   * vermelho — obrigam a decifrar qual conta o quê a cada olhada; a maioria
   * lia o vermelho como o total e se assustava à toa.
   *
   * Pulsa **só** enquanto for maior que zero, e para com
   * `prefers-reduced-motion`: animação infinita na visão periférica de quem
   * trabalha seis horas é cansaço, não alerta.
   */
  alertas?: number
  /**
   * Torna o chip de alerta clicável, para filtrar a seção pelos atrasados.
   *
   * Sem isto ele é só um rótulo — que é o certo onde não há o que filtrar, no
   * painel de exceções e na grade da expedição.
   */
  aoFiltrarAlertas?: () => void
  /** Se o filtro está ligado. Sem efeito sem `aoFiltrarAlertas`. */
  filtrandoAlertas?: boolean
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
  alertas = 0,
  aoFiltrarAlertas,
  filtrandoAlertas = false,
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

          {alertas > 0 &&
            (aoFiltrarAlertas ? (
              /*
                Botão, e não o rótulo com um `onClick` pendurado: quem chega
                por teclado precisa alcançá-lo, e um leitor de tela precisa
                anunciar que aquilo alterna alguma coisa. `aria-pressed` diz o
                estado; o texto diz o que a pressão faz.
              */
              <button
                type="button"
                className="ui-painel__alerta"
                aria-pressed={filtrandoAlertas}
                onClick={aoFiltrarAlertas}
                title={
                  filtrandoAlertas
                    ? `Mostrar todos os pedidos de ${titulo}`
                    : `Mostrar só os atrasados de ${titulo}`
                }
              >
                <Icone nome="relogio" tamanho={13} aria-hidden="true" />
                <span className="num">{alertas}</span>
                {alertas === 1 ? 'atrasado' : 'atrasados'}
                {filtrandoAlertas && <Icone nome="x" tamanho={13} aria-hidden="true" />}
              </button>
            ) : (
              <span className="ui-painel__alerta" role="status">
                <Icone nome="relogio" tamanho={13} aria-hidden="true" />
                <span className="num">{alertas}</span>
                {alertas === 1 ? 'atrasado' : 'atrasados'}
              </span>
            ))}
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
