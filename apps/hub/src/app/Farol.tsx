import { useEffect, useMemo, useRef, useState } from 'react'
import { Botao, Icone, Modal } from '@matsuya/ui'
import {
  createApiClient,
  criarApiDeAlertas,
  type AlertasDaUnidade,
} from '@matsuya/api-client'
import { config } from './config'

/**
 * Farol da Operação.
 *
 * Junta num lugar só o que exige decisão e está espalhado por várias telas:
 * pedido fora do prazo, cancelamento recente, item pausado, e o estado do
 * próprio tablet.
 *
 * Os alertas do dispositivo — impressão e conexão — ficam num grupo separado
 * dos da loja, e não misturados. São coisas diferentes: um "3 atrasados" é
 * problema da operação e segue igual em qualquer tela; um "comanda não saiu" é
 * problema **deste** tablet, e some quando alguém abre o Hub em outro. Juntar
 * os dois faria o responsável procurar na loja um defeito que está na máquina.
 */

export type GravidadeDoFarol = 'ok' | 'atencao' | 'critico'

export interface AlertaDoDispositivo {
  chave: string
  gravidade: 'atencao' | 'critico'
  texto: string
}

interface AlertasPorLoja {
  unityId: number
  nome: string
  alertas: AlertasDaUnidade | null
}

function totalDaLoja(a: AlertasDaUnidade | null): number {
  if (!a) return 0
  return a.atrasados + a.canceladosDuasHoras + a.itensPausados
}

export function useFarol(
  unidades: ReadonlyArray<{ id: number; name: string }>,
  token: string | null,
  /** Recalcula quando o quadro muda, para não ficar velho na tela. */
  gatilho: unknown
) {
  const [porLoja, definirPorLoja] = useState<AlertasPorLoja[]>([])
  const emCurso = useRef(false)

  const api = useMemo(() => {
    const cliente = createApiClient({ baseUrl: config.apiBaseUrl, obterToken: () => token })
    return criarApiDeAlertas(cliente)
  }, [token])

  useEffect(() => {
    if (unidades.length === 0 || emCurso.current) return

    const controle = new AbortController()
    emCurso.current = true

    Promise.all(
      unidades.map(async (u) => ({
        unityId: u.id,
        nome: u.name,
        // Uma loja que falha não derruba o farol das outras: um erro de rede
        // numa unidade esconderia os alertas reais de todas as demais.
        alertas: await api.daUnidade(u.id, controle.signal).catch(() => null),
      }))
    )
      .then((resultado) => {
        if (!controle.signal.aborted) definirPorLoja(resultado)
      })
      .finally(() => {
        emCurso.current = false
      })

    return () => controle.abort()
    // `gatilho` entra de propósito: o farol reconsulta quando o quadro muda.
  }, [api, unidades, gatilho])

  const totalDaOperacao = porLoja.reduce((soma, l) => soma + totalDaLoja(l.alertas), 0)
  const atrasados = porLoja.reduce((soma, l) => soma + (l.alertas?.atrasados ?? 0), 0)

  return { porLoja, totalDaOperacao, atrasados }
}

export function Farol({
  porLoja,
  alertasDoDispositivo,
  aoFechar,
}: {
  porLoja: AlertasPorLoja[]
  alertasDoDispositivo: AlertaDoDispositivo[]
  aoFechar: () => void
}) {
  const comAlerta = porLoja.filter((l) => totalDaLoja(l.alertas) > 0)

  return (
    <Modal
      aberto
      largura="largo"
      titulo="Farol da Operação"
      descricao="O que precisa de decisão agora, nas lojas abertas e neste tablet."
      aoFechar={aoFechar}
      rodape={
        <Botao enfase="primaria" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="farol">
        <section className="farol__lojas" aria-label="Suas lojas">
          <h3>Suas lojas</h3>
          <ul>
            {porLoja.map((loja) => {
              const total = totalDaLoja(loja.alertas)
              return (
                <li key={loja.unityId}>
                  <span
                    className="farol__ponto"
                    data-estado={
                      loja.alertas === null ? 'desconhecido' : total > 0 ? 'alerta' : 'ok'
                    }
                    aria-hidden="true"
                  />
                  <span className="farol__nome">
                    {loja.nome}
                    <small>
                      {loja.alertas === null
                        ? 'não foi possível consultar'
                        : total === 0
                          ? 'sem alerta'
                          : `${total} ${total === 1 ? 'alerta' : 'alertas'}`}
                    </small>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="farol__detalhe" aria-label="Alertas">
          {comAlerta.length === 0 && alertasDoDispositivo.length === 0 ? (
            <div className="farol__tudo-bem">
              <Icone nome="check" tamanho={28} />
              <p>Suas lojas estão funcionando normalmente</p>
              <small>
                Nenhum pedido fora do prazo, nenhum cancelamento recente e nenhum
                item pausado.
              </small>
            </div>
          ) : (
            <>
              {comAlerta.map((loja) => (
                <article key={loja.unityId} className="farol__grupo">
                  <h4>{loja.nome}</h4>
                  <ul>
                    {loja.alertas!.atrasados > 0 && (
                      <li data-gravidade="critico">
                        <strong>{loja.alertas!.atrasados}</strong> fora do prazo de
                        aceite ou preparo
                      </li>
                    )}
                    {loja.alertas!.canceladosDuasHoras > 0 && (
                      <li data-gravidade="atencao">
                        <strong>{loja.alertas!.canceladosDuasHoras}</strong>{' '}
                        {loja.alertas!.canceladosDuasHoras === 1
                          ? 'cancelamento'
                          : 'cancelamentos'}{' '}
                        nas últimas 2 horas
                      </li>
                    )}
                    {loja.alertas!.itensPausados > 0 && (
                      <li data-gravidade="atencao">
                        <strong>{loja.alertas!.itensPausados}</strong>{' '}
                        {loja.alertas!.itensPausados === 1
                          ? 'item pausado no cardápio'
                          : 'itens pausados no cardápio'}
                      </li>
                    )}
                  </ul>
                </article>
              ))}

              {alertasDoDispositivo.length > 0 && (
                <article className="farol__grupo farol__grupo--dispositivo">
                  <h4>Este tablet</h4>
                  <p className="farol__nota">
                    Vale só para este dispositivo — some ao abrir o Hub em outro.
                  </p>
                  <ul>
                    {alertasDoDispositivo.map((alerta) => (
                      <li key={alerta.chave} data-gravidade={alerta.gravidade}>
                        {alerta.texto}
                      </li>
                    ))}
                  </ul>
                </article>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}
