import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Botao, EstadoVazio, Faixa, Icone, type NomeDoIcone } from '@matsuya/ui'
import {
  criarApiDePainel,
  FalhaDaApi,
  type PainelDaUnidade,
} from '@matsuya/api-client'
import { criarCliente } from '../../dados/cliente'
import { aguardarPiso, PISO_DE_ATUALIZACAO_MS } from '../../dados/piso'
import { decorrido } from '../../app/formato'
import { corDaLoja, nomeDaLoja } from '../../app/loja'
import {
  agregarPaineis,
  primeiroNome,
  saudacao,
  variacao,
  type PainelDeLoja,
  type Variacao,
} from './painel'
import { CurvaDoMes } from './CurvaDoMes'
import { LojasDoPainel } from './LojasDoPainel'

/**
 * A home da unidade.
 *
 * Responde a uma pergunta só, em duas velocidades: **como a loja está agora** e
 * **como o mês está indo**. A faixa de cima muda de minuto em minuto; os
 * cartões de baixo mudam devagar. A ordem na tela é essa porque é a ordem em
 * que se pergunta.
 *
 * Esta tela **não** é o destino padrão do Hub: o tablet de balcão abre no
 * quadro, porque é para isso que ele é ligado. E ela é gateada por
 * `reports:read`, que o atendente de balcão não tem — o público daqui é
 * gerente, regional ou admin de rede, quase sempre num monitor grande. É por
 * isso que ela ocupa a largura toda, e as telas de operação não.
 *
 * Sem os banners promocionais da referência: aquela é a melhor área da tela, e
 * aqui ela vai para o estado da operação.
 */

interface Props {
  /**
   * As lojas selecionadas, na ordem do seletor.
   *
   * O painel reflete a seleção inteira, e não a unidade em foco: quem escolheu
   * três lojas quer saber como vão as três. Com uma só, o resultado é
   * idêntico ao de antes — a agregação de um item é o próprio item.
   */
  unidades: Array<{ id: number; nome: string }>
  nomeDoUsuario: string
  token: string | null
  agora: number
  aoIrParaOQuadro: () => void
}

const dataPorExtenso = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const dinheiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const inteiro = new Intl.NumberFormat('pt-BR')

const porcento = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

const relativo = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

const relogio = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export function Inicio({
  unidades,
  nomeDoUsuario,
  token,
  agora,
  aoIrParaOQuadro,
}: Props) {
  const [lojas, definirLojas] = useState<PainelDeLoja[] | null>(null)
  const [carregando, definirCarregando] = useState(true)
  const [atualizando, definirAtualizando] = useState(false)
  const [erro, definirErro] = useState<string | null>(null)
  const [gatilho, definirGatilho] = useState(0)
  /**
   * Quando estes números foram lidos.
   *
   * A home mostra uma fotografia e nunca dizia de quando. Com o botão de
   * atualizar isso virou defeito visível: números idênticos voltando em 5 ms
   * não mudam nada na tela, e quem clicou conclui que o botão está quebrado.
   * O relógio é a resposta honesta — ele muda a cada leitura mesmo quando o
   * dado não muda, porque o que mudou de fato foi a idade da informação.
   */
  const [lidoEm, definirLidoEm] = useState<number | null>(null)

  const api = useMemo(() => criarApiDePainel(criarCliente(() => token)), [token])

  // Chave estável: sem isto o efeito refaz a busca a cada render, porque o
  // array de unidades é recriado pela `Casca` toda vez.
  const chaveDasUnidades = useMemo(
    () => unidades.map((u) => u.id).join(','),
    [unidades]
  )

  // Primeira carga tem esqueleto e piso; atualização mantém a tela e só
  // esmaece. São esperas diferentes: uma é "ainda não sei nada", a outra é
  // "sei, e estou conferindo".
  const primeiraCarga = useRef(true)

  useEffect(() => {
    const controle = new AbortController()
    const comecou = Date.now()
    const inicial = primeiraCarga.current

    if (inicial) definirCarregando(true)
    else definirAtualizando(true)
    definirErro(null)

    /*
     * Uma requisição por loja, em paralelo.
     *
     * `Promise.all` e não uma sequência: a tela pinta uma vez, quando todas
     * voltarem. É a mesma decisão que a rota do painel documenta ("uma home que
     * se monta aos pedaços parece quebrada mesmo quando funciona") e o mesmo
     * caminho que o Farol já percorre para os alertas de cada unidade.
     *
     * Se uma loja falhar, o conjunto falha: um total que soma oito de nove
     * lojas e não diz qual ficou de fora é pior do que um erro honesto.
     */
    Promise.all(
      unidades.map((u) =>
        api.daUnidade(u.id, controle.signal).then((painel) => ({
          unidade: u.id,
          nome: u.nome,
          painel,
        }))
      )
    )
      .then(async (dados) => {
        if (controle.signal.aborted) return
        definirLojas(dados)
        definirLidoEm(Date.now())
        // A primeira carga tem presença (3s de esqueleto); a atualização tem
        // só o instante que o olho precisa para registrar a mudança de estado.
        await aguardarPiso(comecou, inicial ? undefined : PISO_DE_ATUALIZACAO_MS)
      })
      .catch((falha) => {
        if (controle.signal.aborted) return
        definirErro(
          falha instanceof FalhaDaApi ? falha.message : 'Não foi possível carregar o painel.'
        )
      })
      .finally(() => {
        if (controle.signal.aborted) return
        primeiraCarga.current = false
        definirCarregando(false)
        definirAtualizando(false)
      })

    return () => controle.abort()
  }, [api, chaveDasUnidades, gatilho])

  const recarregar = useCallback(() => definirGatilho((n) => n + 1), [])

  if (carregando) return <Esqueleto comTabela={unidades.length > 1} />

  if (erro && !lojas) {
    return (
      <main className="inicio">
        <Faixa
          tom="perigo"
          icone="alerta"
          acao={
            <Botao enfase="secundaria" icone="atualizar" onClick={recarregar}>
              Tentar de novo
            </Botao>
          }
        >
          {erro}
        </Faixa>
      </main>
    )
  }

  if (!lojas) return null

  /*
   * O agregado.
   *
   * Com uma loja só, a agregação de um item é o próprio item — a tela fica
   * idêntica ao que era. Com várias, os totais somam e as duas médias são
   * ponderadas, que é a parte que não se faz de cabeça (ver `agregarPaineis`).
   */
  const painel = agregarPaineis(lojas)
  const varias = lojas.length > 1

  const pedidos = variacao(painel.mes.atual, painel.mes.mesmoPeriodoMesAnterior)
  const faturamento = variacao(
    painel.mes.faturado,
    painel.mes.faturadoMesmoPeriodoMesAnterior
  )
  const ticket = variacao(
    painel.mes.ticketMedio ?? 0,
    painel.mes.ticketMedioMesmoPeriodoMesAnterior ?? 0
  )

  return (
    <main className="inicio" data-atualizando={atualizando || undefined}>
      <header className="inicio__saudacao">
        <div>
          {/*
            A saudação é para a pessoa, não para a loja.
            
            Dizia "Olá, Santana" — cumprimentava o estabelecimento. Quem abre
            esta tela é o responsável, e é a ele que se dá bom dia; a loja é o
            assunto, não o interlocutor. Sem nome no cadastro, fica só a
            saudação sozinha: "Bom dia, " com o espaço vazio é pior que nada.
          */}
          <h1>
            {saudacao(agora)}
            {primeiroNome(nomeDoUsuario) && (
              <>
                , <strong>{primeiroNome(nomeDoUsuario)}</strong>
              </>
            )}
          </h1>
          <p>
            {dataPorExtenso.format(new Date(agora))}
            {lidoEm !== null && (
              <>
                {' · '}
                <span className="inicio__lido-em">
                  {atualizando ? 'lendo…' : `lido às ${relogio.format(new Date(lidoEm))}`}
                </span>
              </>
            )}
          </p>

          {/*
            As lojas em selos, e não numa frase.
            
            "Santana, Perdizes e Moema" cresce com a seleção e, num cabeçalho
            que divide a linha com os botões, empurrava "Atualizar" e "Abrir o
            quadro" para baixo. Em selos, a lista quebra dentro da própria
            coluna e o resto do cabeçalho não se mexe.
            
            O nome é o bairro, pelo mesmo motivo da tela de escolha: as nove
            lojas se chamam "MATSUYA <bairro>", e nove selos abrindo com a
            mesma palavra não distinguem nada. O tom vem do nome, o mesmo do
            seletor da barra — a loja tem uma cor só no produto inteiro.
          */}
          <ul className="inicio__selos" aria-label="Lojas neste painel">
              {lojas.map((l) => (
                <li
                  key={l.unidade}
                  className="inicio__selo"
                  title={l.nome}
                  style={{ '--tom': corDaLoja(l.nome) } as CSSProperties}
                >
                  <span className="inicio__selo-ponto" aria-hidden="true" />
                  {nomeDaLoja(l.nome).principal}
                </li>
              ))}
          </ul>
        </div>

        <div className="inicio__acoes">
          <Botao
            enfase="fantasma"
            icone="atualizar"
            carregando={atualizando}
            onClick={recarregar}
          >
            Atualizar
          </Botao>
          <Botao enfase="primaria" icone="sacola" onClick={aoIrParaOQuadro}>
            Abrir o quadro
          </Botao>
        </div>
      </header>

      {/* Erro numa atualização não apaga o que já está na tela: o dado velho
          continua sendo verdade sobre o instante em que foi buscado. */}
      {erro && (
        <Faixa
          tom="atencao"
          icone="alerta"
          acao={
            <Botao enfase="secundaria" icone="atualizar" onClick={recarregar}>
              Tentar de novo
            </Botao>
          }
        >
          Não foi possível atualizar — os números abaixo são da última leitura.
        </Faixa>
      )}

      {/*
        A faixa do agora. Quatro blocos, um por pergunta, na ordem em que elas
        chegam ao responsável que acabou de entrar na loja.
      */}
      <section className="inicio__faixa" aria-label="Como está a loja agora">
        <Bloco
          ordem={0}
          icone="sacola"
          rotulo="Em aberto"
          valor={inteiro.format(painel.operacao.emAberto)}
          apoio="pedidos na fila de trabalho"
        />
        <Bloco
          ordem={1}
          icone="alerta"
          rotulo="Atrasados"
          valor={inteiro.format(painel.operacao.atrasados)}
          apoio={painel.operacao.atrasados === 0 ? 'nenhum fora do prazo' : 'fora do prazo agora'}
          tom={painel.operacao.atrasados > 0 ? 'alarme' : undefined}
        />
        <Bloco
          ordem={2}
          icone="relogio"
          rotulo="O mais antigo"
          valor={
            painel.operacao.maisAntigoEm
              ? decorrido(painel.operacao.maisAntigoEm, agora)
              : '—'
          }
          apoio={painel.operacao.maisAntigoEm ? 'esperando' : 'nada na fila'}
        />
        <Bloco
          ordem={3}
          icone="lista"
          rotulo="Itens pausados"
          valor={inteiro.format(painel.catalogo.pausados)}
          apoio={`de ${painel.catalogo.total} no cardápio`}
          tom={painel.catalogo.pausados > 0 ? 'atencao' : undefined}
        />
      </section>

      <div className="inicio__colunas">
        <section className="cartao-d inicio__mes" style={ordem(4)}>
          <h2 className="cartao-d__cabecalho">
            <span className="cartao-d__disco" aria-hidden="true">
              <Icone nome="dinheiro" tamanho={16} />
            </span>
            O mês até aqui
          </h2>

          <div className="inicio__numeros">
            {/*
              A figura herói da tela — uma só, e é dinheiro. Figuras
              proporcionais e não `.num`: `tabular-nums` dá a todo dígito a
              largura do zero, e em corpo grande isso deixa o número frouxo.
            */}
            <div className="inicio__heroi">
              <span className="inicio__heroi-valor">
                {dinheiro.format(painel.mes.faturado)}
              </span>
              <span className="inicio__rotulo">faturado</span>
              <Delta v={faturamento} formatar={dinheiro.format} />
            </div>

            <div className="inicio__lado">
              <div>
                <span className="inicio__medio">{inteiro.format(painel.mes.atual)}</span>
                <span className="inicio__rotulo">pedidos concluídos</span>
                <Delta v={pedidos} formatar={inteiro.format} />
              </div>

              <div>
                <span className="inicio__medio">
                  {painel.mes.ticketMedio === null
                    ? '—'
                    : dinheiro.format(painel.mes.ticketMedio)}
                </span>
                <span className="inicio__rotulo">ticket médio</span>
                {painel.mes.ticketMedio !== null &&
                  painel.mes.ticketMedioMesmoPeriodoMesAnterior !== null && (
                    <Delta v={ticket} formatar={dinheiro.format} />
                  )}
              </div>
            </div>
          </div>

          <CurvaDoMes
            porDia={painel.mes.porDia}
            porDiaMesAnterior={painel.mes.porDiaMesAnterior}
          />
        </section>

        <section className="cartao-d inicio__avaliacoes" style={ordem(5)}>
          <h2 className="cartao-d__cabecalho">
            <span className="cartao-d__disco" aria-hidden="true">
              <Icone nome="estrela" tamanho={16} />
            </span>
            Avaliações
          </h2>

          <div className="inicio__nota">
            <span className="inicio__medio">{painel.avaliacoes.media ?? '—'}</span>
            <span className="inicio__rotulo">
              {painel.avaliacoes.media === null
                ? 'sem notas ainda'
                : `média de ${inteiro.format(painel.avaliacoes.total)} ${
                    painel.avaliacoes.total === 1 ? 'nota' : 'notas'
                  }`}
            </span>
          </div>

          {painel.avaliacoes.comentarios.length === 0 ? (
            <EstadoVazio
              icone="pessoa"
              titulo="Nenhum comentário"
              descricao="Nenhum cliente escreveu sobre os pedidos desta loja."
            />
          ) : (
            <>
              <ul className="inicio__comentarios">
                {painel.avaliacoes.comentarios.map((c) => (
                  <li key={c.id}>
                    <blockquote className="inicio__comentario">
                      <p>{c.texto}</p>
                      <footer>
                        <span className="inicio__nota-do-comentario num">
                          <Icone nome="estrela" tamanho={12} />
                          {c.nota}
                        </span>
                        <span>{quandoFoi(c.em, agora)}</span>
                      </footer>
                    </blockquote>
                  </li>
                ))}
              </ul>

              {/*
                A contagem do cabeçalho conta TODAS as notas; aqui embaixo só
                cabem as três últimas com texto. Sem esta linha, "média de 40
                notas" ao lado de três citações parece que sumiram trinta e sete.
              */}
              {painel.avaliacoes.total > painel.avaliacoes.comentarios.length && (
                <p className="inicio__rodape-nota">
                  Os {painel.avaliacoes.comentarios.length} comentários mais recentes.
                  As outras notas vieram sem texto.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {varias && <LojasDoPainel lojas={lojas} />}
    </main>
  )
}

const ordem = (n: number) => ({ '--ordem': String(n) }) as CSSProperties

function Bloco({
  ordem: n,
  icone,
  rotulo,
  valor,
  apoio,
  tom,
}: {
  ordem: number
  icone: NomeDoIcone
  rotulo: string
  valor: string
  apoio: string
  tom?: 'alarme' | 'atencao'
}) {
  return (
    <article className="cartao-d inicio__bloco" data-tom={tom} style={ordem(n)}>
      <span className="cartao-d__disco inicio__bloco-disco" aria-hidden="true">
        <Icone nome={icone} tamanho={16} />
      </span>
      <span className="inicio__bloco-rotulo">{rotulo}</span>
      <span className="inicio__bloco-valor">{valor}</span>
      <span className="inicio__rotulo">{apoio}</span>
    </article>
  )
}

/**
 * A variação contra o mesmo período do mês anterior.
 *
 * Verde para cima e vermelho para baixo **porque aqui subir é bom** — os três
 * números que usam este selo são faturamento, pedidos e ticket. Num indicador
 * onde subir é ruim (cancelamento, tempo de preparo), o mesmo componente
 * mentiria, e a direção precisaria virar propriedade.
 */
function Delta({ v, formatar }: { v: Variacao; formatar: (n: number) => string }) {
  if (v.sentido === 'igual') {
    return <span className="inicio__delta" data-sentido="igual">sem variação</span>
  }

  return (
    <span className="inicio__delta" data-sentido={v.sentido}>
      <Icone nome="cima-baixo" tamanho={12} aria-hidden="true" />
      <span className="num">
        {v.delta > 0 ? '+' : '−'}
        {formatar(Math.abs(v.delta))}
      </span>
      {v.fracao !== null && (
        <span className="inicio__delta-fracao num">{porcento.format(v.fracao)}</span>
      )}
    </span>
  )
}

/** "hoje", "ontem", "há 3 dias" — a data crua não diz nada sobre recência. */
function quandoFoi(iso: string, agora: number): string {
  const dias = Math.round((agora - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  return relativo.format(-dias, 'day')
}

/**
 * O esqueleto tem a forma do resultado.
 *
 * Quatro blocos na faixa e dois cartões embaixo, nas mesmas proporções: quando
 * o dado chega, nada muda de lugar. Um giro centralizado — que era o que havia
 * aqui — não reserva espaço nenhum, então a tela inteira salta na troca.
 */
function Esqueleto({ comTabela }: { comTabela: boolean }) {
  return (
    <main className="inicio" aria-busy="true">
      <p className="ui-visualmente-oculto" role="status">
        Carregando o painel da unidade.
      </p>

      <div className="inicio__faixa">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="esqueleto inicio__bloco-esqueleto"
            aria-hidden="true"
            style={{ '--atraso': `${i * 60}ms` } as CSSProperties}
          >
            <span className="esqueleto__bloco esqueleto__chip" />
            <span className="esqueleto__bloco esqueleto__heroi" />
          </div>
        ))}
      </div>

      <div className="inicio__colunas">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="esqueleto inicio__cartao-esqueleto"
            aria-hidden="true"
            style={{ '--atraso': `${240 + i * 60}ms` } as CSSProperties}
          >
            <span className="esqueleto__bloco esqueleto__chip" />
            <span className="esqueleto__bloco esqueleto__heroi" />
            <span className="esqueleto__bloco esqueleto__faixa" />
            <span className="esqueleto__bloco esqueleto__faixa" />
          </div>
        ))}
      </div>

      {/* A tabela por loja também reserva o espaço dela: sem isso, o conteúdo
          abaixo salta quando ela aparece. */}
      {comTabela && (
        <div
          className="esqueleto inicio__cartao-esqueleto"
          aria-hidden="true"
          style={{ '--atraso': '360ms' } as CSSProperties}
        >
          <span className="esqueleto__bloco esqueleto__chip" />
          <span className="esqueleto__bloco esqueleto__faixa" />
          <span className="esqueleto__bloco esqueleto__faixa" />
        </div>
      )}
    </main>
  )
}
