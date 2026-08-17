import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilaDeImpressao } from './fila'
import { criarServidor } from './servidor'
import type { Impressora } from './transporte'

/**
 * O contrato com o Hub, exercitado por HTTP de verdade.
 *
 * O Hub já implementa o cliente em `@matsuya/printing/impressora`:
 * `POST {urlDoAgente}/imprimir` com `{ largura, comanda }`, desistindo em 4 s.
 * Estes testes travam esse formato — se alguém mexer no caminho ou no corpo, o
 * Hub cai silenciosamente para a impressão pelo navegador, que exige alguém
 * apertar OK numa cozinha.
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

let fechar: (() => Promise<void>) | null = null

afterEach(async () => {
  await fechar?.()
  fechar = null
})

async function subir(impressoras: Impressora[]) {
  const fila = new FilaDeImpressao({ impressoras, enviar: vi.fn().mockResolvedValue(undefined) })
  // Porta 0: o sistema escolhe uma livre, e os testes não brigam por porta.
  const { escutar, parar, servidor } = criarServidor({ fila, impressoras, porta: 0 })
  await escutar()
  fechar = parar

  const endereco = servidor.address()
  const porta = typeof endereco === 'object' && endereco ? endereco.port : 0

  return { base: `http://127.0.0.1:${porta}`, fila }
}

describe('contrato do agente', () => {
  it('aceita o corpo que o Hub envia em POST /imprimir', async () => {
    const { base, fila } = await subir([COZINHA])

    const r = await fetch(`${base}/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ largura: 80, comanda: comanda() }),
    })

    expect(r.ok).toBe(true)
    expect(((await r.json()) as { aceito: boolean }).aceito).toBe(true)

    await fila.aguardar()
    expect(fila.todos).toHaveLength(1)
  })

  /**
   * O Hub desiste em 4 s e cai para o navegador. Se o agente segurasse a
   * resposta até o papel sair, uma impressora lenta faria sair comanda em
   * duplicidade — uma pelo agente, outra pelo navegador.
   */
  it('responde antes de o papel sair', async () => {
    const impressoras = [COZINHA]
    const fila = new FilaDeImpressao({
      impressoras,
      enviar: () => new Promise((r) => setTimeout(r, 3_000)),
    })
    const { escutar, parar, servidor } = criarServidor({ fila, impressoras, porta: 0 })
    await escutar()
    fechar = parar

    const endereco = servidor.address()
    const porta = typeof endereco === 'object' && endereco ? endereco.port : 0

    const comeco = Date.now()
    const r = await fetch(`http://127.0.0.1:${porta}/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comanda: comanda() }),
    })

    expect(r.status).toBe(202)
    expect(Date.now() - comeco).toBeLessThan(1_000)
  })

  /**
   * Duplicata é sucesso: a comanda já está na fila. Devolver erro faria o Hub
   * cair para o navegador e imprimir de novo — exatamente o que a dedupe existe
   * para evitar.
   */
  it('trata a repetição como sucesso, não como erro', async () => {
    const { base } = await subir([COZINHA])

    const enviar = () =>
      fetch(`${base}/imprimir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comanda: comanda() }),
      })

    await enviar()
    const segunda = await enviar()

    expect(segunda.ok).toBe(true)
    expect(((await segunda.json()) as { duplicata: boolean }).duplicata).toBe(true)
  })

  it('recusa corpo sem comanda', async () => {
    const { base } = await subir([COZINHA])

    const r = await fetch(`${base}/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ largura: 80 }),
    })

    expect(r.status).toBe(400)
  })

  /**
   * Sem impressora, o agente precisa dizer isso claramente — senão o Hub acha
   * que imprimiu e ninguém procura o papel.
   */
  it('avisa quando não há impressora configurada', async () => {
    const { base } = await subir([])

    const r = await fetch(`${base}/imprimir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comanda: comanda() }),
    })

    expect(r.status).toBe(503)
  })

  /**
   * O Hub roda em https e chama http na LAN. Sem CORS o navegador barra a
   * resposta antes de o código vê-la, e o operador só percebe que "não
   * imprime", sem pista de que a comanda chegou.
   */
  it('responde ao preflight do navegador', async () => {
    const { base } = await subir([COZINHA])

    const r = await fetch(`${base}/imprimir`, { method: 'OPTIONS' })

    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('relata a saúde para quem estiver instalando', async () => {
    const { base } = await subir([])

    const corpo = await (await fetch(`${base}/saude`)).json()

    expect(corpo).toMatchObject({ impressoras: [], pendentes: 0, falhas: 0 })
  })
})
