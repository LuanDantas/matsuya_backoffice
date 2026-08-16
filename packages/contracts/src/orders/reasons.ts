/**
 * Taxonomia de motivos.
 *
 * Códigos são dados, não texto livre — é isso que faz o relatório de
 * cancelamento significar alguma coisa. Um campo de texto livre produz
 * "cliente pediu", "cliente pediu p/ cancelar" e "CLIENTE PEDIU" como três
 * categorias distintas, e ninguém consegue responder "por que cancelamos tanto
 * na Mooca?" a partir disso.
 *
 * Espelho de `orderStateMachine.ts` na API, verificado por
 * `tooling/verificar-deriva-de-contrato.mjs`.
 */

export const MOTIVOS_DE_RECUSA = {
  REJ_SEM_CAPACIDADE: 'Loja sem capacidade no momento',
  REJ_ITEM_INDISPONIVEL: 'Item indisponível',
  REJ_FORA_DA_AREA: 'Endereço fora da área de entrega',
  REJ_SEM_ENTREGADOR: 'Sem entregador disponível',
  REJ_LOJA_FECHADA: 'Loja fechada / fora do horário',
  REJ_PEDIDO_DUPLICADO: 'Pedido duplicado',
  REJ_SUSPEITA_FRAUDE: 'Suspeita de fraude',
  REJ_SEM_RESPOSTA_DA_LOJA: 'Sem resposta da loja',
  REJ_OUTRO: 'Outro motivo',
} as const

export const MOTIVOS_DE_CANCELAMENTO = {
  CAN_ITEM_INDISPONIVEL: 'Item indisponível',
  CAN_CLIENTE_DESISTIU: 'Cliente desistiu',
  CAN_CLIENTE_SOLICITOU: 'Cliente pediu o cancelamento',
  CAN_ERRO_NO_PREPARO: 'Erro no preparo',
  CAN_ATRASO_EXCESSIVO: 'Atraso excessivo',
  CAN_ENDERECO_INCORRETO: 'Endereço incorreto ou incompleto',
  CAN_SEM_ENTREGADOR: 'Sem entregador disponível',
  CAN_PROBLEMA_PAGAMENTO: 'Problema no pagamento',
  CAN_PEDIDO_TESTE: 'Pedido de teste interno',
  CAN_FORCA_MAIOR: 'Força maior (energia, clima, segurança)',
  CAN_OUTRO: 'Outro motivo',
} as const

export const MOTIVOS_DE_FALHA_NA_ENTREGA = {
  ENT_CLIENTE_AUSENTE: 'Cliente ausente',
  ENT_NAO_LOCALIZADO: 'Endereço não localizado',
  ENT_CLIENTE_RECUSOU: 'Cliente recusou o pedido',
  ENT_ACESSO_NEGADO: 'Acesso negado (portaria/condomínio)',
  ENT_PROBLEMA_ENTREGADOR: 'Problema com o entregador',
  ENT_AREA_DE_RISCO: 'Área de risco',
} as const

export type CodigoDeRecusa = keyof typeof MOTIVOS_DE_RECUSA
export type CodigoDeCancelamento = keyof typeof MOTIVOS_DE_CANCELAMENTO
export type CodigoDeFalhaNaEntrega = keyof typeof MOTIVOS_DE_FALHA_NA_ENTREGA
export type CodigoDeMotivo = CodigoDeRecusa | CodigoDeCancelamento | CodigoDeFalhaNaEntrega

export type FamiliaDeMotivo = 'REJ' | 'CAN' | 'ENT'

/** Reservado ao sistema: a auto-recusa por SLA usa, e a interface não oferece. */
export const MOTIVO_AUTO_RECUSA = 'REJ_SEM_RESPOSTA_DA_LOJA'

/** Exigem texto livre com no mínimo 10 caracteres. */
export const MOTIVOS_QUE_EXIGEM_TEXTO: ReadonlySet<string> = new Set([
  'REJ_OUTRO',
  'CAN_OUTRO',
])

export const TAMANHO_MINIMO_DO_TEXTO = 10

const CATALOGO: Record<FamiliaDeMotivo, Record<string, string>> = {
  REJ: MOTIVOS_DE_RECUSA,
  CAN: MOTIVOS_DE_CANCELAMENTO,
  ENT: MOTIVOS_DE_FALHA_NA_ENTREGA,
}

export interface OpcaoDeMotivo {
  codigo: string
  rotulo: string
}

/**
 * As opções que o operador pode escolher, já sem a auto-recusa.
 *
 * Se um operador pudesse recusar com `REJ_SEM_RESPOSTA_DA_LOJA`, o relatório de
 * "loja não respondeu" passaria a somar recusas manuais e deixaria de medir o
 * que se propõe a medir.
 */
export function opcoesDeMotivo(familia: FamiliaDeMotivo): OpcaoDeMotivo[] {
  return Object.entries(CATALOGO[familia])
    .filter(([codigo]) => codigo !== MOTIVO_AUTO_RECUSA)
    .map(([codigo, rotulo]) => ({ codigo, rotulo }))
}

export function rotuloDoMotivo(codigo: string): string | null {
  for (const familia of Object.values(CATALOGO)) {
    const rotulo = familia[codigo]
    if (rotulo) return rotulo
  }
  return null
}

export type ProblemaDeMotivo =
  | 'REASON_REQUIRED'
  | 'REASON_UNKNOWN'
  | 'REASON_NOTE_REQUIRED'
  | 'REASON_SYSTEM_ONLY'

/**
 * Mesma validação que a API aplica.
 *
 * Duplicar validação entre cliente e servidor é aceitável quando a duplicação é
 * verificada — o cliente valida para dar retorno imediato, o servidor valida
 * porque é ele quem decide. O que não se pode é as duas divergirem em silêncio,
 * e é por isso que a checagem de deriva existe.
 */
export function validarMotivo(
  familia: FamiliaDeMotivo | null,
  codigo: string | undefined,
  texto: string | undefined
): ProblemaDeMotivo | null {
  if (familia === null) return null
  if (!codigo) return 'REASON_REQUIRED'
  if (codigo === MOTIVO_AUTO_RECUSA) return 'REASON_SYSTEM_ONLY'
  if (!CATALOGO[familia][codigo]) return 'REASON_UNKNOWN'
  if (
    MOTIVOS_QUE_EXIGEM_TEXTO.has(codigo) &&
    (texto ?? '').trim().length < TAMANHO_MINIMO_DO_TEXTO
  ) {
    return 'REASON_NOTE_REQUIRED'
  }
  return null
}

export const MENSAGEM_DO_PROBLEMA: Record<ProblemaDeMotivo, string> = {
  REASON_REQUIRED: 'É obrigatório informar o motivo.',
  REASON_UNKNOWN: 'Motivo desconhecido.',
  REASON_NOTE_REQUIRED: 'Descreva o motivo com pelo menos 10 caracteres.',
  REASON_SYSTEM_ONLY: 'Este motivo é reservado ao sistema.',
}
