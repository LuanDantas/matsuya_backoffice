import { describe, expect, it } from 'vitest'
import { FalhaDaApi, FalhaDeRede } from '@matsuya/api-client'
import { primeiroCampoInvalido, respostaDaFalha, validarTrocaDeSenha } from './senha'

const falhaDaApi = (status: number, message: string) =>
  new FalhaDaApi(status, { code: `HTTP_${status}`, message })

describe('validarTrocaDeSenha', () => {
  it('cobra os três campos quando está tudo vazio', () => {
    const erros = validarTrocaDeSenha({ atual: '', nova: '', confirmacao: '' })

    expect(erros.atual).toBeTruthy()
    expect(erros.nova).toBeTruthy()
    // Vazio bate com vazio, então a confirmação não reclama — e não deve: dois
    // erros pelo mesmo campo em branco é ruído.
    expect(erros.confirmacao).toBeUndefined()
    expect(primeiroCampoInvalido(erros)).toBe('atual')
  })

  it('recusa senha curta', () => {
    const erros = validarTrocaDeSenha({ atual: 'antiga', nova: '12345', confirmacao: '12345' })
    expect(erros.nova).toContain('6')
  })

  it('recusa repetir a senha atual', () => {
    // O servidor aceitaria: ele confere a atual e grava o que vier. Sem isto, a
    // pessoa "trocaria" a senha sem trocar nada.
    const erros = validarTrocaDeSenha({
      atual: 'segredo123',
      nova: 'segredo123',
      confirmacao: 'segredo123',
    })
    expect(erros.nova).toContain('diferente')
  })

  it('cobra a confirmação quando as duas divergem', () => {
    const erros = validarTrocaDeSenha({
      atual: 'antiga',
      nova: 'nova-senha',
      confirmacao: 'nova-senh',
    })
    expect(erros.nova).toBeUndefined()
    expect(erros.confirmacao).toBeTruthy()
    expect(primeiroCampoInvalido(erros)).toBe('confirmacao')
  })

  it('deixa passar espaço nas pontas, sem aparar', () => {
    /*
     * O teste que impede alguém "melhorar" isto com um `trim`. Quem escolheu uma
     * senha terminada em espaço vai digitá-la assim para sempre; aparar aqui a
     * tornaria impossível de usar no login, que não apara.
     */
    const erros = validarTrocaDeSenha({
      atual: 'antiga',
      nova: '  segredo  ',
      confirmacao: '  segredo  ',
    })
    expect(erros).toEqual({})
  })

  it('conta caractere visível, não unidade UTF-16', () => {
    // `'👍👍👍'.length` é 6. Contar assim deixaria passar três caracteres como
    // se fossem seis.
    const erros = validarTrocaDeSenha({
      atual: 'antiga',
      nova: '👍👍👍',
      confirmacao: '👍👍👍',
    })
    expect(erros.nova).toBeTruthy()

    const seis = validarTrocaDeSenha({
      atual: 'antiga',
      nova: '👍👍👍👍👍👍',
      confirmacao: '👍👍👍👍👍👍',
    })
    expect(seis).toEqual({})
  })

  it('aceita a troca válida sem inventar exigência de símbolo ou maiúscula', () => {
    // A API não exige nada disso neste caminho. Exigir só aqui produziria uma
    // senha que esta tela recusa e que o "esqueci minha senha" aceita.
    expect(
      validarTrocaDeSenha({ atual: 'antiga', nova: 'abcdef', confirmacao: 'abcdef' })
    ).toEqual({})
  })
})

describe('respostaDaFalha', () => {
  it('leva a senha incorreta para o campo da senha atual', () => {
    const resposta = respostaDaFalha(falhaDaApi(400, 'Senha incorreta'))
    expect(resposta).toEqual({
      tipo: 'campo',
      campo: 'atual',
      texto: 'Essa não é a sua senha de agora.',
    })
  })

  it('não confunde sessão vencida com senha errada', () => {
    /*
     * O defeito clássico desta tela: a pessoa digita a senha certa, o token
     * tinha vencido, e ela passa a duvidar da própria senha.
     */
    expect(respostaDaFalha(falhaDaApi(401, 'Não autorizado: token inválido'))).toEqual({
      tipo: 'sessao-expirada',
    })
  })

  it('preserva o texto do servidor nos outros 4xx', () => {
    const resposta = respostaDaFalha(falhaDaApi(400, 'Validation error: password'))
    expect(resposta).toEqual({ tipo: 'geral', texto: 'Validation error: password' })
  })

  it('tem texto próprio para excesso de tentativas', () => {
    expect(respostaDaFalha(falhaDaApi(429, 'Too many requests'))).toMatchObject({
      tipo: 'geral',
    })
    expect((respostaDaFalha(falhaDaApi(429, 'x')) as { texto: string }).texto).toContain(
      'tentativas'
    )
  })

  it('distingue rede fora de erro do servidor', () => {
    const resposta = respostaDaFalha(new FalhaDeRede(new TypeError('Failed to fetch')))
    expect(resposta).toMatchObject({ tipo: 'geral' })
    expect((resposta as { texto: string }).texto).toContain('internet')
  })

  it('cai num genérico no 500 e no que não é falha conhecida', () => {
    // O texto de um 500 é detalhe de servidor e não ajuda quem está no balcão.
    expect(respostaDaFalha(falhaDaApi(500, 'Cannot read property of undefined'))).toEqual({
      tipo: 'geral',
      texto: 'Não deu para trocar a senha agora. Tente de novo.',
    })
    expect(respostaDaFalha(new Error('qualquer coisa'))).toMatchObject({ tipo: 'geral' })
    expect(respostaDaFalha(undefined)).toMatchObject({ tipo: 'geral' })
  })
})
