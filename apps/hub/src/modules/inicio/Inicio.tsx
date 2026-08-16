import { useEffect, useMemo, useState } from 'react'
import { Botao, EstadoVazio, Faixa, Icone, PainelDeSecao } from '@matsuya/ui'
import {
  createApiClient,
  criarApiDePainel,
  FalhaDaApi,
  type PainelDaUnidade,
} from '@matsuya/api-client'
import { config } from '../../app/config'
import { decorrido } from '../../app/formato'

/**
 * A home da unidade.
 *
 * Segue a estrutura da referência — saudação, grade de cartões, número grande
 * com comparação — com duas diferenças de substância:
 *
 * 1. **Sem os banners promocionais.** A referência usa a melhor área da tela
 *    para publicidade da própria plataforma. Aqui esse espaço vai para o
 *    estado da operação, que é a pergunta que o responsável faz ao chegar.
 *
 * 2. **Sem o cartão de horário de funcionamento.** A API não expõe horário de
 *    loja, e um cartão bonito com dado inventado é pior do que cartão nenhum.
 *
 * Esta tela **não** é o destino padrão do Hub: o tablet de balcão abre no
 * quadro, porque é para isso que ele é ligado. A home fica a um toque, para
 * quem chega querendo saber como está a loja.
 */

interface Props {
  unityId: number
  nomeDaUnidade: string
  nomeDoUsuario: string
  token: string | null
  agora: number
  aoIrParaOQuadro: () => void
}

export function Inicio({
  unityId,
  nomeDaUnidade,
  nomeDoUsuario,
  token,
  agora,
  aoIrParaOQuadro,
}: Props) {
  const [painel, definirPainel] = useState<PainelDaUnidade | null>(null)
  const [carregando, definirCarregando] = useState(true)
  const [erro, definirErro] = useState<string | null>(null)

  const api = useMemo(() => {
    const cliente = createApiClient({
      baseUrl: config.apiBaseUrl,
      obterToken: () => token,
    })
    return criarApiDePainel(cliente)
  }, [token])

  useEffect(() => {
    const controle = new AbortController()
    definirCarregando(true)
    definirErro(null)

    api
      .daUnidade(unityId, controle.signal)
      .then(definirPainel)
      .catch((falha) => {
        if (controle.signal.aborted) return
        definirErro(
          falha instanceof FalhaDaApi ? falha.message : 'Não foi possível carregar o painel.'
        )
      })
      .finally(() => {
        if (!controle.signal.aborted) definirCarregando(false)
      })

    return () => controle.abort()
  }, [api, unityId])

  if (carregando) {
    return (
      <main className="carregando">
        <span className="carregando__giro" aria-hidden="true" />
        <p role="status">Carregando o painel…</p>
      </main>
    )
  }

  if (erro || !painel) {
    return (
      <main className="inicio">
        <Faixa tom="perigo" icone="alerta">
          {erro ?? 'Painel indisponível.'}
        </Faixa>
      </main>
    )
  }

  const variacao = painel.mes.atual - painel.mes.mesmoPeriodoMesAnterior

  return (
    <main className="inicio">
      <header className="inicio__saudacao">
        <h1>
          Olá, <strong>{nomeDaUnidade}</strong>
        </h1>
        <p>{nomeDoUsuario}</p>
      </header>

      <div className="inicio__grade">
        {/*
          Este cartão ocupa o lugar do "Horário de funcionamento" da referência.
          É a pergunta que o responsável faz ao entrar na loja, e a única da
          home que muda de minuto em minuto.
        */}
        <PainelDeSecao titulo="Como está a loja agora">
          <div className="inicio__conteudo">
            <div className="inicio__linha-de-numeros">
              <div>
                <span className="inicio__numero num">{painel.operacao.emAberto}</span>
                <span className="inicio__rotulo">em aberto</span>
              </div>
              <div data-alerta={painel.operacao.atrasados > 0 || undefined}>
                <span className="inicio__numero num">{painel.operacao.atrasados}</span>
                <span className="inicio__rotulo">atrasados</span>
              </div>
            </div>

            {painel.operacao.maisAntigoEm && (
              <p className="inicio__nota">
                O mais antigo espera há{' '}
                <strong className="num">{decorrido(painel.operacao.maisAntigoEm, agora)}</strong>.
              </p>
            )}

            <Botao enfase="primaria" onClick={aoIrParaOQuadro}>
              Abrir o quadro
            </Botao>
          </div>
        </PainelDeSecao>

        <PainelDeSecao titulo="Itens pausados no cardápio">
          <div className="inicio__conteudo">
            <div>
              <span className="inicio__numero num">{painel.catalogo.pausados}</span>
              <span className="inicio__rotulo">
                de {painel.catalogo.total} {painel.catalogo.total === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {painel.catalogo.pausados === 0 ? (
              <p className="inicio__nota">
                <Icone nome="check" tamanho={14} /> O cardápio inteiro está disponível.
              </p>
            ) : (
              <p className="inicio__nota">
                Item pausado não aparece para o cliente. Reative pelo painel da rede.
              </p>
            )}
          </div>
        </PainelDeSecao>

        {/*
          Largura total e número gigante, como a referência. A comparação é com
          o MESMO PERÍODO do mês anterior, não com o mês fechado: no dia 5,
          comparar 5 dias contra 30 diria que o mês está péssimo todo começo de
          mês.
        */}
        <div className="inicio__largo">
          <PainelDeSecao titulo="Pedidos concluídos do mês">
            <div className="inicio__conteudo">
              <div className="inicio__destaque">
                <span className="inicio__numero inicio__numero--grande num">
                  {painel.mes.atual}
                </span>
                <span className="inicio__rotulo">mês atual</span>
              </div>

              <div className="inicio__comparacao">
                <span className="inicio__numero inicio__numero--medio num">
                  {painel.mes.mesmoPeriodoMesAnterior}
                </span>
                <span className="inicio__rotulo">mesmo período do mês anterior</span>

                {painel.mes.mesmoPeriodoMesAnterior > 0 && (
                  <span
                    className="inicio__variacao"
                    data-sentido={variacao >= 0 ? 'alta' : 'baixa'}
                  >
                    {variacao >= 0 ? '+' : ''}
                    {variacao}
                  </span>
                )}
              </div>
            </div>
          </PainelDeSecao>
        </div>

        <div className="inicio__largo">
          <PainelDeSecao titulo="Avaliações" contagem={painel.avaliacoes.total}>
            <div className="inicio__avaliacoes">
              <div className="inicio__destaque">
                <span className="inicio__numero inicio__numero--grande num">
                  {painel.avaliacoes.media ?? '—'}
                </span>
                <span className="inicio__rotulo">
                  {painel.avaliacoes.media === null ? 'sem notas ainda' : 'média'}
                </span>
              </div>

              <div className="inicio__comentarios">
                {painel.avaliacoes.comentarios.length === 0 ? (
                  <EstadoVazio
                    icone="pessoa"
                    titulo="Nenhum comentário"
                    descricao="Nenhum cliente escreveu sobre os pedidos desta loja."
                  />
                ) : (
                  painel.avaliacoes.comentarios.map((c) => (
                    <blockquote key={c.id} className="inicio__comentario">
                      <p>{c.texto}</p>
                      <footer className="num">{c.nota} de 5</footer>
                    </blockquote>
                  ))
                )}
              </div>
            </div>
          </PainelDeSecao>
        </div>
      </div>
    </main>
  )
}
