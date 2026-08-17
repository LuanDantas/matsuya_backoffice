import { FalhaDaApi, FalhaDeRede } from '@matsuya/api-client'

/**
 * As regras do formulário de entrada, sem React.
 *
 * Separadas porque são o que mais muda e o que mais precisa ser conferido: o
 * texto que o operador lê quando não consegue entrar às onze da noite com o
 * salão cheio. Testá-las exige zero DOM.
 */

export interface Credenciais {
  email: string
  senha: string
}

export interface ErrosDoFormulario {
  email?: string
  senha?: string
}

/**
 * Validação local, antes de ir à rede.
 *
 * Deliberadamente frouxa no e-mail: exige `@` e um ponto depois dele, e nada
 * além disso. Validador de e-mail rigoroso é uma armadilha conhecida — ele
 * recusa endereços válidos e o usuário fica sem entender por quê, sem ninguém
 * para reclamar. Quem decide se o e-mail existe é o servidor.
 */
export function validarCredenciais(dados: Credenciais): ErrosDoFormulario {
  const erros: ErrosDoFormulario = {}
  const email = dados.email.trim()

  if (email.length === 0) erros.email = 'Informe seu e-mail.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    erros.email = 'Esse e-mail parece incompleto.'
  }

  if (dados.senha.length === 0) erros.senha = 'Informe sua senha.'

  return erros
}

/** O primeiro campo com problema, para levar o foco até ele. */
export function primeiroCampoInvalido(erros: ErrosDoFormulario): keyof ErrosDoFormulario | null {
  if (erros.email) return 'email'
  if (erros.senha) return 'senha'
  return null
}

/**
 * A falha do servidor traduzida para o que o operador precisa fazer.
 *
 * Duas decisões que valem explicação:
 *
 * **Credencial errada nunca diz qual das duas está errada.** A API hoje devolve
 * 404 para e-mail inexistente e 401 para senha errada, o que permite descobrir
 * quais e-mails estão cadastrados. A tela não repassa essa distinção — e o
 * servidor vai deixar de fazê-la também. Enquanto isso, quem protege é aqui.
 *
 * **Rede fora tem texto próprio.** "E-mail ou senha incorretos" com o Wi-Fi da
 * loja caído faz o operador digitar a senha de novo, e de novo, convencido de
 * que errou. O problema é outro, e a tela precisa dizer qual.
 */
export function mensagemDeFalha(falha: unknown): string {
  if (falha instanceof FalhaDeRede) {
    return 'Não conseguimos falar com o servidor. Confira a internet da loja e tente de novo.'
  }

  if (falha instanceof FalhaDaApi) {
    if (falha.status === 401 || falha.status === 404) {
      return 'E-mail ou senha incorretos.'
    }
    if (falha.status === 429) {
      return 'Muitas tentativas seguidas. Espere um instante e tente de novo.'
    }
    if (falha.status >= 500) {
      return 'O servidor não conseguiu responder agora. Tente de novo em instantes.'
    }
    return falha.message
  }

  return 'Não foi possível entrar. Tente de novo.'
}
