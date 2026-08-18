/**
 * Configuração de runtime, não de build.
 *
 * Lida de `public/config.json` na subida, e não de `import.meta.env`: o Hub é
 * instalado em tablets de loja, e trocar a URL da API não pode exigir um build
 * novo por unidade. O valor de `import.meta.env` fica só como semente para o
 * desenvolvimento local.
 */
export interface ConfigDoHub {
  apiBaseUrl: string
  socketUrl: string
  /**
   * Agente local de impressão, ex.: `http://localhost:9100`. Ausente ⇒ o Hub
   * cai para a impressão pelo navegador, que exige alguém confirmar o diálogo.
   */
  urlDoAgenteDeImpressao?: string
  /** Largura da bobina da impressora térmica da loja. */
  larguraDoPapel?: 58 | 80
  /**
   * Quando a comanda sai sozinha no aceite.
   *
   * `agente`  — só quando há agente local (padrão). Sem agente, a impressão
   *             cairia no diálogo do navegador, que é modal e trava a tela até
   *             alguém clicar — o oposto de automático.
   * `sempre`  — mesmo sem agente. Só faz sentido onde há alguém no computador.
   * `nunca`   — sempre manual, pelo botão do detalhe do pedido.
   */
  impressaoAutomatica?: 'agente' | 'sempre' | 'nunca'
  /**
   * O estilo do mapa de "Em rota".
   *
   * Configurável e não cravado no código porque o provedor é a peça mais frágil
   * desta tela: o padrão é o OpenFreeMap, gratuito e liberado para uso
   * comercial, mas é uma instância pública mantida por uma pessoa. Se um dia
   * sair do ar, apontar para outro provedor — ou para uma instância própria —
   * é editar um arquivo de configuração, não recompilar o Hub.
   *
   * Aceita qualquer estilo no formato do MapLibre.
   */
  estiloDoMapa?: string
}

export const config: ConfigDoHub = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1',
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001',
  larguraDoPapel: 80,
}

/** Sobrescreve com o que estiver em `public/config.json`, se existir. */
export async function carregarConfigDeRuntime(): Promise<void> {
  try {
    const resposta = await fetch('/config.json', { cache: 'no-store' })
    if (!resposta.ok) return
    Object.assign(config, await resposta.json())
  } catch {
    // Sem config.json: segue com os valores de desenvolvimento. Um tablet que
    // não sobe porque faltou um arquivo opcional seria pior.
  }
}
