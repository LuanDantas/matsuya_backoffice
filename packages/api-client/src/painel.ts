import type { ApiClient } from './cliente'

/**
 * Painel da unidade.
 *
 * Exige `reports:read`, que o atendente de balcão não tem — e é correto que não
 * tenha: aqui não se opera pedido, se lê número consolidado. O front precisa
 * **esconder** a entrada de navegação para quem não tem a permissão, em vez de
 * oferecê-la e deixar a API recusar.
 */

export interface PainelDaUnidade {
  operacao: {
    emAberto: number
    atrasados: number
    maisAntigoEm: string | null
  }
  mes: {
    atual: number
    /** Mesmo intervalo de dias no mês anterior, não o mês fechado. */
    mesmoPeriodoMesAnterior: number
  }
  avaliacoes: {
    media: number | null
    total: number
    comentarios: Array<{ id: number; nota: number; texto: string; em: string }>
  }
  catalogo: {
    pausados: number
    total: number
  }
}

export function criarApiDePainel(cliente: ApiClient) {
  return {
    daUnidade: (unityId: number, signal?: AbortSignal) =>
      cliente.requisitar<PainelDaUnidade>(`/stores/${unityId}/dashboard`, { signal }),
  }
}

export type ApiDePainel = ReturnType<typeof criarApiDePainel>
