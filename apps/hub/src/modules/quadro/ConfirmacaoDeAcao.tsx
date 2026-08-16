import { useState } from 'react'
import { Botao, CampoSelect, CampoTexto, Modal } from '@matsuya/ui'
import {
  MENSAGEM_DO_PROBLEMA,
  ORDER_ACTION_INFO,
  opcoesDeMotivo,
  validarMotivo,
  type OrderAction,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'

/**
 * Confirmação de ação — com motivo, quando a ação exige.
 *
 * Vive num componente próprio porque o quadro e o detalhe do pedido oferecem as
 * mesmas ações. Duplicar o formulário faria as duas telas divergirem na
 * primeira vez que um motivo mudasse de regra — e a que ficasse para trás
 * enviaria dados que a API recusa.
 *
 * A validação só acusa erro **depois** da primeira tentativa de enviar. Marcar
 * o campo em vermelho enquanto a pessoa ainda está escolhendo é acusá-la de
 * errar antes de ela terminar.
 */
export function ConfirmacaoDeAcao({
  pedido,
  acao,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  pedido: PedidoDoQuadro
  acao: OrderAction
  ocupado: boolean
  aoConfirmar: (dados: { reasonCode?: string; reasonNote?: string }) => void
  aoCancelar: () => void
}) {
  const [codigo, definirCodigo] = useState('')
  const [texto, definirTexto] = useState('')
  const [tentou, definirTentou] = useState(false)

  const info = ORDER_ACTION_INFO[acao]
  const familia = info.motivo
  const problema = validarMotivo(familia, codigo || undefined, texto || undefined)

  function confirmar() {
    definirTentou(true)
    if (problema) return
    aoConfirmar({ reasonCode: codigo || undefined, reasonNote: texto || undefined })
  }

  return (
    <Modal
      aberto
      titulo={`${info.rotulo} · ${pedido.code ?? `#${pedido.id}`}`}
      descricao={
        familia
          ? 'O motivo entra no relatório da rede. Escolha o que mais se aproxima do que aconteceu.'
          : 'Confirme para seguir. Esta ação não pode ser desfeita.'
      }
      aoFechar={aoCancelar}
      rodape={
        <>
          <Botao enfase="fantasma" onClick={aoCancelar}>
            Voltar
          </Botao>
          <Botao enfase={info.enfase} carregando={ocupado} onClick={confirmar}>
            Confirmar {info.rotulo.toLowerCase()}
          </Botao>
        </>
      }
    >
      {familia ? (
        <>
          <CampoSelect
            id="motivo"
            rotulo="Motivo"
            obrigatorio
            value={codigo}
            onChange={(e) => definirCodigo(e.target.value)}
            erro={
              tentou && problema === 'REASON_REQUIRED'
                ? MENSAGEM_DO_PROBLEMA[problema]
                : undefined
            }
          >
            <option value="">Selecione…</option>
            {opcoesDeMotivo(familia).map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.rotulo}
              </option>
            ))}
          </CampoSelect>

          {codigo.endsWith('_OUTRO') && (
            <CampoTexto
              id="motivo-texto"
              rotulo="O que aconteceu"
              obrigatorio
              rows={3}
              value={texto}
              onChange={(e) => definirTexto(e.target.value)}
              ajuda="Pelo menos 10 caracteres. Este texto vai para o relatório."
              erro={
                tentou && problema === 'REASON_NOTE_REQUIRED'
                  ? MENSAGEM_DO_PROBLEMA[problema]
                  : undefined
              }
            />
          )}
        </>
      ) : (
        <p className="detalhe__texto">
          O pedido {pedido.code ?? `#${pedido.id}`} vai para{' '}
          <strong>{info.para.replace(/_/g, ' ')}</strong>.
        </p>
      )}
    </Modal>
  )
}
