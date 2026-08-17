import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { carregarConfigDeRuntime } from './app/config'
import './app/estilos.css'

/**
 * O navegador não restaura o scroll.
 *
 * O padrão é `auto`: ao recarregar, o navegador devolve a página à posição em
 * que ela estava — inclusive a rolagem horizontal do quadro. O efeito é abrir
 * o Hub com as colunas já deslocadas, como se alguém tivesse arrastado, e a
 * primeira coluna cortada pela borda.
 *
 * Num aplicativo de uma tela só isso nunca ajuda: não há histórico de páginas
 * para voltar, e a posição que ele restaura é a de outro turno. Recarregar tem
 * de começar no começo.
 */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

/**
 * A configuração de runtime é carregada **antes** de montar.
 *
 * Montar primeiro e reconfigurar depois faria a primeira requisição sair para
 * a URL errada — que em desenvolvimento é inofensivo e num tablet de loja é o
 * quadro que não abre.
 */
void carregarConfigDeRuntime().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
