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
}

export const config: ConfigDoHub = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1',
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001',
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
