import type { ApiClient } from './cliente'

/**
 * Cardápio da unidade — leitura.
 *
 * A API não expõe escrita aqui: pausar item vive na rota legada, restrita a
 * admin e manager. O Hub mostra o estado e não oferece um botão que a maioria
 * dos operadores não pode usar.
 */

export interface ItemDoCardapio {
  id: number
  name: string
  price: number
  active: boolean
  categoryName: string
}

export function criarApiDeCardapio(cliente: ApiClient) {
  return {
    daUnidade: (unityId: number, signal?: AbortSignal) =>
      cliente.requisitar<{ items: ItemDoCardapio[]; paused: number }>(
        `/stores/${unityId}/catalog`,
        { signal }
      ),
  }
}
