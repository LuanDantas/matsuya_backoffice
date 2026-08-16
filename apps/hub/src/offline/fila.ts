import type { OrderAction, OrderStatus } from '@matsuya/contracts'

/**
 * Fila de ações feitas sem conexão.
 *
 * O Wi-Fi de uma loja cai. Cai no meio do almoço, cai quando o forno liga, cai
 * porque alguém desligou o roteador para colocar o ventilador na tomada. O
 * operador continua tendo pedidos para aceitar.
 *
 * A fila guarda o que ele fez e reenvia quando a conexão volta. Vive no
 * IndexedDB, e não em memória: recarregar a aba — ou o tablet reiniciar — não
 * pode apagar cinco aceites que ninguém sabe que existiram.
 *
 * **O detalhe que decide a correção do reenvio:** cada ação carrega a versão do
 * pedido no momento do clique. A API recusa a transição se a versão mudou, o
 * que significa que reenviar é seguro por construção — não precisa de chave de
 * idempotência para não duplicar. Mas há um caso que parece falha e não é:
 * a requisição chegou ao servidor, foi aplicada, e a resposta se perdeu na
 * volta. O reenvio recebe 409 dizendo que o pedido já está no estado que a
 * ação queria — e isso é **sucesso**, não conflito. Tratar os dois iguais faria
 * o Hub acusar erro numa ação que funcionou.
 */

const BANCO = 'matsuya-hub'
const DEPOSITO = 'fila-de-acoes'
const VERSAO_DO_BANCO = 1

/** Ação mais velha que isto não é reenviada. */
export const VALIDADE_EM_MINUTOS = 30

export interface AcaoEnfileirada {
  id: string
  unityId: number
  orderId: number
  /** Para a interface dizer qual pedido, sem consultar o servidor. */
  codigoDoPedido: string | null
  acao: OrderAction
  /** Estado que a ação pretende alcançar — base da checagem de "já aplicada". */
  statusAlvo: OrderStatus
  reasonCode?: string
  reasonNote?: string
  versaoEsperada: number
  criadaEm: number
  tentativas: number
  ultimoErro?: string
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, VERSAO_DO_BANCO)

    pedido.onupgradeneeded = () => {
      const db = pedido.result
      if (!db.objectStoreNames.contains(DEPOSITO)) {
        const deposito = db.createObjectStore(DEPOSITO, { keyPath: 'id' })
        deposito.createIndex('porUnidade', 'unityId')
      }
    }

    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
  })
}

function transacionar<T>(
  modo: IDBTransactionMode,
  operacao: (deposito: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transacao = db.transaction(DEPOSITO, modo)
        const requisicao = operacao(transacao.objectStore(DEPOSITO))
        requisicao.onsuccess = () => resolve(requisicao.result)
        requisicao.onerror = () => reject(requisicao.error)
        transacao.oncomplete = () => db.close()
      })
  )
}

export const filaOffline = {
  /**
   * `false` quando o IndexedDB não está disponível — janela anônima, cota
   * esgotada, navegador antigo. O Hub precisa saber, porque sem fila o modo
   * offline vira promessa vazia.
   */
  disponivel(): boolean {
    return typeof indexedDB !== 'undefined'
  },

  async enfileirar(acao: Omit<AcaoEnfileirada, 'id' | 'criadaEm' | 'tentativas'>) {
    const registro: AcaoEnfileirada = {
      ...acao,
      // Id determinístico por pedido+ação: o mesmo operador tocando duas vezes
      // no mesmo botão offline grava uma linha só.
      id: `${acao.orderId}:${acao.acao}`,
      criadaEm: Date.now(),
      tentativas: 0,
    }
    await transacionar('readwrite', (d) => d.put(registro))
    return registro
  },

  async listar(unityId: number): Promise<AcaoEnfileirada[]> {
    const todas = await transacionar<AcaoEnfileirada[]>('readonly', (d) => d.getAll())
    return todas
      .filter((a) => a.unityId === unityId)
      .sort((a, b) => a.criadaEm - b.criadaEm)
  },

  async remover(id: string) {
    await transacionar('readwrite', (d) => d.delete(id))
  },

  async atualizar(acao: AcaoEnfileirada) {
    await transacionar('readwrite', (d) => d.put(acao))
  },

  async limpar(unityId: number) {
    const acoes = await filaOffline.listar(unityId)
    for (const acao of acoes) await filaOffline.remover(acao.id)
  },

  /**
   * Ações vencidas.
   *
   * Meia hora depois, reenviar deixa de ser recuperação e vira risco: o pedido
   * já foi tratado por outra tablete, ou cancelado, ou entregue. O que a fila
   * tem é uma intenção velha, e aplicá-la às cegas pode desfazer trabalho de
   * outra pessoa. Estas saem da fila e viram uma lista para o operador
   * conferir.
   */
  vencidas(acoes: AcaoEnfileirada[], agora = Date.now()): AcaoEnfileirada[] {
    const limite = VALIDADE_EM_MINUTOS * 60 * 1000
    return acoes.filter((a) => agora - a.criadaEm > limite)
  },

  vigentes(acoes: AcaoEnfileirada[], agora = Date.now()): AcaoEnfileirada[] {
    const limite = VALIDADE_EM_MINUTOS * 60 * 1000
    return acoes.filter((a) => agora - a.criadaEm <= limite)
  },
}

/**
 * O conflito significa que a ação já tinha sido aplicada?
 *
 * Este é o caso da resposta perdida na volta: o servidor aplicou, o cabo caiu,
 * o Hub reenviou. Se o estado atual do pedido é exatamente o que a ação
 * pretendia, ela funcionou — e reportar erro faria o operador refazer algo que
 * já está feito.
 */
export function conflitoEhSucesso(
  acao: AcaoEnfileirada,
  detalhesDoConflito: unknown
): boolean {
  const detalhes = detalhesDoConflito as { currentStatus?: string } | null | undefined
  return detalhes?.currentStatus === acao.statusAlvo
}
