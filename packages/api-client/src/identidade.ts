import type { ApiClient } from './cliente'

/**
 * `/auth/me` — quem é o usuário e o que ele pode.
 *
 * O front usa isto para decidir o que **desenhar**. Quem decide o que é
 * permitido continua sendo a API, em toda requisição: esta resposta é
 * conveniência de interface, não autorização.
 */

export interface Identidade {
  user: { id: number; name: string; email: string }
  permissions: string[]
  dangerousPermissions: string[]
  scope: { network: boolean; unitIds: number[] }
  units: Array<{ id: number; name: string; lat: number | null; lng: number | null }>
  roles: Array<{
    key: string
    name: string
    scopeKind: 'network' | 'group' | 'unit'
    scopeId: number | null
    expiresAt: string | null
  }>
}

export function criarApiDeIdentidade(cliente: ApiClient) {
  return {
    eu: (signal?: AbortSignal) =>
      cliente.requisitar<Identidade>('/auth/me', { signal }),
  }
}
