import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Botao, Drawer, Icone, type NomeDoIcone } from '@matsuya/ui'
import {
  ORDER_ACTION_INFO,
  ORDER_STATUS_LABEL,
  acoesDisponiveis,
  type OrderAction,
} from '@matsuya/contracts'
import type { PedidoDoQuadro } from '@matsuya/api-client'
import { decorrido, horario, moeda, restante } from '../../app/formato'

/**
 * Detalhe do pedido, em painel lateral.
 *
 * Painel e não modal centrado por razão operacional: o quadro fica visível ao
 * lado. O operador lê o pedido sem perder a fila de vista, e vê um pedido novo
 * chegar enquanto confere outro.
 *
 * Os dados vêm do pedido que já está na lista do quadro — não existe
 * `GET /orders/:id` na v1, e não faz falta: a lista já traz itens com opções.
 * Uma requisição a menos e nenhuma janela em que o painel mostra um estado
 * diferente do cartão que o abriu.
 *
 * ## O desenho
 *
 * O painel tem três camadas, e a ordem delas é a ordem das perguntas.
 *
 * **A capa** identifica: número, cliente, loja, horário, sobre a marca. É a
 * única superfície pintada do Hub junto com o painel da entrada, e pela mesma
 * razão — nenhuma das duas é superfície de trabalho. O quadro, onde o turno
 * inteiro acontece, continua chapado.
 *
 * **O pulso** responde "como está indo": o anel do prazo, que gasta a volta
 * conforme o tempo corre, e a linha do tempo do pedido inteiro. É o cartão que
 * muda sozinho enquanto o painel está aberto, e por isso é o primeiro.
 *
 * **Os cartões** respondem o resto — para onde vai, quem leva, o que a cozinha
 * monta, quanto é. Cada um é uma pergunta, e o cinza entre eles é o que permite
 * pular de uma para outra sem ler o meio.
 *
 * Itens cancelados continuariam na lista, riscados, se `cancelledQty`
 * existisse — a coluna está no banco mas não no model da API, então hoje não há
 * o que renderizar.
 */

interface Props {
  pedido: PedidoDoQuadro | null
  permissoes: ReadonlySet<string>
  nomeDaUnidade: string
  agora: number
  ocupado: boolean
  naoLidas: number
  aoPedirAcao: (acao: OrderAction) => void
  aoAbrirConversa: () => void
  aoImprimir: () => void
  aoFechar: () => void
}

const ROTULO_DO_PAGAMENTO: Record<string, string> = {
  pix: 'Pix',
  card: 'Cartão',
  on_delivery: 'Na entrega',
}

const ICONE_DO_PAGAMENTO: Record<string, NomeDoIcone> = {
  pix: 'pix',
  card: 'cartao',
  on_delivery: 'dinheiro',
}

/**
 * Iniciais do entregador, para o avatar.
 *
 * Iniciais e não foto porque **a API não tem foto de entregador**. Um
 * `placeholder` genérico de silhueta diria menos do que duas letras, que ao
 * menos pertencem a esta pessoa e ajudam a distinguir dois entregadores na
 * mesma loja.
 */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]![0]!
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : ''
  return (primeira + ultima).toUpperCase()
}

const VERBO_DO_PRAZO: Record<'aceite' | 'preparo', string> = {
  aceite: 'Aceitar',
  preparo: 'Preparar',
}

type Tom = 'neutro' | 'sucesso' | 'atencao' | 'critico'

/** O que o cartão da corrida diz, por estado. Texto e tom, nunca só tom. */
const CORRIDA: Record<string, { titulo: string; tom: Tom; icone: NomeDoIcone }> = {
  buscando: { titulo: 'Procurando entregador(a)', tom: 'atencao', icone: 'atualizar' },
  a_caminho: { titulo: 'Entregador(a) a caminho da loja', tom: 'neutro', icone: 'moto' },
  na_loja: { titulo: 'Entregador(a) na loja', tom: 'sucesso', icone: 'capacete' },
  em_rota: { titulo: 'A caminho do cliente', tom: 'neutro', icone: 'moto' },
  entregue: { titulo: 'Entregue', tom: 'sucesso', icone: 'check' },
  falhou: { titulo: 'Sem entregador(a)', tom: 'critico', icone: 'x' },
}

const ENCERRADOS = new Set(['cancelled', 'rejected'])

export function DrawerDoPedido({
  pedido,
  permissoes,
  nomeDaUnidade,
  agora,
  ocupado,
  naoLidas,
  aoPedirAcao,
  aoAbrirConversa,
  aoImprimir,
  aoFechar,
}: Props) {
  const acoes = useMemo(() => {
    if (!pedido) return []
    return acoesDisponiveis(
      { status: pedido.status, deliveryType: pedido.deliveryType },
      permissoes
    )
  }, [pedido, permissoes])

  if (!pedido) return null

  const endereco = pedido.addressSnapshot as
    | {
        street?: string
        number?: string
        complement?: string
        district?: string
        city?: string
      }
    | null

  const itens = pedido.items ?? []
  const quantidade = itens.reduce((soma, i) => soma + i.qty, 0)
  const retirada = pedido.deliveryType === 'pickup'
  const corrida = pedido.entrega ? CORRIDA[pedido.entrega.estado] : null
  const encerrado = ENCERRADOS.has(pedido.status)

  return (
    <Drawer
      aberto
      variante="pedido"
      largura="medio"
      rotuloAcessivel={`Pedido ${pedido.code ?? pedido.id}`}
      aoFechar={aoFechar}
      titulo={
        <div className="capa__identidade">
          <span className="capa__codigo num">{pedido.code ?? `#${pedido.id}`}</span>
          {/*
            Com reserva: sem o nome a capa mostrava só um número, e o painel
            perdia a única coisa que diz de quem é o pedido. "Cliente não
            identificado" é pior do que um nome e melhor do que nada — e
            deixa claro que falta o dado, em vez de parecer um espaço vazio.
          */}
          <h2>{pedido.customerLabel ?? 'Cliente não identificado'}</h2>
        </div>
      }
      subtitulo={
        <>
          <span>
            <Icone nome="loja" tamanho={14} />
            {nomeDaUnidade}
            <span aria-hidden="true">·</span>
            Feito às {horario.format(new Date(pedido.createdAt))}
          </span>

          {/*
            O modo vira crachá com peso próprio: é o que muda o que a loja faz
            com o pedido pronto — chamar o entregador ou o cliente no balcão —
            e antes era mais uma palavra cinza no meio da linha de metadados.
          */}
          <span className="capa__modo" data-modo={retirada ? 'retirada' : 'entrega'}>
            <Icone nome={retirada ? 'casa' : 'moto'} tamanho={15} />
            {retirada ? 'Retirada' : 'Entrega'}
          </span>
        </>
      }
      acoes={
        /*
          A conversa sobe para o cabeçalho, como na referência. No rodapé ela
          disputava a linha com "Despachar", e são coisas de peso diferente:
          uma abre um canal, a outra move o pedido de coluna.
        */
        <button
          type="button"
          className="capa__redondo"
          onClick={aoAbrirConversa}
          aria-label={
            naoLidas > 0
              ? `Abrir a conversa — ${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}`
              : 'Abrir a conversa'
          }
          data-dica="Conversa com o cliente"
          data-dica-lado="abaixo"
        >
          <Icone nome="balao" tamanho={20} />
          {naoLidas > 0 && (
            <span className="capa__nao-lidas num" aria-hidden="true">
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
        </button>
      }
      rodape={
        <>
          {/*
            Imprimir à esquerda, separado das ações de fluxo por um vão
            elástico: reimprimir uma comanda é sempre possível e não move o
            pedido, e alinhá-lo junto do botão que despacha é como se acerta o
            errado sem olhar.
          */}
          <Botao enfase="fantasma" icone="impressora" onClick={aoImprimir}>
            Imprimir
          </Botao>

          <span className="drawer-pedido__vao" />

          {acoes.map((acao) => {
            const info = ORDER_ACTION_INFO[acao]
            return (
              <Botao
                key={acao}
                /* `tom` sobrepõe a cor sem tirar o papel de ação primária —
                   ver `DescricaoDaAcao` nos contratos. */
                enfase={info.tom ?? info.enfase}
                carregando={ocupado}
                onClick={() => aoPedirAcao(acao)}
              >
                {info.rotulo}
              </Botao>
            )
          })}
        </>
      }
    >
      <Pulso pedido={pedido} agora={agora} retirada={retirada} encerrado={encerrado} />

      {pedido.notes && (
        <Aviso rotulo="Observação do cliente" texto={pedido.notes} />
      )}

      {pedido.hasPartialCancellation && (
        <Aviso
          rotulo="Pedido alterado"
          texto="Um item foi cancelado depois que o pedido entrou. Confira a lista antes de montar."
        />
      )}

      {/*
        O cartão do entregador é o único sem cabeçalho.

        O avatar com as iniciais e o selo do veículo já dizem que a linha é
        sobre uma pessoa que entrega — e o nome dela está logo ao lado. Um
        título "Entregador" acima repetiria em palavra o que a linha inteira já
        mostra, e empurraria para baixo a única informação que muda.
      */}
      {corrida && pedido.entrega && (
        <section className="cartao-d" data-tom={corrida.tom}>
          <div className="corrida">
            {/*
              Avatar com iniciais quando há nome; a medalha do estado quando não
              há. A API só manda o nome depois que o entregador chega na loja —
              antes disso não existe pessoa a apresentar, e um círculo com "?"
              seria um espaço reservado fingindo ser informação.
            */}
            {pedido.entrega.entregador ? (
              <span className="corrida__avatar" aria-hidden="true">
                {iniciais(pedido.entrega.entregador)}
                <span className="corrida__selo">
                  <Icone nome={corrida.icone} tamanho={12} />
                </span>
              </span>
            ) : (
              <span className="corrida__medalha" aria-hidden="true">
                <Icone nome={corrida.icone} tamanho={22} />
              </span>
            )}

            <span className="corrida__dizer">
              <strong>{pedido.entrega.entregador ?? corrida.titulo}</strong>
              <span className="corrida__estado">
                <Icone nome={corrida.icone} tamanho={13} />
                {pedido.entrega.entregador ? corrida.titulo : 'Corrida em andamento'}
              </span>
            </span>

            <span className="corrida__tempo num">
              {pedido.entrega.chegouLojaEm
                ? decorrido(pedido.entrega.chegouLojaEm, agora)
                : pedido.entrega.etaLojaMinutos !== null
                  ? `${pedido.entrega.etaLojaMinutos} min`
                  : '—'}
              <small>
                {pedido.entrega.chegouLojaEm
                  ? 'na loja'
                  : pedido.entrega.etaLojaMinutos !== null
                    ? 'para chegar'
                    : 'sem previsão'}
              </small>
            </span>
          </div>

          {/*
            A faixa só aparece quando há o que fazer. Um entregador a caminho
            não pede nada de ninguém; um parado no balcão há minutos é fila
            travada nas duas pontas, e uma corrida sem entregador precisa de
            alguém agindo agora.
          */}
          {corrida.tom !== 'neutro' && corrida.tom !== 'sucesso' && (
            <p className="fecho" data-tom={corrida.tom}>
              <Icone nome="alerta" tamanho={18} />
              {pedido.entrega.estado === 'falhou'
                ? 'Sem entregador — peça outra pessoa entregadora'
                : 'Procurando entregador — o pedido não sai enquanto isso'}
            </p>
          )}
        </section>
      )}

      <section className="cartao-d">
        <Cabecalho icone={retirada ? 'casa' : 'mapa'} titulo={retirada ? 'Retirada' : 'Entrega'} />

        <div className="linhas">
          {retirada ? (
            <Fato
              icone="casa"
              rotulo="Retirada no balcão"
              descricao="O cliente vem buscar. Não há corrida para este pedido."
            />
          ) : endereco ? (
            /*
              A rua e o número no rótulo, o resto no apoio: é a linha que se lê
              em voz alta ao telefone, e bairro e cidade são contexto dela.
            */
            <Fato
              icone="mapa"
              rotulo={[endereco.street, endereco.number].filter(Boolean).join(', ')}
              descricao={
                <>
                  {endereco.complement && (
                    <>
                      {endereco.complement}
                      <br />
                    </>
                  )}
                  {[endereco.district, endereco.city].filter(Boolean).join(' · ')}
                </>
              }
            />
          ) : (
            <Fato
              icone="mapa"
              rotulo="Endereço não informado"
              descricao="Este pedido entrou sem endereço no instantâneo."
            />
          )}

          {!retirada && pedido.estimatedDeliveryAt && (
            <Fato
              icone="relogio"
              rotulo="Entrega prevista"
              descricao="Prazo da zona, congelado no fechamento do pedido."
              valor={horario.format(new Date(pedido.estimatedDeliveryAt))}
            />
          )}
        </div>
      </section>

      {/*
        Itens e contas num cartão só, como na referência.
        
        Eram duas seções, e a separação era arbitrária: o preço de cada linha e
        a soma delas são a mesma leitura, feita de cima para baixo. Separadas,
        conferir "o subtotal bate com os itens?" exigia atravessar um vão cinza
        e recomeçar noutro cartão.
      */}
      <section className="cartao-d">
        <Cabecalho icone="lista" titulo="Itens no pedido" />

        <ul className="itens">
          {itens.map((item) => (
            <li key={item.id}>
              {/*
                Miniatura com o fundo tingido por baixo: é ele que aparece se a
                foto não carregar, e produto sem foto cadastrada é comum. O selo
                da quantidade monta em cima da foto, como na referência — assim
                a quantidade viaja com o produto em vez de morar numa coluna
                própria, e a linha ganha a largura de volta para o nome.
              */}
              <span className="itens__foto" aria-hidden="true">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" width={64} height={64} loading="lazy" decoding="async" />
                ) : (
                  <Icone nome="sacola" tamanho={22} />
                )}
                <span className="itens__selo num">{item.qty}</span>
              </span>

              <span className="itens__corpo">
                <span className="itens__linha">
                  <span className="itens__nome">
                    <span className="ui-visualmente-oculto">{item.qty} unidades de </span>
                    {item.productName}
                  </span>
                  <span className="itens__preco num">
                    {moeda.format(item.lineTotal ?? item.unitPrice * item.qty)}
                  </span>
                </span>

                {(item.optionsSnapshot ?? []).length > 0 && (
                  <ul className="itens__opcoes">
                    {item.optionsSnapshot!.map((opcao, i) => (
                      <li key={`${opcao.optionId}-${i}`}>
                        {/*
                          A quantidade da opção é a do item: duas caixas do
                          combinado levam dois salmões. O instantâneo não guarda
                          quantidade por opção, e repetir a do item é o que a
                          cozinha realmente monta.
                        */}
                        <span className="itens__opcao-qtd num">{item.qty}</span>
                        <span className="itens__opcao-nome">{opcao.optionName}</span>
                        <span className="itens__opcao-preco num">
                          {moeda.format(opcao.priceDelta * item.qty)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            </li>
          ))}

          {itens.length === 0 && (
            <li className="itens__vazio">
              Itens não vieram neste carregamento. Atualize o quadro.
            </li>
          )}
        </ul>

        {/*
          As contas, em linhas de largura cheia com divisória entre elas — a
          mesma estrutura da referência. O ícone à esquerda dá à coluna de
          rótulos a mesma âncora que os cabeçalhos dos cartões têm.
        */}
        <dl className="contas">
          <Conta icone="sacola" rotulo="Subtotal" valor={moeda.format(pedido.subtotal)} />

          {pedido.deliveryFee > 0 && (
            <Conta
              icone="capacete"
              rotulo="Taxa de entrega"
              valor={moeda.format(pedido.deliveryFee)}
            />
          )}

          <Conta
            icone="dinheiro"
            rotulo="Total do pedido"
            valor={moeda.format(pedido.total)}
            destaque
          />

          <Conta
            icone={ICONE_DO_PAGAMENTO[pedido.paymentMethod] ?? 'dinheiro'}
            rotulo={`${pedido.paymentStatus === 'paid' ? 'Pago' : 'A receber'} via ${
              ROTULO_DO_PAGAMENTO[pedido.paymentMethod] ?? pedido.paymentMethod
            }`}
            descricao={
              pedido.paymentStatus === 'paid'
                ? 'O valor já foi recebido e será repassado à loja.'
                : 'O entregador recolhe este valor na entrega.'
            }
            valor={moeda.format(pedido.total)}
          />
        </dl>

        {/*
          A frase de fecho, como na referência: é a única linha do painel que
          diz ao operador o que **não** fazer. Um pedido já pago cobrado de novo
          na porta é o erro que ela existe para evitar.
        */}
        <p className="fecho" data-pago={pedido.paymentStatus === 'paid' || undefined}>
          <Icone nome={pedido.paymentStatus === 'paid' ? 'check' : 'alerta'} tamanho={18} />
          {pedido.paymentStatus === 'paid'
            ? 'Pago, não precisa cobrar na entrega'
            : `Cobrar ${moeda.format(pedido.total)} na entrega`}
        </p>
      </section>

    </Drawer>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * O cartão do pulso: anel do prazo e linha do tempo.
 *
 * As duas metades respondem perguntas diferentes sobre a mesma coisa. O anel
 * diz **quanto falta agora** — é o relógio correndo, e é o que decide se este
 * pedido é o próximo. A linha do tempo diz **como chegou até aqui**, que é o
 * que se olha quando o cliente liga perguntando.
 *
 * Juntos num cartão só porque separados eles se repetiriam: os dois falam de
 * tempo, e dois cartões de tempo seguidos fariam procurar a diferença.
 */
function Pulso({
  pedido,
  agora,
  retirada,
  encerrado,
}: {
  pedido: PedidoDoQuadro
  agora: number
  retirada: boolean
  encerrado: boolean
}) {
  const etapas = useMemo(() => {
    const base = [
      { rotulo: 'Recebido', em: pedido.createdAt as string | null },
      { rotulo: 'Aceito', em: pedido.acceptedAt },
      { rotulo: 'Pronto', em: pedido.readyAt },
    ]
    return retirada
      ? [...base, { rotulo: 'Retirado', em: pedido.deliveredAt }]
      : [
          ...base,
          { rotulo: 'Despachado', em: pedido.dispatchedAt },
          { rotulo: 'Entregue', em: pedido.deliveredAt },
        ]
  }, [pedido, retirada])

  // A primeira sem carimbo é a que está acontecendo. Nenhuma sem carimbo
  // significa pedido concluído, e aí não há etapa corrente para pulsar.
  const corrente = etapas.findIndex((e) => !e.em)
  const concluidas = corrente === -1 ? etapas.length : corrente

  const venceu = !!pedido.deadlineAt && new Date(pedido.deadlineAt).getTime() < agora
  const temPrazo = !!pedido.deadlineAt && !!pedido.deadlineKind && !encerrado

  /*
   * A fração que o anel ainda tem para gastar.
   *
   * `deadlineTotalMinutes` é a janela cheia do prazo — sem ela não há 100%, e
   * o anel viraria um enfeite que anda sozinho. Nesse caso ele fica cheio e só
   * o número embaixo conta.
   */
  const fracao =
    temPrazo && pedido.deadlineTotalMinutes
      ? Math.max(
          0,
          Math.min(
            1,
            (new Date(pedido.deadlineAt!).getTime() - agora) /
              (pedido.deadlineTotalMinutes * 60_000)
          )
        )
      : 1

  const tom: Tom = !temPrazo ? 'neutro' : venceu ? 'critico' : fracao <= 0.33 ? 'atencao' : 'sucesso'

  return (
    <section className="cartao-d pulso" data-tom={tom}>
      <Cabecalho icone="relogio" titulo="Andamento do pedido" />

      <div className="pulso__topo">
        <span
          className="pulso__anel"
          data-vazio={!temPrazo || undefined}
          style={{ '--fracao': fracao } as CSSProperties}
          aria-hidden="true"
        >
          <span className="pulso__anel-miolo num">
            {temPrazo ? (
              venceu ? (
                <Icone nome="alerta" tamanho={22} />
              ) : (
                restante(pedido.deadlineAt!, agora)
              )
            ) : (
              <Icone nome={encerrado ? 'x' : 'check'} tamanho={22} />
            )}
          </span>
        </span>

        <div className="pulso__dizer">
          <strong>{ORDER_STATUS_LABEL[pedido.status]}</strong>
          <p>
            {temPrazo
              ? venceu
                ? `${VERBO_DO_PRAZO[pedido.deadlineKind!]} — atrasado há ${decorrido(pedido.deadlineAt!, agora)}`
                : `${VERBO_DO_PRAZO[pedido.deadlineKind!]} em até ${restante(pedido.deadlineAt!, agora)}`
              : encerrado
                ? 'Este pedido não segue no fluxo.'
                : 'Sem prazo correndo — a próxima ação não é da loja.'}
          </p>
        </div>
      </div>

      {/*
        A linha do tempo some no pedido encerrado. Um cancelamento não percorre
        as etapas, e desenhá-las com metade acesa sugeriria que ele ainda está
        andando por elas.
      */}
      {!encerrado && (
        <ol className="trilha">
          {etapas.map((etapa, i) => (
            <li
              key={etapa.rotulo}
              data-feita={i < concluidas || undefined}
              data-corrente={i === corrente || undefined}
            >
              <span className="trilha__ponto" aria-hidden="true">
                {i < concluidas && <Icone nome="check" tamanho={11} />}
              </span>
              <span className="trilha__rotulo">{etapa.rotulo}</span>
              <span className="trilha__hora num">
                {etapa.em ? horario.format(new Date(etapa.em)) : '—'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * Observação do cliente e alteração do pedido.
 *
 * Fora dos cartões e antes deles: são as duas coisas que mudam o que a cozinha
 * faz, e dentro de um cartão de seção herdariam o peso de "mais um assunto".
 */
function Aviso({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <section className="cartao-d">
      <Cabecalho icone="alerta" titulo={rotulo} tom="atencao" />
      {/*
        O texto na faixa tingida, e não no corpo do cartão.
        
        É a mesma peça que fecha o cartão de itens — a linha que muda o que se
        faz. O cabeçalho diz o que é; a faixa carrega as palavras, e o fundo
        âmbar é o que faz o olho parar antes de continuar descendo o painel.
      */}
      <p className="fecho">{texto}</p>
    </section>
  )
}

/**
 * Cabeçalho de um cartão: ícone em disco, título, e uma etiqueta à direita.
 *
 * O disco dá ao título uma âncora fixa na margem esquerda — com os cartões
 * empilhados, o olho desce por essa coluna de ícones e para no que procura sem
 * ler nenhum título inteiro. A etiqueta à direita carrega o número da seção
 * (quantos itens, que horas), que antes obrigava a entrar no cartão para saber
 * se valia entrar nele.
 */
function Cabecalho({
  icone,
  titulo,
  tom,
  children,
}: {
  icone: NomeDoIcone
  titulo: string
  /** Tinge o disco. Só onde o assunto do cartão já é um aviso. */
  tom?: 'atencao'
  children?: ReactNode
}) {
  return (
    <h3 className="cartao-d__cabecalho">
      <span className="cartao-d__disco" data-tom={tom} aria-hidden="true">
        <Icone nome={icone} tamanho={16} />
      </span>
      {titulo}
      {children}
    </h3>
  )
}

/**
 * Uma linha de conta: ícone, rótulo (com apoio opcional), valor à direita.
 *
 * O olho desce pela coluna de ícones à esquerda e cruza para a direita só
 * quando achou o rótulo — é por isso que a coluna de valores fica encostada na
 * borda em vez de logo depois do texto.
 */
function Conta({
  icone,
  rotulo,
  descricao,
  valor,
  destaque = false,
}: {
  icone: NomeDoIcone
  rotulo: string
  descricao?: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="linha-d" data-destaque={destaque || undefined}>
      <dt className="linha-d__rotulo">
        <span className="linha-d__icone" aria-hidden="true">
          <Icone nome={icone} tamanho={20} />
        </span>
        <span>
          {rotulo}
          {descricao && <small>{descricao}</small>}
        </span>
      </dt>
      <dd className="linha-d__valor num">{valor}</dd>
    </div>
  )
}

/**
 * A mesma linha, fora de uma lista de definição.
 *
 * `Conta` vive num `<dl>` porque ali cada linha é mesmo um par termo/valor.
 * O endereço e o horário não são: são fatos com rótulo, sem contraparte. Mesma
 * aparência, marcação honesta — um `<dl>` com `<dd>` vazio para o endereço
 * mentiria para o leitor de tela.
 */
function Fato({
  icone,
  rotulo,
  descricao,
  valor,
}: {
  icone: NomeDoIcone
  rotulo: string
  descricao?: ReactNode
  valor?: string
}) {
  return (
    <div className="linha-d">
      <p className="linha-d__rotulo">
        <span className="linha-d__icone" aria-hidden="true">
          <Icone nome={icone} tamanho={20} />
        </span>
        <span>
          {rotulo}
          {descricao && <small>{descricao}</small>}
        </span>
      </p>
      {valor && <span className="linha-d__valor num">{valor}</span>}
    </div>
  )
}
