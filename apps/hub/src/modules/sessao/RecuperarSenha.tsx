import { useMemo, useState } from 'react'
import { Botao, CampoLinha, Faixa, Icone } from '@matsuya/ui'
import { criarApiDeSessao } from '@matsuya/api-client'
import { LayoutDeEntrada } from './LayoutDeEntrada'
import { config } from '../../app/config'
import { mensagemDeFalha } from './credenciais'

/**
 * Recuperar a senha, em três passos.
 *
 * A API já tinha o fluxo inteiro pronto — código de 6 dígitos guardado com hash
 * bcrypt, válido por 15 minutos — e nenhuma tela o usava. Isto aqui é só a
 * frente que faltava.
 *
 * ## O que a tela promete, e o que não promete
 *
 * `POST /auth/forgot-password` responde **200 mesmo para e-mail que não
 * existe**, de propósito: não contar a quem pergunta quais e-mails estão
 * cadastrados. A tela honra isso e diz "se o e-mail estiver cadastrado,
 * enviamos" — dizer "enviamos" desmentiria o cuidado que o servidor tomou, e um
 * atacante descobriria a mesma coisa pela diferença de texto.
 *
 * ## Três passos numa tela só
 *
 * Sem rota nem navegação: quem está trocando a senha às onze da noite não
 * precisa de histórico do navegador nem de link compartilhável. Um passo por
 * vez, com o anterior fora do caminho, é menos coisa para ler.
 */

type Passo = 'pedir' | 'conferir' | 'trocar' | 'pronto'

const TAMANHO_DO_CODIGO = 6
const MINIMO_DA_SENHA = 6

export function RecuperarSenha({ aoVoltar }: { aoVoltar: () => void }) {
  const [passo, definirPasso] = useState<Passo>('pedir')
  const [email, definirEmail] = useState('')
  const [codigo, definirCodigo] = useState('')
  const [senha, definirSenha] = useState('')
  const [mostrarSenha, definirMostrarSenha] = useState(false)
  const [tokenDeTroca, definirTokenDeTroca] = useState<string | null>(null)
  const [erro, definirErro] = useState<string | null>(null)
  const [ocupado, definirOcupado] = useState(false)

  const api = useMemo(() => criarApiDeSessao({ origem: config.socketUrl }), [])

  const executar = async (acao: () => Promise<void>) => {
    if (ocupado) return
    definirOcupado(true)
    definirErro(null)
    try {
      await acao()
    } catch (falha) {
      definirErro(mensagemDeFalha(falha))
    } finally {
      definirOcupado(false)
    }
  }

  const pedirCodigo = () =>
    executar(async () => {
      await api.pedirCodigo(email.trim())
      definirPasso('conferir')
    })

  const conferirCodigo = () =>
    executar(async () => {
      const { token } = await api.conferirCodigo(email.trim(), codigo.trim())
      definirTokenDeTroca(token)
      definirPasso('trocar')
    })

  const trocarSenha = () =>
    executar(async () => {
      await api.trocarSenha(tokenDeTroca!, senha)
      definirPasso('pronto')
    })

  const titulos: Record<Passo, { titulo: string; subtitulo: string }> = {
    pedir: { titulo: 'Recuperar senha', subtitulo: 'Informe o e-mail da sua conta.' },
    conferir: {
      titulo: 'Confira o código',
      /*
       * "Se estiver cadastrado" e não "enviamos": a API responde 200 mesmo para
       * e-mail inexistente justamente para não contar quais existem, e um texto
       * afirmativo entregaria pela porta da frente o que ela protege na de trás.
       */
      subtitulo: 'Se o e-mail estiver cadastrado, enviamos um código de 6 dígitos.',
    },
    trocar: { titulo: 'Nova senha', subtitulo: 'Escolha a senha que você vai usar a partir de agora.' },
    pronto: { titulo: 'Senha alterada', subtitulo: 'Tudo certo. Entre com a senha nova.' },
  }

  return (
    <LayoutDeEntrada titulo={titulos[passo].titulo} subtitulo={titulos[passo].subtitulo}>
      <form
        className="entrada__forma-campos"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (passo === 'pedir') void pedirCodigo()
          else if (passo === 'conferir') void conferirCodigo()
          else if (passo === 'trocar') void trocarSenha()
          else aoVoltar()
        }}
      >
        {erro && (
          <Faixa tom="perigo" icone="alerta">
            {erro}
          </Faixa>
        )}

        {passo === 'pedir' && (
          <>
            <CampoLinha
              id="email-recuperacao"
              rotulo="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              placeholder="voce@matsuya.com.br"
              value={email}
              onChange={(e) => definirEmail(e.target.value)}
            />
            <Botao
              type="submit"
              enfase="primaria"
              largo
              carregando={ocupado}
              disabled={email.trim().length === 0}
            >
              Enviar código
            </Botao>
          </>
        )}

        {passo === 'conferir' && (
          <>
            <CampoLinha
              id="codigo"
              rotulo="Código"
              /* `inputMode` numérico e não `type="number"`: o número esconde
                 zeros à esquerda e mostra setas de incremento, que num código
                 não querem dizer nada. */
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={TAMANHO_DO_CODIGO}
              autoFocus
              placeholder="000000"
              value={codigo}
              ajuda="O código vale por 15 minutos."
              onChange={(e) => definirCodigo(e.target.value.replace(/\D/g, ''))}
            />
            <Botao
              type="submit"
              enfase="primaria"
              largo
              carregando={ocupado}
              disabled={codigo.length < TAMANHO_DO_CODIGO}
            >
              Conferir
            </Botao>
            <button type="button" className="entrada__link" onClick={() => void pedirCodigo()}>
              Enviar de novo
            </button>
          </>
        )}

        {passo === 'trocar' && (
          <>
            <div className="entrada__senha">
              <CampoLinha
                id="nova-senha"
                rotulo="Nova senha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                value={senha}
                ajuda={`Pelo menos ${MINIMO_DA_SENHA} caracteres.`}
                onChange={(e) => definirSenha(e.target.value)}
              />
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
            <Botao
              type="submit"
              enfase="primaria"
              largo
              carregando={ocupado}
              disabled={senha.length < MINIMO_DA_SENHA}
            >
              Salvar nova senha
            </Botao>
          </>
        )}

        {passo === 'pronto' && (
          <Botao type="submit" enfase="primaria" largo>
            Ir para a entrada
          </Botao>
        )}

        {passo !== 'pronto' && (
          <button type="button" className="entrada__voltar" onClick={aoVoltar}>
            Voltar para a entrada
          </button>
        )}
      </form>
    </LayoutDeEntrada>
  )
}
