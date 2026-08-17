import { describe, expect, it } from 'vitest'
import { FalhaDaApi, FalhaDeRede } from '@matsuya/api-client'
import {
  mensagemDeFalha,
  primeiroCampoInvalido,
  validarCredenciais,
} from './credenciais'

/**
 * O que o operador lê quando não consegue entrar.
 *
 * Testado sem React porque é a parte que mais importa e a que menos precisa de
 * DOM: o texto que aparece às onze da noite, com o salão cheio, para alguém que
 * só quer abrir o quadro.
 */

const erroDaApi = (status: number, mensagem = 'algo') =>
  new FalhaDaApi(status, { code: `HTTP_${status}`, message: mensagem })

describe('validação das credenciais', () => {
  it('aceita um e-mail e senha comuns', () => {
    expect(validarCredenciais({ email: 'ana@matsuya.com.br', senha: 'x' })).toEqual({})
  })

  it('cobra os dois campos quando estão vazios', () => {
    const erros = validarCredenciais({ email: '  ', senha: '' })

    expect(erros.email).toBeTruthy()
    expect(erros.senha).toBeTruthy()
  })

  it('recusa e-mail sem arroba ou sem domínio', () => {
    expect(validarCredenciais({ email: 'ana', senha: 'x' }).email).toBeTruthy()
    expect(validarCredenciais({ email: 'ana@matsuya', senha: 'x' }).email).toBeTruthy()
  })

  /**
   * Validador rigoroso de e-mail é armadilha conhecida: recusa endereço válido,
   * e o usuário não tem a quem reclamar. Quem decide se existe é o servidor.
   */
  it('não recusa endereços válidos e incomuns', () => {
    for (const email of [
      'ana+pedidos@matsuya.com.br',
      "o'brien@loja.com",
      'ana.maria@sub.dominio.co',
    ]) {
      expect(validarCredenciais({ email, senha: 'x' }).email).toBeUndefined()
    }
  })

  it('aponta o e-mail antes da senha, que é a ordem da tela', () => {
    const erros = validarCredenciais({ email: '', senha: '' })

    expect(primeiroCampoInvalido(erros)).toBe('email')
  })

  it('sem erro, não há campo para focar', () => {
    expect(primeiroCampoInvalido({})).toBeNull()
  })
})

describe('mensagem de falha', () => {
  /**
   * A API devolve 404 para e-mail inexistente e 401 para senha errada, o que
   * permite descobrir quais e-mails estão cadastrados. A tela não repassa a
   * distinção — se este teste passar a diferenciar, o vazamento volta pela
   * interface mesmo depois de o servidor ser corrigido.
   */
  it('não conta se o que errou foi o e-mail ou a senha', () => {
    expect(mensagemDeFalha(erroDaApi(401))).toBe('E-mail ou senha incorretos.')
    expect(mensagemDeFalha(erroDaApi(404))).toBe('E-mail ou senha incorretos.')
  })

  /**
   * Com o Wi-Fi da loja caído, "e-mail ou senha incorretos" faz o operador
   * digitar a senha de novo, e de novo, convencido de que errou.
   */
  it('rede fora tem texto próprio, e fala da internet', () => {
    const texto = mensagemDeFalha(new FalhaDeRede(new Error('x')))

    expect(texto).toMatch(/internet/i)
    expect(texto).not.toMatch(/senha incorret/i)
  })

  it('excesso de tentativas manda esperar, não corrigir', () => {
    expect(mensagemDeFalha(erroDaApi(429))).toMatch(/tentativas/i)
  })

  it('erro do servidor não vira culpa de quem digitou', () => {
    const texto = mensagemDeFalha(erroDaApi(500))

    expect(texto).toMatch(/servidor/i)
    expect(texto).not.toMatch(/senha incorret/i)
  })

  it('outros erros repassam a mensagem da API', () => {
    expect(mensagemDeFalha(erroDaApi(400, 'E-mail e senha são obrigatórios'))).toBe(
      'E-mail e senha são obrigatórios'
    )
  })

  it('o que não é erro conhecido ainda vira frase em português', () => {
    const texto = mensagemDeFalha(new Error('boom'))

    expect(texto).toMatch(/^[A-ZÀ-Ú]/)
    expect(texto).not.toMatch(/boom/)
  })
})
