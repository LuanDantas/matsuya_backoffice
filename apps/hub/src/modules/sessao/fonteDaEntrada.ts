import { useEffect } from 'react'

/**
 * Carrega Inter e Poppins — e **só nas telas de entrada**.
 *
 * ## Por que não no `index.html`
 *
 * O `tokens.css` registra a premissa: "sem fonte de rede — o Hub precisa abrir
 * com a internet ruim ou ausente, e uma fonte que não carrega é texto invisível
 * na primeira pintura, exatamente quando o operador precisa ler o pedido". Um
 * `<link>` no HTML valeria para o quadro também, e o quadro é justamente a tela
 * que não pode depender de rede para desenhar texto.
 *
 * A entrada é diferente: ela **já** depende da rede para funcionar — sem API
 * não há login. Uma fonte a mais ali não tira nada que já não estivesse fora.
 *
 * Injetado no efeito, então: a requisição sai quando a tela de entrada monta e
 * nunca quando o operador está trabalhando. Com `display=swap` o texto aparece
 * imediatamente na pilha do sistema e troca depois — nunca invisível.
 *
 * A tag não é removida na desmontagem de propósito: depois do login a fonte já
 * está em cache, e tirá-la faria a tela piscar se a pessoa saísse e voltasse.
 */

const ID = 'fonte-da-entrada'

const URL =
  'https://fonts.googleapis.com/css2' +
  '?family=Inter:wght@400;500;600;700' +
  '&family=Poppins:wght@600;700' +
  '&display=swap'

export function useFonteDaEntrada(): void {
  useEffect(() => {
    if (document.getElementById(ID)) return

    const conexao = document.createElement('link')
    conexao.rel = 'preconnect'
    conexao.href = 'https://fonts.gstatic.com'
    conexao.crossOrigin = 'anonymous'
    document.head.appendChild(conexao)

    const folha = document.createElement('link')
    folha.id = ID
    folha.rel = 'stylesheet'
    folha.href = URL
    document.head.appendChild(folha)
  }, [])
}
