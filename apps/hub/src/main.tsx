import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { carregarConfigDeRuntime } from './app/config'
import './app/estilos.css'

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
