import { Botao, Icone, Modal, Selo } from '@matsuya/ui'
import { ORDER_ACTION_INFO } from '@matsuya/contracts'
import type { LinhaDaReconciliacao, ResultadoDoReenvio } from './useFilaOffline'

/**
 * O que aconteceu com o que você fez offline.
 *
 * Modal, e não faixa que some sozinha, por um motivo só: o operador trabalhou
 * sem rede e precisa **saber** se aquilo valeu. Uma notificação que desaparece
 * em cinco segundos, num balcão, é uma notificação que ninguém leu — e a
 * pergunta "o pedido foi aceito ou não?" volta pelo telefone.
 *
 * Exige reconhecimento explícito. É o único ponto do Hub em que isso se
 * justifica.
 */

const ROTULO: Record<ResultadoDoReenvio, string> = {
  aplicada: 'Enviada agora',
  'ja-estava': 'Já estava registrada',
  recusada: 'Não foi aplicada',
  vencida: 'Expirou',
}

const TOM: Record<ResultadoDoReenvio, 'sucesso' | 'informativo' | 'perigo' | 'atencao'> = {
  aplicada: 'sucesso',
  'ja-estava': 'informativo',
  recusada: 'perigo',
  vencida: 'atencao',
}

export function Reconciliacao({
  linhas,
  aoReconhecer,
}: {
  linhas: LinhaDaReconciliacao[]
  aoReconhecer: () => void
}) {
  const precisamDeAtencao = linhas.filter(
    (l) => l.resultado === 'recusada' || l.resultado === 'vencida'
  ).length

  return (
    <Modal
      aberto
      largura="largo"
      titulo="O que aconteceu enquanto você estava sem conexão"
      descricao={
        precisamDeAtencao > 0
          ? `${precisamDeAtencao} ${precisamDeAtencao === 1 ? 'ação precisa' : 'ações precisam'} da sua conferência.`
          : 'Tudo foi enviado. Confira e siga.'
      }
      // Sem `aoFechar` que dispense de leve: fechar é reconhecer.
      aoFechar={aoReconhecer}
      rodape={
        <Botao enfase="primaria" onClick={aoReconhecer}>
          Entendi
        </Botao>
      }
    >
      <ul className="reconciliacao">
        {linhas.map((linha) => (
          <li key={linha.acao.id} data-resultado={linha.resultado}>
            <div className="reconciliacao__linha">
              <strong>{linha.acao.codigoDoPedido ?? `#${linha.acao.orderId}`}</strong>
              <span className="reconciliacao__acao">
                {ORDER_ACTION_INFO[linha.acao.acao]?.rotulo ?? linha.acao.acao}
              </span>
              <Selo
                tom={TOM[linha.resultado]}
                icone={linha.resultado === 'aplicada' ? 'check' : 'alerta'}
              >
                {ROTULO[linha.resultado]}
              </Selo>
            </div>
            {linha.detalhe && <p className="reconciliacao__detalhe">{linha.detalhe}</p>}
          </li>
        ))}
      </ul>

      {precisamDeAtencao > 0 && (
        <p className="reconciliacao__nota">
          <Icone nome="alerta" tamanho={16} />
          Os pedidos acima podem ter sido tratados por outra pessoa. Abra cada um
          antes de repetir a ação.
        </p>
      )}
    </Modal>
  )
}
