import { FalhaDaApi, FalhaDeRede } from '@matsuya/api-client'
import { MINIMO_DA_SENHA } from '../sessao/credenciais'

/**
 * As regras de trocar a senha, sem React.
 *
 * Separadas porque são exatamente o que precisa ser conferido: o texto que a
 * pessoa lê quando a troca não deu certo, e em **qual campo** ele aparece. Uma
 * mensagem certa no campo errado obriga a adivinhar, e adivinhar com o salão
 * cheio é o que faz alguém desistir e continuar com a senha antiga.
 */

export interface DadosDaTroca {
  atual: string
  nova: string
  confirmacao: string
}

export interface ErrosDaTroca {
  atual?: string
  nova?: string
  confirmacao?: string
}

/**
 * Validação local, antes de ir à rede.
 *
 * ## O que NÃO é exigido, de propósito
 *
 * Nada de maiúscula, dígito ou símbolo obrigatórios. A API não exige nada disso
 * neste caminho, e inventar a regra só aqui produziria uma senha que esta tela
 * recusa e que o resto do sistema aceita sem reclamar — inclusive o fluxo de
 * "esqueci minha senha", pelo qual a mesma pessoa contornaria a exigência em
 * dois minutos. Regra que se contorna não é regra, é atrito.
 *
 * ## Espaço nas pontas é senha
 *
 * Nunca aparar. Quem escolheu uma senha que termina em espaço vai digitá-la
 * assim para sempre, e "arrumar" aqui a tornaria impossível de usar.
 */
export function validarTrocaDeSenha(dados: DadosDaTroca): ErrosDaTroca {
  const erros: ErrosDaTroca = {}

  if (dados.atual === '') erros.atual = 'Informe a senha que você usa hoje.'

  /*
   * Conta por caractere visível e não por unidade UTF-16: `'👍👍👍'.length` é 6,
   * e uma senha de três emojis passaria como se tivesse seis caracteres.
   */
  if ([...dados.nova].length < MINIMO_DA_SENHA) {
    erros.nova = `Use pelo menos ${MINIMO_DA_SENHA} caracteres.`
  } else if (dados.nova === dados.atual) {
    // O servidor aceita repetir sem reclamar — ele só confere a atual e grava o
    // que vier. Sem esta checagem, a pessoa "trocaria" a senha sem trocar nada.
    erros.nova = 'A senha nova precisa ser diferente da atual.'
  }

  if (dados.confirmacao !== dados.nova) {
    erros.confirmacao = 'As duas não são iguais.'
  }

  return erros
}

/** Para levar o foco ao primeiro problema, na ordem em que a tela os mostra. */
export function primeiroCampoInvalido(erros: ErrosDaTroca): keyof ErrosDaTroca | null {
  if (erros.atual) return 'atual'
  if (erros.nova) return 'nova'
  if (erros.confirmacao) return 'confirmacao'
  return null
}

export type RespostaDaFalha =
  | { tipo: 'campo'; campo: keyof ErrosDaTroca; texto: string }
  | { tipo: 'geral'; texto: string }
  /** Token morto de verdade: quem chama precisa derrubar a sessão, não avisar. */
  | { tipo: 'sessao-expirada' }

/**
 * Traduz a falha do servidor para onde ela deve aparecer.
 *
 * "Senha incorreta" pertence ao campo da senha atual, não a uma faixa genérica
 * no topo: o erro tem um culpado óbvio e apontá-lo economiza a releitura dos
 * três campos.
 *
 * O `401` **não** é senha errada. Confundir os dois é o defeito clássico desta
 * tela: a pessoa digita a senha certa, a sessão tinha vencido, e ela passa a
 * duvidar da própria senha.
 */
export function respostaDaFalha(falha: unknown): RespostaDaFalha {
  if (falha instanceof FalhaDeRede) {
    return {
      tipo: 'geral',
      texto: 'Não conseguimos falar com o servidor. Confira a internet da loja.',
    }
  }

  if (falha instanceof FalhaDaApi) {
    if (falha.status === 401) return { tipo: 'sessao-expirada' }

    if (falha.status === 429) {
      return {
        tipo: 'geral',
        texto: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
      }
    }

    if (falha.status === 400 && /senha incorreta/i.test(falha.message)) {
      return {
        tipo: 'campo',
        campo: 'atual',
        texto: 'Essa não é a sua senha de agora.',
      }
    }

    // Preserva o texto do servidor: é a mensagem que a pessoa mais precisa ler,
    // e trocá-la por um genérico é o defeito que o cliente de sessão existe
    // justamente para evitar.
    if (falha.status >= 400 && falha.status < 500) {
      return { tipo: 'geral', texto: falha.message }
    }
  }

  return { tipo: 'geral', texto: 'Não deu para trocar a senha agora. Tente de novo.' }
}
