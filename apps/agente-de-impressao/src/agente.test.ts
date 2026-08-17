import { describe, expect, it, vi } from 'vitest'
import type { DadosDaComanda } from '@matsuya/printing/comanda'
import { paraCp850 } from './cp850'
import { montarBytes } from './escpos'
import { FilaDeImpressao, JANELA_DE_DEDUPE_MS } from './fila'
import type { Impressora } from './transporte'

const COZINHA: Impressora = {
  nome: 'Cozinha',
  papel: 'cozinha',
  largura: 80,
  destino: { tipo: 'rede', host: '10.0.0.1' },
}

const BALCAO: Impressora = {
  nome: 'Balcao',
  papel: 'balcao',
  largura: 80,
  destino: { tipo: 'rede', host: '10.0.0.2' },
}

function comanda(over: Partial<DadosDaComanda> = {}): DadosDaComanda {
  return {
    code: '4597',
    unidade: 'Matsuya Moema',
    criadoEm: '17/08 13:40',
    deliveryType: 'delivery',
    itens: [{ qty: 2, productName: 'Temaki de salmão' }],
    subtotal: 80,
    taxaDeEntrega: 8,
    total: 88,
    formaDePagamento: 'Pix',
    pago: true,
    ...over,
  }
}

describe('codificação CP850', () => {
  /**
   * O caso que motiva a tabela: `latin1` do Node é ISO-8859-1, e `ã` lá é 0xE3.
   * Na CP850 0xE3 é `Ò`. Uma comanda de "Temaki de salmão" sairia com "salmÒo".
   */
  it('usa a tabela da CP850, não a do latin1', () => {
    expect(paraCp850('ã')[0]).toBe(0xc6)
    expect(paraCp850('ç')[0]).toBe(0x87)
    expect(paraCp850('õ')[0]).toBe(0xe4)
    expect(paraCp850('É')[0]).toBe(0x90)

    // A prova de que a distinção importa.
    expect(paraCp850('ã')[0]).not.toBe(Buffer.from('ã', 'latin1')[0])
  })

  it('deixa ASCII passar intacto', () => {
    expect(paraCp850('4597').toString('ascii')).toBe('4597')
  })

  /**
   * Fora da tabela, tira o acento em vez de mandar byte que a impressora não
   * conhece: um caractere errado é legível, um byte inválido pode travar a
   * impressão no meio da comanda.
   */
  it('transliterá o que não está na tabela em vez de emitir lixo', () => {
    const bytes = paraCp850('Ẽ')
    expect(bytes.every((b) => b < 0x80)).toBe(true)
    expect(bytes.toString('ascii')).toBe('E')
  })

  it('nunca emite byte fora de 0..255', () => {
    const bytes = paraCp850('日本 açaí — ok')
    expect([...bytes].every((b) => b >= 0 && b <= 255)).toBe(true)
  })
})

describe('montagem ESC/POS', () => {
  const contem = (bytes: Buffer, texto: string) => bytes.includes(paraCp850(texto))

  it('inicializa e seleciona a CP850 antes de qualquer texto', () => {
    const bytes = montarBytes(comanda())

    // ESC @ seguido de ESC t 2.
    expect(bytes.subarray(0, 5)).toEqual(Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x02]))
  })

  it('põe a quantidade antes do nome do item', () => {
    expect(contem(montarBytes(comanda()), '2x Temaki de salmão')).toBe(true)
  })

  /**
   * A cozinha não decide nada com o preço, e cada linha a mais é uma linha a
   * mais para varrer com os olhos num trilho cheio.
   */
  it('a via da cozinha não leva preço nem endereço', () => {
    const bytes = montarBytes(
      comanda({ endereco: 'Rua X, 123', cliente: 'Ana' }),
      { papel: 'cozinha' }
    )

    expect(contem(bytes, 'TOTAL')).toBe(false)
    expect(contem(bytes, 'Rua X, 123')).toBe(false)
    expect(contem(bytes, '2x Temaki de salmão')).toBe(true)
  })

  it('a via do balcão leva total, pagamento e endereço', () => {
    const bytes = montarBytes(comanda({ endereco: 'Rua X, 123' }), { papel: 'balcao' })

    expect(contem(bytes, 'TOTAL')).toBe(true)
    expect(contem(bytes, 'Rua X, 123')).toBe(true)
    expect(contem(bytes, 'PAGO')).toBe(true)
  })

  it('destaca o que ainda vai ser cobrado', () => {
    expect(contem(montarBytes(comanda({ pago: false })), 'A RECEBER')).toBe(true)
  })

  /**
   * Sem a marca, a segunda via parece tão nova quanto a primeira e a cozinha
   * monta o pedido duas vezes.
   */
  it('marca a reimpressão no papel', () => {
    expect(contem(montarBytes(comanda({ reimpressao: true })), 'REIMPRESSAO')).toBe(true)
  })

  /** Item cancelado que some da lista é prato feito à toa. */
  it('mostra o item cancelado em vez de escondê-lo', () => {
    const bytes = montarBytes(comanda({ itens: [{ qty: 2, cancelledQty: 2, productName: 'Uramaki' }] }))
    expect(contem(bytes, 'CANCELADO: 2x Uramaki')).toBe(true)
  })

  it('mostra o cancelamento parcial junto da quantidade que restou', () => {
    const bytes = montarBytes(comanda({ itens: [{ qty: 3, cancelledQty: 1, productName: 'Uramaki' }] }))
    expect(contem(bytes, '2x Uramaki')).toBe(true)
    expect(contem(bytes, '(1x cancelado)')).toBe(true)
  })

  it('termina com avanço e corte', () => {
    const bytes = montarBytes(comanda())
    expect(bytes.subarray(-4)).toEqual(Buffer.from([0x1d, 0x56, 0x42, 0x00]))
  })
})

describe('fila do agente', () => {
  it('manda a mesma comanda para a cozinha e para o balcão', async () => {
    const enviar = vi.fn().mockResolvedValue(undefined)
    const fila = new FilaDeImpressao({ impressoras: [COZINHA, BALCAO], enviar })

    fila.enfileirar(comanda())
    await fila.aguardar()

    expect(enviar).toHaveBeenCalledTimes(2)
    expect(fila.todos.every((t) => t.estado === 'impresso')).toBe(true)
  })

  /**
   * Reconexão do socket, retry do backend e o operador clicando duas vezes
   * produzem o mesmo trabalho. Sem dedupe, a cozinha monta o prato duas vezes.
   */
  it('descarta a comanda repetida dentro da janela', async () => {
    const enviar = vi.fn().mockResolvedValue(undefined)
    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda())
    const segunda = fila.enfileirar(comanda())
    await fila.aguardar()

    expect(segunda).toHaveLength(0)
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('depois da janela, a mesma comanda imprime de novo', async () => {
    const enviar = vi.fn().mockResolvedValue(undefined)
    let relogio = 1_000_000
    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar, agora: () => relogio })

    fila.enfileirar(comanda())
    relogio += JANELA_DE_DEDUPE_MS + 1
    fila.enfileirar(comanda())
    await fila.aguardar()

    expect(enviar).toHaveBeenCalledTimes(2)
  })

  /** Reimpressão é decisão humana, e não pode esbarrar na dedupe. */
  it('a reimpressão não é confundida com duplicata', async () => {
    const enviar = vi.fn().mockResolvedValue(undefined)
    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda())
    fila.enfileirar(comanda({ reimpressao: true }))
    await fila.aguardar()

    expect(enviar).toHaveBeenCalledTimes(2)
  })

  /**
   * Duas comandas concorrentes na mesma térmica entrelaçam os bytes e sai um
   * papel com metade de cada pedido.
   */
  it('nunca imprime duas comandas ao mesmo tempo na mesma impressora', async () => {
    let simultaneas = 0
    let pico = 0

    const enviar = vi.fn().mockImplementation(async () => {
      simultaneas++
      pico = Math.max(pico, simultaneas)
      await new Promise((r) => setTimeout(r, 10))
      simultaneas--
    })

    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda({ code: 'A1' }))
    fila.enfileirar(comanda({ code: 'A2' }))
    fila.enfileirar(comanda({ code: 'A3' }))
    await fila.aguardar()

    expect(pico).toBe(1)
    expect(enviar).toHaveBeenCalledTimes(3)
  })

  /** A cozinha trabalha de cima para baixo no trilho. Fora de ordem, atrasa. */
  it('respeita a ordem de entrada na mesma impressora', async () => {
    const saida: string[] = []
    const enviar = vi.fn().mockImplementation(async (_i: Impressora, bytes: Buffer) => {
      for (const code of ['A1', 'A2', 'A3']) {
        if (bytes.includes(paraCp850(code))) saida.push(code)
      }
    })

    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda({ code: 'A1' }))
    fila.enfileirar(comanda({ code: 'A2' }))
    fila.enfileirar(comanda({ code: 'A3' }))
    await fila.aguardar()

    expect(saida).toEqual(['A1', 'A2', 'A3'])
  })

  it('tenta de novo quando a impressora falha e desiste depois de quatro vezes', async () => {
    vi.useFakeTimers()

    const enviar = vi.fn().mockRejectedValue(new Error('sem papel'))
    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda())
    await vi.advanceTimersByTimeAsync(30_000)
    await fila.aguardar()

    expect(enviar).toHaveBeenCalledTimes(4)

    const [trabalho] = fila.todos
    expect(trabalho!.estado).toBe('falhou')
    expect(trabalho!.ultimoErro).toBe('sem papel')

    vi.useRealTimers()
  })

  /**
   * Sumir com a comanda falhada seria o pior desfecho: a loja não saberia que
   * ela nunca saiu. Visível, ela vira alerta no card e oferta de imprimir pelo
   * navegador.
   */
  it('o trabalho que falhou continua visível', async () => {
    vi.useFakeTimers()

    const enviar = vi.fn().mockRejectedValue(new Error('offline'))
    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda())
    await vi.advanceTimersByTimeAsync(30_000)
    await fila.aguardar()

    expect(fila.todos).toHaveLength(1)
    expect(fila.todos[0]!.estado).toBe('falhou')

    vi.useRealTimers()
  })

  /**
   * Se uma falha escapasse da corrente, ela ficaria rejeitada para sempre e
   * nenhuma comanda seguinte imprimiria naquela impressora — uma comanda
   * perdida viraria a impressora inteira perdida.
   */
  it('uma comanda que falha não derruba as seguintes', async () => {
    vi.useFakeTimers()

    const enviar = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue(undefined)

    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda({ code: 'RUIM' }))
    fila.enfileirar(comanda({ code: 'BOA' }))

    await vi.advanceTimersByTimeAsync(60_000)
    await fila.aguardar()

    const boa = fila.todos.find((t) => t.comanda.code === 'BOA')
    expect(boa!.estado).toBe('impresso')

    vi.useRealTimers()
  })

  it('reenfileirar refaz o trabalho que falhou', async () => {
    vi.useFakeTimers()

    const enviar = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue(undefined)

    const fila = new FilaDeImpressao({ impressoras: [COZINHA], enviar })

    fila.enfileirar(comanda())
    await vi.advanceTimersByTimeAsync(30_000)
    await fila.aguardar()

    expect(fila.reenfileirar(fila.todos[0]!.id)).toBe(true)
    await vi.advanceTimersByTimeAsync(30_000)
    await fila.aguardar()

    expect(fila.todos[0]!.estado).toBe('impresso')

    vi.useRealTimers()
  })

  it('sem impressora daquele papel, não inventa trabalho', () => {
    const fila = new FilaDeImpressao({ impressoras: [BALCAO], enviar: vi.fn() })

    const criados = fila.enfileirar(comanda(), ['cozinha'])

    expect(criados).toHaveLength(0)
  })
})
