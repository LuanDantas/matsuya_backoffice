import { useRef, type ReactNode } from 'react'
import { Botao } from './Botao'
import { useCamadaModal } from './useCamadaModal'

/**
 * Painel lateral, entrando pela direita.
 *
 * Escolhido no lugar de um modal centrado por um motivo operacional: o quadro
 * continua visível ao lado. O operador abre um pedido sem perder a fila de
 * vista, e vê um pedido novo chegar enquanto lê o detalhe de outro — que num
 * modal centrado ficaria escondido atrás do painel.
 *
 * O véu escurece o fundo o suficiente para o painel ficar em primeiro plano,
 * mas não tanto que o quadro deixe de ser legível. É a diferença entre "o resto
 * está inativo" e "o resto sumiu".
 */

export interface PropsDoDrawer {
  aberto: boolean
  titulo: ReactNode
  /** Linha de metadados sob o título. */
  subtitulo?: ReactNode
  aoFechar: () => void
  /** Ações fixas no rodapé; rolam nunca, ficam sempre alcançáveis. */
  rodape?: ReactNode
  largura?: 'medio' | 'largo'
  /** Rótulo do diálogo para leitor de tela, quando o título não é texto. */
  rotuloAcessivel: string
  children: ReactNode
}

export function Drawer({
  aberto,
  titulo,
  subtitulo,
  aoFechar,
  rodape,
  largura = 'medio',
  rotuloAcessivel,
  children,
}: PropsDoDrawer) {
  const painel = useRef<HTMLDivElement>(null)
  useCamadaModal(aberto, painel, aoFechar)

  if (!aberto) return null

  return (
    <div
      className="ui-drawer__veu"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div
        ref={painel}
        className="ui-drawer"
        data-largura={largura}
        role="dialog"
        aria-modal="true"
        aria-label={rotuloAcessivel}
        tabIndex={-1}
      >
        <header className="ui-drawer__cabecalho">
          <div className="ui-drawer__titulo">
            {titulo}
            {subtitulo && <div className="ui-drawer__subtitulo">{subtitulo}</div>}
          </div>

          <Botao enfase="fantasma" icone="x" onClick={aoFechar}>
            <span className="ui-visualmente-oculto">Fechar</span>
          </Botao>
        </header>

        <div className="ui-drawer__corpo">{children}</div>

        {rodape && <footer className="ui-drawer__rodape">{rodape}</footer>}
      </div>
    </div>
  )
}
