import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilaDeImpressao } from './fila'
import { ServidorRemoto } from './servidorRemoto'
import type { Impressora } from './transporte'

/**
 * A metade remota do agente.
 *
 * O comportamento que importa é o de **dois caminhos de entrada**: o Hub
 * alcança o agente pela LAN mesmo com a internet fora, e o servidor alcança
 * mesmo com o Hub fechado. Quando os dois chegam, a fila deduplica — e o
 * servidor precisa ser avisado de que o papel saiu mesmo assim, senão o
 * relatório contaria como falha uma comanda que está pendurada no trilho.
 */

const COZINHA: Impressora = {
  nome: 'Cozinha',
  papel: 'cozinha',
  largura: 80,
  destino: { tipo: 'rede', host: '10.0.0.1' },
}

const comanda = (code = '4597') => ({
  code,
  unidade: 'Matsuya Moema',
  criadoEm: '17/08 13:40',
  deliveryType: 'delivery' as const,
  itens: [{ qty: 1, productName: 'Temaki' }],
  subtotal: 40,
  taxaDeEntrega: 0,
  total: 40,
  formaDePagamento: 'Pix',
  pago: true,
})

/** Acesso ao método privado, que é o que o socket chamaria. */
const receber = (remoto: ServidorRemoto, trabalho: unknown) =>
  (remoto as unknown as { imprimir: (t: unknown) => Promise<void> }).imprimir(trabalho)

afterEach(() => {
  vi.unstubAllGlobals()
})

function montar(enviar = vi.fn().mockResolvedValue(undefined)) {
  const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })
  const chamadas: Array<{ url: string; corpo: unknown }> = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      chamadas.push({ url, corpo: JSON.parse(init.body) })
      return { ok: true } as Response
    })
  )

  const remoto = new ServidorRemoto({
    url: 'https://api.exemplo',
    token: 'tok',
    unityId: 8,
    fila,
    impressoras: [COZINHA],
  })

  return { remoto, fila, chamadas, enviar }
}

describe('comanda vinda do servidor', () => {
  it('imprime e relata sucesso', async () => {
    const { remoto, chamadas, enviar } = montar()

    await receber(remoto, { id: 'job-1', orderId: 1, papel: 'cozinha', comanda: comanda() })

    expect(enviar).toHaveBeenCalledTimes(1)
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]!.url).toContain('/agente/impressao/job-1/resultado')
    expect(chamadas[0]!.corpo).toMatchObject({ status: 'impresso' })
  })

  /**
   * O Hub chegou primeiro pela LAN. A fila descarta a duplicata — e é preciso
   * dizer ao servidor que **saiu**, senão o relatório marcaria como não
   * impressa uma comanda que está no trilho da cozinha.
   */
  it('quando o Hub chegou antes, relata impresso em vez de sumir', async () => {
    const { remoto, fila, chamadas, enviar } = montar()

    fila.enfileirar(comanda(), ['cozinha'])
    await fila.aguardar()

    await receber(remoto, { id: 'job-2', orderId: 1, papel: 'cozinha', comanda: comanda() })

    // Uma impressão só: a segunda foi deduplicada.
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(chamadas[0]!.corpo).toMatchObject({ status: 'impresso' })
  })

  it('relata a falha com o motivo, para o relatório saber o porquê', async () => {
    vi.useFakeTimers()

    const { remoto, chamadas } = montar(vi.fn().mockRejectedValue(new Error('sem papel')))

    const promessa = receber(remoto, {
      id: 'job-3',
      orderId: 1,
      papel: 'cozinha',
      comanda: comanda(),
    })

    await vi.advanceTimersByTimeAsync(30_000)
    await promessa

    expect(chamadas[0]!.corpo).toMatchObject({ status: 'falhou', erro: 'sem papel' })

    vi.useRealTimers()
  })

  it('ignora mensagem sem comanda utilizável', async () => {
    const { remoto, enviar, chamadas } = montar()

    await receber(remoto, { id: 'job-4', orderId: 1, papel: 'cozinha' })

    expect(enviar).not.toHaveBeenCalled()
    expect(chamadas).toHaveLength(0)
  })

  /**
   * Relato perdido não pode virar comanda perdida: o papel já saiu, e o que se
   * perde é uma linha de relatório. Se isto voltar a lançar, uma oscilação de
   * rede derruba o processamento da comanda seguinte.
   */
  it('falha ao relatar não derruba o agente', async () => {
    const fila = new FilaDeImpressao({
      impressoras: [COZINHA],
      enviar: vi.fn().mockResolvedValue(undefined),
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem internet')))

    const remoto = new ServidorRemoto({
      url: 'https://api.exemplo',
      token: 'tok',
      unityId: 8,
      fila,
      impressoras: [COZINHA],
    })

    await expect(
      receber(remoto, { id: 'job-5', orderId: 1, papel: 'cozinha', comanda: comanda() })
    ).resolves.toBeUndefined()
  })
})
