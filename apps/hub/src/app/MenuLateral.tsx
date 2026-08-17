import { useEffect, useState } from 'react'
import { Icone } from '@matsuya/ui'
import { telasPermitidas, type Tela } from './telas'

/**
 * Navegação lateral, recolhível.
 *
 * Recolhido por padrão: o quadro é a razão de o Hub existir, e cada pixel que
 * o menu ocupa é uma coluna a menos de pedido. Expandido mostra rótulo, para
 * quem ainda não decorou os ícones — e a escolha fica guardada por tablet,
 * porque quem decorou não quer reexpandir todo turno.
 *
 * Ícone sozinho é ruim de descobrir; por isso, mesmo recolhido, cada item
 * carrega `aria-label` completo e um balão de dica à direita. Um trilho de
 * ícones sem rótulo acessível é uma barra de navegação que só serve para quem
 * já sabe onde as coisas estão.
 *
 * O balão sai à direita, e não abaixo: o trilho é estreito e vertical, e um
 * balão abaixo cairia sobre o próximo item — justamente o que a pessoa está
 * tentando comparar.
 */

const CHAVE = 'matsuya.hub.menu-expandido'

export function MenuLateral({
  permissoes,
  tela,
  aoNavegar,
  naoLidas,
}: {
  permissoes: ReadonlySet<string>
  tela: Tela
  aoNavegar: (tela: Tela) => void
  /** Total de mensagens não lidas, para o distintivo de Conversas. */
  naoLidas: number
}) {
  const [expandido, definirExpandido] = useState(
    () => localStorage.getItem(CHAVE) === '1'
  )

  useEffect(() => {
    localStorage.setItem(CHAVE, expandido ? '1' : '0')
  }, [expandido])

  const itens = telasPermitidas(permissoes)

  return (
    <nav
      className="menu"
      data-expandido={expandido || undefined}
      aria-label="Seções do Order Hub"
    >
      <button
        type="button"
        className="menu__alternar"
        onClick={() => definirExpandido((v) => !v)}
        aria-expanded={expandido}
        aria-label={expandido ? 'Recolher o menu' : 'Expandir o menu'}
        data-dica={expandido ? 'Recolher o menu' : 'Expandir o menu'}
        data-dica-lado="direita"
      >
        <Icone nome="menu" tamanho={20} />
        <span className="menu__rotulo">Menu</span>
      </button>

      <ul className="menu__lista">
        {itens.map((item) => {
          const corrente = item.tela === tela
          const distintivo = item.tela === 'conversas' && naoLidas > 0

          return (
            <li key={item.tela}>
              <button
                type="button"
                className="menu__item"
                aria-current={corrente ? 'page' : undefined}
                onClick={() => aoNavegar(item.tela)}
                // O rótulo acessível é sempre o completo, esteja o menu
                // recolhido ou não — o leitor de tela não vê o ícone.
                aria-label={item.descricao}
                /*
                  O balão traz a descrição, não o rótulo curto. Recolhido, o
                  rótulo já é a única coisa que falta — mas expandido ele está
                  ali do lado, e um balão repetindo a palavra que se acabou de
                  ler não ajuda ninguém.
                */
                data-dica={item.descricao}
                data-dica-lado="direita"
              >
                <span className="menu__icone">
                  <Icone nome={item.icone} tamanho={20} />
                  {distintivo && (
                    <span className="menu__distintivo num" aria-hidden="true">
                      {naoLidas > 9 ? '9+' : naoLidas}
                    </span>
                  )}
                </span>
                <span className="menu__rotulo">{item.rotulo}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
