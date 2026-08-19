import { useRef, useState } from 'react'
import { Botao, CampoDeSenha, Faixa, Modal } from '@matsuya/ui'
import { MINIMO_DA_SENHA } from '../sessao/credenciais'
import { expirarSessao } from '../../dados/cliente'
import {
  primeiroCampoInvalido,
  respostaDaFalha,
  validarTrocaDeSenha,
  type ErrosDaTroca,
} from './senha'

/**
 * Trocar a senha de quem já está dentro.
 *
 * ## O que este diálogo não promete
 *
 * Trocar a senha **não derruba sessão nenhuma** — nem esta, nem a de outro
 * aparelho. Verificado no `ensureAuth` da API: ele confere a assinatura do
 * token, busca o usuário e olha `disabledAt`. Não existe versão de senha, nem
 * `jti`, nem lista de revogação. O único jeito de matar um token vivo antes da
 * hora é desativar a conta.
 *
 * Por isso o aviso de sucesso diz isso com todas as letras e nomeia o caminho
 * real. Um "pronto, agora está seguro" seria teatro, e teatro de segurança é
 * pior do que silêncio: ele impede a pessoa de tomar a atitude que resolveria.
 *
 * ## Por que não desloga sozinho depois
 *
 * Derrubar o operador no meio do turno como gesto de segurança, sabendo que
 * isso não invalida nada em lugar nenhum, custa trabalho real e não compra
 * nada. O botão de sair está logo abaixo, para quem quiser.
 */

/**
 * O `Modal` renderiza o rodapé **fora** do corpo, então o botão de confirmar
 * não é filho do `<form>`. O atributo `form` religa os dois — é para isso que
 * ele existe no HTML, e sem ele o Enter num campo não enviaria nada.
 */
const ID_DO_FORMULARIO = 'forma-da-troca-de-senha'

export function TrocaDeSenha({
  aberto,
  aoFechar,
  aoTrocar,
  aoConcluir,
}: {
  aberto: boolean
  aoFechar: () => void
  aoTrocar: (atual: string, nova: string) => Promise<void>
  aoConcluir: () => void
}) {
  const [atual, definirAtual] = useState('')
  const [nova, definirNova] = useState('')
  const [confirmacao, definirConfirmacao] = useState('')
  const [erros, definirErros] = useState<ErrosDaTroca>({})
  const [avisoGeral, definirAvisoGeral] = useState<string | null>(null)
  const [ocupado, definirOcupado] = useState(false)

  const campos = {
    atual: useRef<HTMLInputElement>(null),
    nova: useRef<HTMLInputElement>(null),
    confirmacao: useRef<HTMLInputElement>(null),
  }

  const limpar = () => {
    definirAtual('')
    definirNova('')
    definirConfirmacao('')
    definirErros({})
    definirAvisoGeral(null)
  }

  const fechar = () => {
    // Fechar no meio da requisição deixaria a pessoa sem saber se a senha mudou
    // ou não — e a próxima tentativa começaria com a dúvida de qual usar.
    if (ocupado) return
    limpar()
    aoFechar()
  }

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault()
    if (ocupado) return

    const encontrados = validarTrocaDeSenha({ atual, nova, confirmacao })
    definirErros(encontrados)
    definirAvisoGeral(null)

    const primeiro = primeiroCampoInvalido(encontrados)
    if (primeiro) {
      // A mensagem só vira instrução quando o cursor está no campo que ela cita.
      campos[primeiro].current?.focus()
      return
    }

    definirOcupado(true)

    try {
      await aoTrocar(atual, nova)
      limpar()
      aoConcluir()
    } catch (falha) {
      const resposta = respostaDaFalha(falha)

      if (resposta.tipo === 'sessao-expirada') {
        // Não é assunto deste diálogo: o gancho global desloga com aviso, do
        // mesmo jeito que faz para qualquer 401 de qualquer tela.
        expirarSessao()
        return
      }

      if (resposta.tipo === 'campo') {
        definirErros({ [resposta.campo]: resposta.texto })
        campos[resposta.campo].current?.focus()
        return
      }

      definirAvisoGeral(resposta.texto)
    } finally {
      definirOcupado(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Alterar senha"
      descricao="Vale para entrar no Hub e no aplicativo com esta mesma conta."
      aoFechar={fechar}
      rodape={
        <>
          <Botao enfase="fantasma" onClick={fechar} disabled={ocupado}>
            Cancelar
          </Botao>
          <Botao
            enfase="primaria"
            type="submit"
            form={ID_DO_FORMULARIO}
            carregando={ocupado}
          >
            Salvar nova senha
          </Botao>
        </>
      }
    >
      <form id={ID_DO_FORMULARIO} className="conta__forma" noValidate onSubmit={enviar}>
        {avisoGeral && (
          <Faixa tom="perigo" icone="alerta">
            {avisoGeral}
          </Faixa>
        )}

        {/*
          Sem olho na senha de agora: ninguém precisa reler o que já sabe, e um
          alvo a menos entre três campos é um alvo a menos para errar no toque.
        */}
        <CampoDeSenha
          id="senha-atual"
          rotulo="Senha de agora"
          autoComplete="current-password"
          revelavel={false}
          ref={campos.atual}
          value={atual}
          erro={erros.atual}
          onChange={(e) => definirAtual(e.target.value)}
        />

        <CampoDeSenha
          id="senha-nova"
          rotulo="Nova senha"
          autoComplete="new-password"
          ajuda={`Pelo menos ${MINIMO_DA_SENHA} caracteres. Uma frase que só você saiba é mais difícil de descobrir do que uma palavra com símbolos.`}
          ref={campos.nova}
          value={nova}
          erro={erros.nova}
          onChange={(e) => definirNova(e.target.value)}
        />

        <CampoDeSenha
          id="senha-confirmacao"
          rotulo="Repita a nova senha"
          autoComplete="new-password"
          ref={campos.confirmacao}
          value={confirmacao}
          erro={erros.confirmacao}
          onChange={(e) => definirConfirmacao(e.target.value)}
        />
      </form>
    </Modal>
  )
}
