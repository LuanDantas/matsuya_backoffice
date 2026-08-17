import { createApiClient, type ApiClient } from '@matsuya/api-client'
import { config } from '../app/config'

/**
 * A fábrica única de cliente HTTP do Hub.
 *
 * ## O defeito que ela corrige
 *
 * `createApiClient` sempre teve o gancho `aoNaoAutorizar`, chamado em todo 401
 * — e **ninguém nunca o passou**. Os oito pontos que criavam cliente no Hub
 * passavam só `baseUrl` e `obterToken`, então o 401 era tratado num lugar só:
 * a verificação de `/auth/me` no boot.
 *
 * O resultado no balcão: se o token vencia com o app aberto, nada deslogava. O
 * quadro, o farol, o chat, o cardápio e toda ação de pedido recebiam 401 e
 * mostravam "Erro inesperado do servidor". O operador ficava clicando numa
 * parede sem entender, e só saía disso recarregando a página — se soubesse.
 *
 * ## Por que um registro de módulo e não um parâmetro
 *
 * Passar o callback em cada chamada exigiria que os oito pontos conhecessem a
 * sessão, e três deles são hooks que não a recebem. Pior: bastaria alguém
 * esquecer em um lugar para o defeito voltar naquela tela, e ele é silencioso.
 *
 * Aqui o caminho é único: quem quiser cliente HTTP no Hub passa por esta
 * função, e ela sempre liga o gancho. `useSessao` registra o que fazer.
 */

let aoExpirar: (() => void) | null = null

/** Chamado uma vez por `useSessao`. */
export function registrarExpiracaoDeSessao(callback: () => void): void {
  aoExpirar = callback
}

/**
 * Dispara a expiração fora do caminho HTTP.
 *
 * Existe para o socket: um handshake recusado por token vencido não passa por
 * `fetch` nenhum, então sem isto a única sessão que o Hub não conseguiria
 * encerrar seria justamente a que o servidor já recusou.
 */
export function expirarSessao(): void {
  aoExpirar?.()
}

export function criarCliente(obterToken: () => string | null): ApiClient {
  return createApiClient({
    baseUrl: config.apiBaseUrl,
    obterToken,
    /*
     * Indireção pelo `aoExpirar` atual, e não pela referência capturada: o
     * cliente costuma viver num `useMemo` com dependências estáveis, e um
     * callback capturado no primeiro render continuaria apontando para a
     * primeira sessão depois de uma troca de usuário.
     */
    aoNaoAutorizar: () => aoExpirar?.(),
  })
}
