import type { ApiClient } from './cliente'

/**
 * Dispositivos de impressão e saúde das impressoras.
 *
 * O que estas rotas resolvem é uma pergunta que hoje ninguém consegue fazer:
 * **a impressora daquela loja está funcionando?** Sem elas, a resposta chega
 * pelo pedido que não saiu — sempre tarde, e sempre pela cozinha reclamando.
 *
 * Exigem `orders:read`. É a mesma permissão do quadro, e de propósito: quem
 * opera a loja precisa ver por que a comanda não saiu, sem depender de alguém
 * do Corporate.
 */

export interface ImpressoraDoDispositivo {
  nome: string
  papel: 'cozinha' | 'balcao' | 'etiqueta'
  online: boolean
}

export interface DispositivoDeImpressao {
  id: string
  nome: string
  /** Os primeiros caracteres do token, para identificar sem nunca exibi-lo. */
  tokenPrefix: string
  lastSeenAt: string | null
  /** `false` depois de dois minutos sem heartbeat. */
  online: boolean
  impressoras: ImpressoraDoDispositivo[]
}

/**
 * O que o registro devolve.
 *
 * `token` aparece **uma única vez**. Não há como recuperá-lo depois: quem
 * perder registra outro e revoga este. A tela precisa deixar isso evidente
 * antes de o operador fechar o diálogo.
 */
export interface DispositivoRegistrado {
  id: string
  nome: string
  token: string
  aviso: string
}

export interface ResumoDeImpressao {
  dias: number
  total: number
  porStatus: Record<string, number>
  /** Entre 0 e 1. Zero quando não houve impressão nenhuma — ausência de dado. */
  taxaDeFalha: number
}

export function criarApiDeImpressao(cliente: ApiClient) {
  return {
    dispositivos: (unityId: number, signal?: AbortSignal) =>
      cliente.requisitar<DispositivoDeImpressao[]>(`/stores/${unityId}/print-devices`, {
        signal,
      }),

    registrar: (unityId: number, nome: string) =>
      cliente.requisitar<DispositivoRegistrado>(`/stores/${unityId}/print-devices`, {
        metodo: 'POST',
        corpo: { nome },
      }),

    revogar: (unityId: number, deviceId: string) =>
      cliente.requisitar<{ revogado: boolean }>(
        `/stores/${unityId}/print-devices/${deviceId}`,
        { metodo: 'DELETE' }
      ),

    resumo: (unityId: number, dias = 7, signal?: AbortSignal) =>
      cliente.requisitar<ResumoDeImpressao>(`/stores/${unityId}/impressao/resumo`, {
        query: { dias },
        signal,
      }),
  }
}

export type ApiDeImpressao = ReturnType<typeof criarApiDeImpressao>
