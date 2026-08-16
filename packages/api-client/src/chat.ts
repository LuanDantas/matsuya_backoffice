import type { ApiClient } from './cliente'

/**
 * Chat do pedido.
 *
 * `authorType` distingue quem falou. O front nunca infere isso do id do
 * usuário: uma mensagem de sistema não tem autor, e comparar ids faria toda
 * mensagem automática aparecer como se fosse do cliente.
 */

export interface MensagemDoChat {
  id: number
  orderId: number
  authorType: 'staff' | 'customer' | 'system'
  authorUserId: number | null
  authorLabel: string | null
  body: string
  hidden: boolean
  readByStaff: boolean
  createdAt: string
}

export function criarApiDeChat(cliente: ApiClient) {
  return {
    listar: (orderId: number, signal?: AbortSignal) =>
      cliente.requisitar<{ messages: MensagemDoChat[] }>(`/orders/${orderId}/chat`, { signal }),

    enviar: (orderId: number, body: string) =>
      cliente.requisitar<{ message: MensagemDoChat; seq: number }>(
        `/orders/${orderId}/chat`,
        { metodo: 'POST', corpo: { body } }
      ),

    marcarLidas: (orderId: number, upToId: number) =>
      cliente.requisitar<{ ok: boolean }>(`/orders/${orderId}/chat/read`, {
        metodo: 'POST',
        corpo: { upToId },
      }),

    naoLidas: (unityId: number, signal?: AbortSignal) =>
      cliente.requisitar<{ byOrder: Record<string, number> }>(
        `/stores/${unityId}/chat/unread`,
        { signal }
      ),
  }
}

export type ApiDeChat = ReturnType<typeof criarApiDeChat>
