import { useRef, type ReactNode } from 'react'
import { Botao } from './Botao'
import { useCamadaModal } from './useCamadaModal'

/**
 * Diálogo modal.
 *
 * O que costuma faltar num modal feito às pressas, e que aqui é obrigatório:
 *
 * - **Esc fecha.** Toda tela que prende o usuário precisa de saída.
 * - **O foco entra e não escapa.** Sem isso, um Tab leva o cursor para trás do
 *   véu, e quem navega por teclado fica preso num limbo invisível.
 * - **O foco volta para onde estava** ao fechar. Fechar um modal e o foco
 *   reiniciar no topo da página é como se perde o lugar numa lista longa.
 * - **`aria-modal` e `role="dialog"`**, para o leitor de tela anunciar que o
 *   resto da página ficou inerte.
 * - **Véu opaco o bastante** para o fundo parar de competir — 66% aqui, acima
 *   dos 40% mínimos, porque o quadro atrás é denso e colorido.
 */

export interface PropsDoModal {
  aberto: boolean
  titulo: string
  /** Linha de apoio sob o título, opcional. */
  descricao?: string
  aoFechar: () => void
  /** Ações do rodapé. A primária vai à direita. */
  rodape?: ReactNode
  /** Largura máxima. `estreito` para confirmações, `largo` para detalhe. */
  largura?: 'estreito' | 'largo'
  children: ReactNode
}

export function Modal({
  aberto,
  titulo,
  descricao,
  aoFechar,
  rodape,
  largura = 'estreito',
  children,
}: PropsDoModal) {
  const painel = useRef<HTMLDivElement>(null)
  useCamadaModal(aberto, painel, aoFechar)

  if (!aberto) return null

  return (
    <div className="ui-modal__veu" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        ref={painel}
        className="ui-modal"
        data-largura={largura}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-titulo"
        aria-describedby={descricao ? 'ui-modal-descricao' : undefined}
        tabIndex={-1}
      >
        <header className="ui-modal__cabecalho">
          <div>
            <h2 id="ui-modal-titulo">{titulo}</h2>
            {descricao && (
              <p id="ui-modal-descricao" className="ui-modal__descricao">
                {descricao}
              </p>
            )}
          </div>
          <Botao enfase="fantasma" icone="x" onClick={aoFechar} aria-label="Fechar">
            <span className="ui-visualmente-oculto">Fechar</span>
          </Botao>
        </header>

        <div className="ui-modal__corpo">{children}</div>

        {rodape && <footer className="ui-modal__rodape">{rodape}</footer>}
      </div>
    </div>
  )
}
