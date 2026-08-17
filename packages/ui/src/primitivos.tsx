import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes } from 'react'
import { Icone, type NomeDoIcone } from './Icone'

/**
 * Primitivos pequenos que aparecem em quase toda tela do Hub.
 *
 * Ficam juntos de propósito: um arquivo por componente de dez linhas dilui a
 * leitura mais do que ajuda, e todos aqui compartilham a mesma regra —
 * rótulo visível, alvo de 44 px, estado anunciado.
 */

// ── Selo de status ────────────────────────────────────────────────────────

export type TomDoSelo = 'neutro' | 'informativo' | 'atencao' | 'sucesso' | 'perigo' | 'urgente'

export function Selo({
  tom = 'neutro',
  icone,
  children,
}: {
  tom?: TomDoSelo
  icone?: NomeDoIcone
  children: ReactNode
}) {
  return (
    <span className="ui-selo" data-tom={tom}>
      {icone && <Icone nome={icone} tamanho={14} />}
      {children}
    </span>
  )
}

// ── Campos ────────────────────────────────────────────────────────────────

/**
 * Rótulo sempre visível, nunca só o placeholder.
 *
 * Placeholder como rótulo desaparece assim que a pessoa começa a digitar — e
 * com ele some a única indicação do que aquele campo era.
 */
function Rotulo({
  htmlFor,
  children,
  obrigatorio,
}: {
  htmlFor: string
  children: ReactNode
  obrigatorio?: boolean
}) {
  return (
    <label className="ui-campo__rotulo" htmlFor={htmlFor}>
      {children}
      {obrigatorio && (
        <span className="ui-campo__obrigatorio" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}

export interface PropsDoSelect extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string
  rotulo: string
  /** Texto de apoio permanente, abaixo do campo. */
  ajuda?: string
  erro?: string
  obrigatorio?: boolean
}

export function CampoSelect({ id, rotulo, ajuda, erro, obrigatorio, ...resto }: PropsDoSelect) {
  const idDaAjuda = ajuda ? `${id}-ajuda` : undefined
  const idDoErro = erro ? `${id}-erro` : undefined

  return (
    <div className="ui-campo">
      <Rotulo htmlFor={id} obrigatorio={obrigatorio}>
        {rotulo}
      </Rotulo>
      <select
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[idDoErro, idDaAjuda].filter(Boolean).join(' ') || undefined}
        aria-required={obrigatorio || undefined}
        {...resto}
      />
      {/* O erro vem antes da ajuda na ordem de leitura: quem errou precisa
          primeiro saber o que fazer, não reler a instrução. */}
      {erro && (
        <p id={idDoErro} className="ui-campo__erro" role="alert">
          <Icone nome="alerta" tamanho={14} />
          {erro}
        </p>
      )}
      {ajuda && (
        <p id={idDaAjuda} className="ui-campo__ajuda">
          {ajuda}
        </p>
      )}
    </div>
  )
}

export interface PropsDaAreaDeTexto extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string
  rotulo: string
  ajuda?: string
  erro?: string
  obrigatorio?: boolean
}

export function CampoTexto({ id, rotulo, ajuda, erro, obrigatorio, ...resto }: PropsDaAreaDeTexto) {
  const idDaAjuda = ajuda ? `${id}-ajuda` : undefined
  const idDoErro = erro ? `${id}-erro` : undefined

  return (
    <div className="ui-campo">
      <Rotulo htmlFor={id} obrigatorio={obrigatorio}>
        {rotulo}
      </Rotulo>
      <textarea
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[idDoErro, idDaAjuda].filter(Boolean).join(' ') || undefined}
        aria-required={obrigatorio || undefined}
        {...resto}
      />
      {erro && (
        <p id={idDoErro} className="ui-campo__erro" role="alert">
          <Icone nome="alerta" tamanho={14} />
          {erro}
        </p>
      )}
      {ajuda && (
        <p id={idDaAjuda} className="ui-campo__ajuda">
          {ajuda}
        </p>
      )}
    </div>
  )
}

export interface PropsDaLinhaDeTexto extends InputHTMLAttributes<HTMLInputElement> {
  id: string
  rotulo: string
  ajuda?: string
  erro?: string
  obrigatorio?: boolean
}

/**
 * Entrada de uma linha.
 *
 * Existe ao lado de `CampoTexto` (que é `textarea`) porque a diferença importa
 * para quem usa teclado e leitor de tela: num `textarea`, Enter quebra linha em
 * vez de enviar o formulário, e um campo de nome que não envia com Enter é o
 * tipo de atrito que ninguém reporta e todo mundo sente.
 */
export function CampoLinha({ id, rotulo, ajuda, erro, obrigatorio, ...resto }: PropsDaLinhaDeTexto) {
  const idDaAjuda = ajuda ? `${id}-ajuda` : undefined
  const idDoErro = erro ? `${id}-erro` : undefined

  return (
    <div className="ui-campo">
      <Rotulo htmlFor={id} obrigatorio={obrigatorio}>
        {rotulo}
      </Rotulo>
      <input
        id={id}
        type="text"
        aria-invalid={erro ? true : undefined}
        aria-describedby={[idDoErro, idDaAjuda].filter(Boolean).join(' ') || undefined}
        aria-required={obrigatorio || undefined}
        {...resto}
      />
      {erro && (
        <p id={idDoErro} className="ui-campo__erro" role="alert">
          <Icone nome="alerta" tamanho={14} />
          {erro}
        </p>
      )}
      {ajuda && (
        <p id={idDaAjuda} className="ui-campo__ajuda">
          {ajuda}
        </p>
      )}
    </div>
  )
}

// ── Estado vazio ──────────────────────────────────────────────────────────

/**
 * Vazio com explicação, nunca espaço em branco.
 *
 * Uma coluna vazia sem texto é ambígua: não dá para saber se não há pedido ou
 * se a tela falhou em carregar. Numa cozinha, essa dúvida vira uma ligação
 * para o suporte.
 */
export function EstadoVazio({
  icone = 'sacola',
  titulo,
  descricao,
  acao,
}: {
  icone?: NomeDoIcone
  titulo: string
  descricao?: string
  acao?: ReactNode
}) {
  return (
    <div className="ui-vazio">
      <Icone nome={icone} tamanho={28} />
      <p className="ui-vazio__titulo">{titulo}</p>
      {descricao && <p className="ui-vazio__descricao">{descricao}</p>}
      {acao}
    </div>
  )
}

// ── Faixa de aviso ────────────────────────────────────────────────────────

/**
 * `role="status"` para informação, `role="alert"` para erro.
 *
 * A diferença importa: `alert` interrompe o leitor de tela na hora, `status`
 * espera a pausa. Usar `alert` para tudo transforma toda mudança de conexão
 * numa interrupção, e a pessoa desliga o leitor.
 */
export function Faixa({
  tom = 'informativo',
  icone,
  children,
  acao,
}: {
  tom?: TomDoSelo
  icone?: NomeDoIcone
  children: ReactNode
  acao?: ReactNode
}) {
  const critico = tom === 'perigo' || tom === 'urgente'

  return (
    <div className="ui-faixa" data-tom={tom} role={critico ? 'alert' : 'status'} aria-live={critico ? 'assertive' : 'polite'}>
      {icone && <Icone nome={icone} tamanho={18} />}
      <span className="ui-faixa__texto">{children}</span>
      {acao}
    </div>
  )
}
