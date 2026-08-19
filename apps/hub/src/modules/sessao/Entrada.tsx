import { useRef, useState } from 'react'
import { Botao, CampoDeSenha, CampoLinha, Faixa } from '@matsuya/ui'
import { LayoutDeEntrada } from './LayoutDeEntrada'
import {
  mensagemDeFalha,
  primeiroCampoInvalido,
  validarCredenciais,
  type ErrosDoFormulario,
} from './credenciais'

/**
 * A entrada do Hub.
 *
 * ## O que ela substitui
 *
 * Um campo onde se colava um JWT, com um atalho de desenvolvimento que entrava
 * como admin usando credenciais escritas no arquivo. Os dois saíram — inclusive
 * o atalho, inclusive em desenvolvimento. Um token colado não expira à vista de
 * ninguém, não é revogável por pessoa, e termina anotado em papel no monitor do
 * balcão.
 *
 * O enquadramento (formulário à esquerda, painel à direita) vive em
 * `LayoutDeEntrada`, compartilhado com a recuperação de senha.
 *
 * ## Acessibilidade que a tela anterior não tinha
 *
 * Rótulo visível em cada campo (não placeholder, que some ao digitar e leva
 * junto a única indicação do que era aquilo), erro anunciado com `role="alert"`
 * junto do campo, `autocomplete` correto para o gerenciador de senhas do tablet
 * funcionar, e foco levado ao primeiro campo com problema depois de um erro —
 * senão quem usa teclado precisa procurar onde foi.
 */
export function Entrada({
  aoEntrar,
  aoEsquecerSenha,
  erro,
}: {
  aoEntrar: (email: string, senha: string) => Promise<void>
  aoEsquecerSenha: () => void
  /** Erro vindo da sessão, ex.: "Sua sessão expirou." */
  erro: string | null
}) {
  const [email, definirEmail] = useState('')
  const [senha, definirSenha] = useState('')
  const [errosDoCampo, definirErrosDoCampo] = useState<ErrosDoFormulario>({})
  const [erroDoServidor, definirErroDoServidor] = useState<string | null>(null)
  const [entrando, definirEntrando] = useState(false)

  const campoDeEmail = useRef<HTMLInputElement>(null)
  const campoDeSenha = useRef<HTMLInputElement>(null)

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (entrando) return

    const erros = validarCredenciais({ email, senha })
    definirErrosDoCampo(erros)
    definirErroDoServidor(null)

    const invalido = primeiroCampoInvalido(erros)
    if (invalido) {
      // Levar o foco é o que transforma a mensagem em instrução. Sem isso, quem
      // usa teclado lê o erro e precisa procurar onde ele é.
      ;(invalido === 'email' ? campoDeEmail : campoDeSenha).current?.focus()
      return
    }

    definirEntrando(true)
    try {
      await aoEntrar(email.trim(), senha)
    } catch (falha) {
      definirErroDoServidor(mensagemDeFalha(falha))
      // A senha é o campo que a pessoa vai corrigir; o e-mail ela costuma
      // acertar. Selecionar o conteúdo poupa o apagar caractere a caractere.
      campoDeSenha.current?.focus()
      campoDeSenha.current?.select()
    } finally {
      definirEntrando(false)
    }
  }

  const aviso = erroDoServidor ?? erro

  return (
    <LayoutDeEntrada
      titulo="Bem-vindo de volta"
      subtitulo="Entre para abrir o quadro da sua loja."
    >
      <form className="entrada__forma-campos" onSubmit={enviar} noValidate>
        {aviso && (
          <Faixa tom="perigo" icone="alerta">
            {aviso}
          </Faixa>
        )}

        <CampoLinha
          id="email"
          rotulo="E-mail"
          type="email"
          inputMode="email"
          /* Sem isto o gerenciador de senhas do tablet não preenche, e o
             operador digita o e-mail inteiro em toda troca de turno. */
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          placeholder="voce@matsuya.com.br"
          ref={campoDeEmail}
          value={email}
          erro={errosDoCampo.email}
          onChange={(e) => definirEmail(e.target.value)}
        />

        <CampoDeSenha
          id="senha"
          rotulo="Senha"
          autoComplete="current-password"
          placeholder="Digite sua senha"
          ref={campoDeSenha}
          value={senha}
          erro={errosDoCampo.senha}
          onChange={(e) => definirSenha(e.target.value)}
        />

        <button type="button" className="entrada__link" onClick={aoEsquecerSenha}>
          Esqueci minha senha
        </button>

        <Botao type="submit" enfase="primaria" largo carregando={entrando}>
          Entrar
        </Botao>
      </form>
    </LayoutDeEntrada>
  )
}
