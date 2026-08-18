import { useEffect, useRef } from 'react'
import { Botao, Icone, Selo, type NomeDoIcone } from '@matsuya/ui'
import type { AcompanhamentoDaEntrega, PedidoDoQuadro } from '@matsuya/api-client'
import { formatarDistancia } from '@matsuya/utils'
import { horario, iniciais, restante } from '../../app/formato'
import { fracaoPercorrida } from './rota'

/**
 * A folha de acompanhamento, ancorada no rodapé do mapa.
 *
 * ## O que ela responde
 *
 * "Onde ele está e quando chega?" — a pergunta que o telefone faz quando toca.
 * O mapa mostra o caminho; a folha põe número nele.
 *
 * ## Por que uma folha sobre o mapa, e não o drawer lateral
 *
 * O drawer é para **decidir** sobre um pedido: ele cobre o quadro, prende o
 * foco e espera uma ação. Acompanhar é o contrário — é olhar. A linha traçada
 * precisa continuar visível enquanto se lê o tempo, e é por isso que a folha
 * mora dentro do mapa, ocupa só a faixa de baixo e **não** é modal: nada fica
 * inativo por trás dela, a lista ao lado continua clicável, e o `Tab` sai
 * livremente. `Esc` fecha e o foco volta para o botão que abriu, porque quem
 * chegou pelo teclado precisa voltar para onde estava.
 *
 * ## O que ela nunca faz
 *
 * **Não inventa tempo.** Só existe previsão quando há traçado, porque é o
 * roteador que diz quanto tempo aquele caminho leva. Sem traçado a folha abre
 * assim mesmo e mostra o que sabe — estado, entregador, e a distância em linha
 * reta, marcada como tal. Um "—" no lugar de um horário seria pior do que a
 * frase que explica a ausência.
 */

interface Props {
  pedido: PedidoDoQuadro
  acompanhamento: AcompanhamentoDaEntrega | null
  carregando: boolean
  erro: string | null
  agora: number
  aoFechar: () => void
  aoAbrirDetalhe: () => void
}

/** Estado da corrida, no vocabulário da folha: o trecho, não a máquina. */
const TRECHO: Record<string, { icone: NomeDoIcone; rotulo: string; ate: string }> = {
  buscando: { icone: 'lupa', rotulo: 'Procurando entregador', ate: 'até chegar à loja' },
  a_caminho: { icone: 'moto', rotulo: 'A caminho da loja', ate: 'até chegar à loja' },
  na_loja: { icone: 'loja', rotulo: 'No balcão da loja', ate: 'até chegar à loja' },
  em_rota: { icone: 'moto', rotulo: 'A caminho do cliente', ate: 'até chegar ao cliente' },
  entregue: { icone: 'check', rotulo: 'Entregue', ate: 'até chegar ao cliente' },
  falhou: { icone: 'alerta', rotulo: 'Entrega falhou', ate: 'até chegar ao cliente' },
}

export function PainelDaEntrega({
  pedido,
  acompanhamento,
  carregando,
  erro,
  agora,
  aoFechar,
  aoAbrirDetalhe,
}: Props) {
  const folha = useRef<HTMLElement>(null)
  const abriuCom = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Guarda quem tinha o foco **antes** de a folha aparecer e o devolve na
    // saída. Sem isso, fechar com Esc joga o cursor no topo da página e quem
    // navega por teclado perde o lugar na lista.
    abriuCom.current = document.activeElement as HTMLElement | null
    folha.current?.focus()

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      evento.stopPropagation()
      aoFechar()
    }

    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      abriuCom.current?.focus()
    }
    // Só na montagem e na desmontagem: a folha é remontada por `key` quando a
    // entrega acompanhada muda, e é isso que faz o foco entrar de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entrega = acompanhamento?.entrega ?? pedido.entrega ?? null
  const trecho = entrega ? TRECHO[entrega.estado] : undefined
  const rota = acompanhamento?.rota ?? null
  const restanteEmMetros = acompanhamento?.restante ?? null

  /*
   * A barra do trajeto mede **distância**, não tempo.
   *
   * A barra da lista mede tempo decorrido sobre tempo previsto, porque lá é o
   * único dado que existe. Aqui há traçado, e distância é a medida honesta: o
   * relógio enche sozinho com o entregador parado no sinal.
   */
  const fracao = fracaoPercorrida(rota?.metros, restanteEmMetros?.metros)

  const chegaEm = acompanhamento?.chegaEm ?? null
  const atrasado = chegaEm !== null && new Date(chegaEm).getTime() < agora

  const saiuEm = acompanhamento?.perna === 'cliente' ? pedido.dispatchedAt : entrega?.atribuidoEm

  return (
    <section
      className="folha"
      ref={folha}
      tabIndex={-1}
      /*
        `region`, e não `dialog`: nada por trás está inativo. Um `dialog`
        prometeria ao leitor de tela um foco preso que esta folha não tem —
        e não deve ter, porque a lista ao lado continua sendo o lugar de onde
        se troca de entrega.
      */
      role="region"
      aria-label={`Acompanhamento da entrega ${pedido.code ?? `#${pedido.id}`}`}
    >
      <header className="folha__topo">
        <span
          className="folha__avatar"
          data-sem-entregador={entrega?.entregador ? undefined : true}
          aria-hidden="true"
        >
          {entrega?.entregador ? (
            <>
              {iniciais(entrega.entregador)}
              {entrega.fotoUrl && <img src={entrega.fotoUrl} alt="" decoding="async" />}
            </>
          ) : (
            <Icone nome={trecho?.icone ?? 'moto'} tamanho={20} />
          )}
        </span>

        <span className="folha__quem">
          <strong>{entrega?.entregador ?? 'Sem entregador atribuído'}</strong>
          <span className="folha__estado">
            <Icone nome={trecho?.icone ?? 'moto'} tamanho={12} />
            {trecho?.rotulo ?? 'Sem corrida'}
          </span>
        </span>

        <span className="folha__codigo num">
          <Selo tom="neutro">{pedido.code ?? `#${pedido.id}`}</Selo>
        </span>

        <button
          type="button"
          className="folha__fechar"
          onClick={aoFechar}
          aria-label="Fechar o acompanhamento"
        >
          <Icone nome="x" tamanho={16} />
        </button>
      </header>

      {carregando ? (
        /*
          Esqueleto, e não giro: a primeira busca de cada trecho pode levar
          alguns segundos, porque é ela que manda traçar a rota. Um esqueleto no
          formato do conteúdo diz o que vai aparecer; um giro só diz "espere".
        */
        <div className="folha__corpo folha__corpo--esqueleto" role="status">
          <span className="folha__esqueleto folha__esqueleto--figura" />
          <span className="folha__esqueleto folha__esqueleto--linha" />
          <span className="ui-visualmente-oculto">Carregando o acompanhamento…</span>
        </div>
      ) : erro ? (
        <div className="folha__corpo folha__corpo--erro" role="status">
          <Icone nome="alerta" tamanho={16} />
          <p>{erro}</p>
        </div>
      ) : (
        <div className="folha__corpo">
          <div className="folha__numeros">
            {/*
              A figura da folha: quanto falta em tempo. Grande porque é a
              resposta, e o resto é contexto dela.

              Sem `aria-live`: o número anda a cada segundo, e anunciá-lo a cada
              tique tornaria a tela inutilizável com leitor de tela. Ele é lido
              quando o foco chega na folha, que é quando alguém pediu para saber.
            */}
            <p className="folha__figura" data-atrasado={atrasado || undefined}>
              {chegaEm ? (
                <>
                  <span className="num">{restante(chegaEm, agora)}</span>
                  <span className="folha__figura-rotulo">
                    {atrasado ? 'além do previsto' : (trecho?.ate ?? 'até chegar')}
                  </span>
                </>
              ) : (
                <>
                  <span className="folha__figura-vazia">Sem previsão</span>
                  <span className="folha__figura-rotulo">
                    O traçado da rua não está disponível
                  </span>
                </>
              )}
            </p>

            <dl className="folha__medidas">
              <div>
                <dt>Falta percorrer</dt>
                <dd className="num">
                  {restanteEmMetros
                    ? formatarDistancia(restanteEmMetros.metros / 1000)
                    : '—'}
                  {/*
                    Linha reta e rua não são a mesma medida: em cidade a reta
                    costuma dar uns 30% a menos. Sem a marca, as duas apareceriam
                    com a mesma confiança.
                  */}
                  {restanteEmMetros && !restanteEmMetros.pelaRota && (
                    <span className="folha__ressalva">em linha reta</span>
                  )}
                </dd>
              </div>

              <div>
                <dt>{acompanhamento?.perna === 'cliente' ? 'Saiu da loja' : 'Atribuído'}</dt>
                <dd className="num">{saiuEm ? horario.format(new Date(saiuEm)) : '—'}</dd>
              </div>

              <div>
                <dt>Previsão</dt>
                <dd className="num">
                  {chegaEm ? horario.format(new Date(chegaEm)) : '—'}
                </dd>
              </div>
            </dl>
          </div>

          {/*
            A barra só aparece com traçado. Uma barra vazia afirmaria "não saiu
            do lugar", que é diferente de "não sei onde ele está".
          */}
          {fracao !== null && (
            <div className="folha__trajeto">
              <span className="folha__trilho" aria-hidden="true">
                <span style={{ width: `${fracao * 100}%` }} />
                <span className="folha__pino" style={{ left: `${fracao * 100}%` }}>
                  <Icone nome="moto" tamanho={11} />
                </span>
              </span>
              <span className="ui-visualmente-oculto">
                {Math.round(fracao * 100)}% do caminho percorrido
              </span>
            </div>
          )}
        </div>
      )}

      <footer className="folha__acoes">
        <Botao enfase="secundaria" icone="lista" onClick={aoAbrirDetalhe}>
          Detalhes do pedido
        </Botao>
      </footer>
    </section>
  )
}
