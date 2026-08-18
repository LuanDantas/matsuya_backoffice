import { describe, expect, it } from 'vitest'
import { nomeDaLoja } from './loja'

describe('nome da loja na tela de escolha', () => {
  /**
   * Os nove nomes como estão no cadastro hoje — copiados do banco, não
   * inventados. É a única prova de que a função serve para o dado real: são
   * eles que trazem caixa alta, caixa mista, hífen solto e acento faltando,
   * tudo misturado.
   */
  it('separa a marca do bairro nos nomes do cadastro', () => {
    expect(nomeDaLoja('MATSUYA MOOCA')).toEqual({ principal: 'Mooca', apoio: 'Matsuya' })
    expect(nomeDaLoja('Matsuya Santana')).toEqual({ principal: 'Santana', apoio: 'Matsuya' })
    expect(nomeDaLoja('MATSUYA MORUMBI')).toEqual({ principal: 'Morumbi', apoio: 'Matsuya' })
    expect(nomeDaLoja('MATSUYA PERDIZES')).toEqual({ principal: 'Perdizes', apoio: 'Matsuya' })
    expect(nomeDaLoja('MATSUYA MOEMA')).toEqual({ principal: 'Moema', apoio: 'Matsuya' })
    expect(nomeDaLoja('Matsuya Guarulhos')).toEqual({ principal: 'Guarulhos', apoio: 'Matsuya' })
  })

  it('junta nome de duas palavras sem quebrar', () => {
    expect(nomeDaLoja('MATSUYA VILA MARIANA')).toEqual({
      principal: 'Vila Mariana',
      apoio: 'Matsuya',
    })
  })

  /**
   * `MATSUYA -ACLIMACAO` está assim no cadastro. Sem limpar o separador, o
   * cartão mostraria um hífen órfão colado no bairro.
   */
  it('come o separador solto que sobra depois da marca', () => {
    expect(nomeDaLoja('MATSUYA -ACLIMACAO').principal).toBe('Aclimacao')
    expect(nomeDaLoja('Matsuya · Saúde').principal).toBe('Saúde')
    expect(nomeDaLoja('MATSUYA - VILA MARIANA').principal).toBe('Vila Mariana')
  })

  /**
   * Caixa alta vira caixa de título; o que já estava escrito com cuidado passa
   * intocado. Reprocessar um nome correto só cria chance de estragá-lo.
   */
  it('só normaliza a caixa quando o nome está todo em maiúsculas', () => {
    expect(nomeDaLoja('MATSUYA SAUDE').principal).toBe('Saude')
    expect(nomeDaLoja('Matsuya Vila Madalena').principal).toBe('Vila Madalena')
    expect(nomeDaLoja('Matsuya iFood Express').principal).toBe('iFood Express')
  })

  it('mantém átonas em minúscula no meio do nome', () => {
    expect(nomeDaLoja('MATSUYA JARDIM DAS ACACIAS').principal).toBe('Jardim das Acacias')
    expect(nomeDaLoja('MATSUYA SANTO ANDRE E MAUA').principal).toBe('Santo Andre e Maua')
  })

  it('não inventa acento que o cadastro não tem', () => {
    expect(nomeDaLoja('MATSUYA SAUDE').principal).not.toBe('Saúde')
  })

  it('deixa quieto o nome que não começa pela marca', () => {
    expect(nomeDaLoja('Quiosque Shopping Norte')).toEqual({
      principal: 'Quiosque Shopping Norte',
      apoio: null,
    })
    expect(nomeDaLoja('CENTRO DE DISTRIBUICAO')).toEqual({
      principal: 'Centro de Distribuicao',
      apoio: null,
    })
  })

  /**
   * Separar aqui deixaria o cartão com o texto principal vazio e só a marca
   * embaixo — uma linha sem nome nenhum no lugar onde se lê o nome.
   */
  it('não separa quando a marca é o nome inteiro', () => {
    expect(nomeDaLoja('MATSUYA')).toEqual({ principal: 'Matsuya', apoio: null })
    expect(nomeDaLoja('Matsuya')).toEqual({ principal: 'Matsuya', apoio: null })
    expect(nomeDaLoja('  Matsuya  -  ')).toEqual({ principal: 'Matsuya', apoio: null })
  })

  /**
   * Não deve casar com um nome que apenas começa com as mesmas letras — o
   * limite de palavra é o que separa "Matsuya Moema" de "Matsuyama".
   */
  it('não confunde a marca com o começo de outra palavra', () => {
    expect(nomeDaLoja('Matsuyama Centro')).toEqual({
      principal: 'Matsuyama Centro',
      apoio: null,
    })
  })

  it('normaliza espaço sobrando', () => {
    expect(nomeDaLoja('  MATSUYA   VILA   MARIANA  ')).toEqual({
      principal: 'Vila Mariana',
      apoio: 'Matsuya',
    })
  })

  it('tem saída para nome vazio', () => {
    expect(nomeDaLoja('')).toEqual({ principal: 'Loja sem nome', apoio: null })
    expect(nomeDaLoja('   ')).toEqual({ principal: 'Loja sem nome', apoio: null })
  })
})
