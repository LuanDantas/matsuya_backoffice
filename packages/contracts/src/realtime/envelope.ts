import { z } from 'zod'
import { ORDER_STATUSES } from '../orders/status'

/**
 * Envelope de todo evento do namespace `/ops`.
 *
 * O `seq` é obrigatório e é o que sustenta a detecção de lacuna: o cliente
 * compara com o cursor que já tem. Sem ele, restaria confiar que a entrega
 * aconteceu — e é exatamente essa confiança que faz um pedido sumir do quadro.
 *
 * Validado com zod na chegada, e não apenas tipado. Um evento malformado vindo
 * do servidor é raro; um evento malformado vindo de um servidor de versão
 * diferente durante um deploy não é. Melhor descartar e re-sincronizar do que
 * escrever lixo no cache.
 */

export const resumoDoPedidoSchema = z.object({
  id: z.number(),
  code: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  version: z.number(),
  deliveryType: z.enum(['delivery', 'pickup']),
  paymentMethod: z.string(),
  paymentStatus: z.string(),
  total: z.number(),
  etaAt: z.string().nullable(),
  slaExpiresAt: z.string().nullable(),
  slaExpiredAt: z.string().nullable(),
  hasPartialCancellation: z.boolean(),
  createdAt: z.string().nullable(),
})

export type ResumoDoPedido = z.infer<typeof resumoDoPedidoSchema>

export const envelopeDeEventoSchema = z.object({
  type: z.string(),
  v: z.literal(1),
  seq: z.number().int().nonnegative(),
  unityId: z.number().int().positive(),
  occurredAt: z.string(),
  serverTime: z.string(),
  actor: z
    .object({ userId: z.number(), label: z.string() })
    .nullable(),
  data: z.unknown(),
})

export type EnvelopeDeEvento = z.infer<typeof envelopeDeEventoSchema>

export const mudancaDeStatusSchema = z.object({
  orderId: z.number(),
  version: z.number(),
  from: z.enum(ORDER_STATUSES),
  to: z.enum(ORDER_STATUSES),
  summary: resumoDoPedidoSchema,
})

export type MudancaDeStatus = z.infer<typeof mudancaDeStatusSchema>

/** Linha do diário, devolvida por `GET /stores/:id/orders/changes`. */
export const mudancaSchema = z.object({
  seq: z.number().int().nonnegative(),
  entityType: z.enum(['order', 'chat_message', 'catalog_item']),
  entityId: z.number(),
  op: z.enum(['created', 'updated', 'deleted']),
  version: z.number(),
  summary: z.record(z.unknown()),
  occurredAt: z.string(),
})

export type Mudanca = z.infer<typeof mudancaSchema>

export const respostaDeMudancasSchema = z.object({
  changes: z.array(mudancaSchema),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  /** `true` quando o intervalo pedido não pode ser completado com honestidade. */
  snapshotRequired: z.boolean(),
})

export type RespostaDeMudancas = z.infer<typeof respostaDeMudancasSchema>
