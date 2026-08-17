import { useRef, useState } from 'react'
import { Botao, CampoLinha, Faixa, Icone } from '@matsuya/ui'
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
 * ## O painel da esquerda
 *
 * É a única superfície com gradiente do sistema inteiro, e a exceção é
 * deliberada: esta é a única tela que não está a serviço de uma tarefa em
 * andamento. Em todas as outras, cor tem significado operacional — vermelho é
 * atraso, âmbar é aperto — e um painel decorativo competiria com um pedido
 * estourando. Aqui não há pedido nenhum.
 *
 * Não há imagem nem logotipo porque não existe nenhum no repositório: a marca é
 * tipográfica. É também o que mantém a tela abrindo com a internet da loja
 * ruim, que é quando alguém mais precisa entrar.
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
  const [mostrarSenha, definirMostrarSenha] = useState(false)
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
    <main className="entrada">
      <section className="entrada__marca" aria-hidden="true">
        <div className="entrada__marca-topo">
          <Icone nome="loja" tamanho={28} />
          <div>
            <p className="entrada__marca-nome">Order Hub</p>
            <p className="entrada__marca-rede">Matsuya</p>
          </div>
        </div>

        <p className="entrada__marca-frase">Sua operação em uma tela.</p>

        <ul className="entrada__marca-lista">
          <li>Pedidos ao vivo, sem recarregar</li>
          <li>Entregas e comandas no mesmo lugar</li>
          <li>Prazos que cobram sozinhos</li>
        </ul>
      </section>

      <section className="entrada__area">
        <form className="entrada__forma" onSubmit={enviar} noValidate>
          {/* Repetido para leitor de tela: o painel da marca é aria-hidden. */}
          <header className="entrada__cabecalho">
            <h1>Entrar</h1>
            <p>Acesso da operação · Order Hub Matsuya</p>
          </header>

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
            ref={campoDeEmail}
            value={email}
            erro={errosDoCampo.email}
            onChange={(e) => definirEmail(e.target.value)}
          />

          <div className="entrada__senha">
            <CampoLinha
              id="senha"
              rotulo="Senha"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="current-password"
              ref={campoDeSenha}
              value={senha}
              erro={errosDoCampo.senha}
              onChange={(e) => definirSenha(e.target.value)}
            />
            {/*
              Ver a senha existe porque teclado de tablet erra, e a alternativa
              é a pessoa apagar tudo e digitar de novo às cegas. O rótulo muda
              junto com o ícone: quem usa leitor de tela precisa saber o estado,
              não só a ação.
            */}
            <button
              type="button"
              className="entrada__olho"
              onClick={() => definirMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? 'Ocultar a senha' : 'Mostrar a senha'}
              aria-pressed={mostrarSenha}
            >
              <Icone nome={mostrarSenha ? 'olho-cortado' : 'olho'} tamanho={20} />
            </button>
          </div>

          <Botao type="submit" enfase="primaria" largo carregando={entrando}>
            Entrar
          </Botao>

          <button type="button" className="entrada__link" onClick={aoEsquecerSenha}>
            Esqueci minha senha
          </button>
        </form>
      </section>
    </main>
  )
}
