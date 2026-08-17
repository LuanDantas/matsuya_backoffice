import { describe, expect, it } from 'vitest'
import { contarProblemas } from './saudeDoAgente'

/**
 * O indicador de impressão do cabeçalho.
 *
 * O defeito que estes testes travam é o que existia antes: a tela dizia
 * "Agente local: Ativo" com base em `Boolean(urlDoAgente)` — verde só porque
 * havia uma URL escrita no arquivo de configuração, com o agente desligado. Um
 * indicador que não pode ficar vermelho não é indicador.
 */

const saude = (over: Partial<Parameters<typeof contarProblemas>[0]> = {}) => ({
  estado: 'ativo' as const,
  impressoras: [],
  pendentes: 0,
  falhas: 0,
  ...over,
})

describe('contagem de problemas de impressão', () => {
  it('em dia, não anuncia nada', () => {
    expect(contarProblemas(saude({ impressoras: [{ nome: 'Cozinha', papel: 'cozinha', online: true }] }))).toBe(0)
  })

  it('soma falhas, fila e impressora sem resposta', () => {
    expect(
      contarProblemas(
        saude({
          falhas: 2,
          pendentes: 1,
          impressoras: [
            { nome: 'Cozinha', papel: 'cozinha', online: false },
            { nome: 'Balcao', papel: 'balcao', online: true },
          ],
        })
      )
    ).toBe(4)
  })

  /**
   * O caso que mais importa. Agente sem resposta vem com lista vazia e fila
   * zerada — não houve a quem perguntar. Somando os componentes daria zero, e o
   * indicador ficaria apagado exatamente quando mais precisa aparecer.
   */
  it('agente sem resposta acende mesmo sem nada para somar', () => {
    expect(contarProblemas(saude({ estado: 'ausente' }))).toBe(1)
  })

  /** Numa loja que imprime pelo navegador o indicador não deve existir. */
  it('sem agente configurado, não anuncia problema', () => {
    expect(contarProblemas(saude({ estado: 'nao_configurado', falhas: 9 }))).toBe(0)
  })

  /** Enquanto verifica, não acusa: acusar antes de saber ensina a ignorar. */
  it('não anuncia enquanto ainda está verificando', () => {
    expect(contarProblemas(saude({ estado: 'verificando' }))).toBe(0)
  })
})
