import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { Icone, useCamadaModal, type NomeDoIcone } from '@matsuya/ui'
import {
  criarApiDeAlertas,
  type AlertasDaUnidade,
  type EstadoDaLoja,
} from '@matsuya/api-client'
import { criarCliente } from '../dados/cliente'
import { config } from './config'
import type { Silenciados } from './silenciados'

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

export const ROTULO_DO_ESTADO: Record<EstadoDaLoja, string> = {
  aberta: 'aberta',
  pausada: 'pausada',
  fechada: 'fechada',
}

export interface AlertaDoDispositivo {
  chave: string
  gravidade: 'atencao' | 'critico'
  texto: string
}

interface AlertasPorLoja {
  unityId: number
  nome: string
  alertas: AlertasDaUnidade | null
  /** Tem pedido em aberto agora — o que torna loja fechada um problema. */
  temPedidos: boolean
}

/**
 * Loja parada com pedido em aberto conta como alerta.
 *
 * É a situação que ninguém vê: alguém pausou para repor o salmão, o pedido que
 * já estava na fila continua lá, e a cozinha não tem motivo para olhar de novo
 * para uma loja que "está pausada". Sem isso o pedido dorme até o cliente
 * ligar.
 */
function paradaComPedido(l: AlertasPorLoja): boolean {
  return l.temPedidos && !!l.alertas && l.alertas.estado !== 'aberta'
}

function totalDaLoja(l: AlertasPorLoja): number {
  const a = l.alertas
  if (!a) return 0
  return (
    a.atrasados +
    a.canceladosDuasHoras +
    a.itensPausados +
    (paradaComPedido(l) ? 1 : 0)
  )
}

/**
 * Um alerta do farol, já resolvido.
 *
 * A lista plana existe para que **silenciar seja um filtro num lugar só**.
 * Antes cada consumidor — o rótulo da pílula, o total, o painel — recalculava
 * as categorias por conta própria, e acrescentar "menos os silenciados" em
 * três lugares é a forma mais confiável de eles discordarem entre si.
 */
export interface AlertaDaOperacao {
  /** Estável entre recargas: loja + categoria. É a chave do silêncio. */
  chave: string
  unityId: number
  loja: string
  contagem: number
  gravidade: 'critico' | 'atencao'
  icone: NomeDoIcone
  /** O que a linha diz no painel, sem repetir o número. */
  descricao: string
  /** Como a categoria é nomeada no chip da pílula, no singular e no plural. */
  um: string
  varios: string
}

const CATEGORIAS = [
  {
    chave: 'atrasados',
    rotulo: 'Atrasados',
    janela: 'agora',
    icone: 'relogio' as const,
    gravidade: 'critico' as const,
    valor: (a: AlertasDaUnidade) => a.atrasados,
    descricao: (n: number) =>
      n === 1 ? 'pedido fora do prazo de aceite ou preparo' : 'fora do prazo de aceite ou preparo',
    um: 'atraso',
    varios: 'atrasos',
  },
  {
    chave: 'cancelados',
    rotulo: 'Cancelados',
    janela: 'últimas 2h',
    icone: 'x' as const,
    gravidade: 'atencao' as const,
    valor: (a: AlertasDaUnidade) => a.canceladosDuasHoras,
    descricao: (n: number) =>
      `${n === 1 ? 'cancelamento' : 'cancelamentos'} nas últimas 2 horas`,
    um: 'cancelamento recente',
    varios: 'cancelamentos recentes',
  },
  {
    chave: 'pausados',
    rotulo: 'Itens pausados',
    janela: 'agora',
    icone: 'sacola' as const,
    gravidade: 'atencao' as const,
    valor: (a: AlertasDaUnidade) => a.itensPausados,
    descricao: (n: number) => `${n === 1 ? 'item pausado' : 'itens pausados'} no cardápio`,
    um: 'item pausado',
    varios: 'itens pausados',
  },
]

/** Todos os alertas das lojas, silenciados incluídos. */
export function listarAlertas(porLoja: AlertasPorLoja[]): AlertaDaOperacao[] {
  const lista: AlertaDaOperacao[] = []

  for (const loja of porLoja) {
    if (!loja.alertas) continue

    for (const c of CATEGORIAS) {
      const n = c.valor(loja.alertas)
      if (n === 0) continue

      lista.push({
        chave: `${loja.unityId}:${c.chave}`,
        unityId: loja.unityId,
        loja: loja.nome,
        contagem: n,
        gravidade: c.gravidade,
        icone: c.icone,
        descricao: c.descricao(n),
        um: c.um,
        varios: c.varios,
      })
    }

    if (paradaComPedido(loja)) {
      lista.push({
        chave: `${loja.unityId}:parada`,
        unityId: loja.unityId,
        loja: loja.nome,
        contagem: 1,
        gravidade: 'critico',
        icone: 'alerta',
        descricao: `Loja ${ROTULO_DO_ESTADO[loja.alertas.estado]} com pedido em aberto`,
        um: 'loja parada com pedido',
        varios: 'lojas paradas com pedido',
      })
    }
  }

  return lista
}

/**
 * O texto do chip âmbar na pílula do cabeçalho.
 *
 * Com uma categoria só, ela é nomeada — "3 atrasos" diz o que fazer, "3
 * alertas" só diz que existe algo. Com mais de uma, o número agregado é
 * honesto: qualquer nome escolhido esconderia as outras. É o que a referência
 * faz ao escrever "1 alerta de logística" em vez de "1 alerta".
 *
 * Recebe a lista **já filtrada**: o que está silenciado não conta aqui, e é
 * assim que a pílula volta ao verde de `farol.png`.
 */
export function rotuloDoAlerta(
  alertas: AlertaDaOperacao[],
  doDispositivo: number
): string | null {
  const porCategoria = new Map<string, { n: number; um: string; varios: string }>()

  for (const a of alertas) {
    const tipo = a.chave.split(':')[1]!
    const atual = porCategoria.get(tipo)
    if (atual) atual.n += a.contagem
    else porCategoria.set(tipo, { n: a.contagem, um: a.um, varios: a.varios })
  }

  if (doDispositivo > 0) {
    porCategoria.set('tablet', {
      n: doDispositivo,
      um: 'alerta neste tablet',
      varios: 'alertas neste tablet',
    })
  }

  const presentes = [...porCategoria.values()].filter((c) => c.n > 0)
  if (presentes.length === 0) return null

  if (presentes.length === 1) {
    const c = presentes[0]!
    return `${c.n} ${c.n === 1 ? c.um : c.varios}`
  }

  const total = presentes.reduce((t, c) => t + c.n, 0)
  return `${total} alertas`
}

export function useFarol(
  unidades: ReadonlyArray<{ id: number; name: string }>,
  token: string | null,
  /** Lojas com pedido em aberto — para saber se uma loja parada é problema. */
  comPedidos: ReadonlySet<number>,
  /** Recalcula quando o quadro muda, para não ficar velho na tela. */
  gatilho: unknown
) {
  const [porLoja, definirPorLoja] = useState<AlertasPorLoja[]>([])
  const emCurso = useRef(false)

  const api = useMemo(() => {
    return criarApiDeAlertas(criarCliente(() => token))
  }, [token])

  useEffect(() => {
    if (unidades.length === 0 || emCurso.current) return

    const controle = new AbortController()
    emCurso.current = true

    Promise.all(
      unidades.map(async (u) => ({
        unityId: u.id,
        nome: u.name,
        temPedidos: comPedidos.has(u.id),
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
  }, [api, unidades, comPedidos, gatilho])

  const totalDaOperacao = porLoja.reduce((soma, l) => soma + totalDaLoja(l), 0)
  const atrasados = porLoja.reduce((soma, l) => soma + (l.alertas?.atrasados ?? 0), 0)

  /** Estado de operação por loja, para o seletor de lojas rotular cada linha. */
  const estados = useMemo(() => {
    const mapa = new Map<number, { estado: EstadoDaLoja; pausadaAte: string | null }>()
    for (const l of porLoja) {
      if (l.alertas) {
        mapa.set(l.unityId, { estado: l.alertas.estado, pausadaAte: l.alertas.pausadaAte })
      }
    }
    return mapa
  }, [porLoja])

  return { porLoja, totalDaOperacao, atrasados, estados }
}


const ABERTURA_MS = 260
/*
 * A saída é **mais longa** que a entrada, ao contrário da regra usual.
 *
 * A regra manda encurtar a saída, e ela vale quando entrada e saída são o
 * mesmo movimento invertido. Aqui não são. Abrindo, a borda cresce em direção
 * ao olho e há conteúdo chegando para acompanhar; fechando, ela foge e o que
 * havia para olhar está saindo junto — o olho perde o que seguir e o
 * movimento parece mais rápido do que o cronômetro diz.
 *
 * Foram duas tentativas até aqui: 180 ms parecia um pisca, 240 ms ainda
 * parecia pressa. 340 ms é o tempo de ver o painel voltar para o botão.
 */
const FECHAMENTO_MS = 340
const RECORTE_ABERTO = 'inset(0px round 20px)'

const movimentoReduzido = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Anima o painel saindo do próprio botão — e voltando para ele.
 *
 * A técnica é `clip-path`, e não escala. Escalar o painel a partir do botão
 * esticaria o conteúdo — texto e avatares chegariam deformados e assentariam
 * no último quadro, que é o efeito que faz um modal parecer barato. Recortar
 * revela o painel já no tamanho final, a partir da área exata que o botão
 * ocupa: nada distorce, e a origem continua sendo o botão.
 *
 * O recorte é medido, não estimado, **e é remedido no fechamento**. O botão
 * está no centro de um cabeçalho que muda de largura com o número de lojas
 * selecionadas, e o painel aberto é justamente onde se troca essa seleção — um
 * recorte guardado na abertura mandaria o painel encolher para onde o botão
 * estava, não para onde ele está.
 *
 * Devolve `recolher()`, que resolve quando a volta termina. Quem chama só
 * desmonta depois disso; desmontar antes cortaria a animação no primeiro
 * quadro, que é o mesmo que não ter animação nenhuma.
 */
function useExpansaoDaAncora(
  painel: RefObject<HTMLElement | null>,
  ancora: RefObject<HTMLElement | null>,
  veu: RefObject<HTMLElement | null>
) {
  const recorteDoBotao = useCallback(() => {
    const p = painel.current
    const b = ancora.current
    if (!p || !b) return null

    const rp = p.getBoundingClientRect()
    const rb = b.getBoundingClientRect()

    return `inset(${rb.top - rp.top}px ${rp.right - rb.right}px ${
      rp.bottom - rb.bottom
    }px ${rb.left - rp.left}px round 12px)`
  }, [painel, ancora])

  useLayoutEffect(() => {
    const p = painel.current
    if (!p || typeof p.animate !== 'function') return

    // Movimento reduzido não ganha uma versão encurtada: a expansão existe para
    // dizer de onde o painel veio, e meia expansão diz isso pela metade com o
    // mesmo custo para quem tem enxaqueca vestibular. Fica só o esmaecer.
    if (movimentoReduzido()) {
      p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' })
      return
    }

    const recorte = recorteDoBotao()
    if (!recorte) return

    p.animate(
      [
        { clipPath: recorte, opacity: 0.7 },
        { clipPath: RECORTE_ABERTO, opacity: 1 },
      ],
      // Curva de saída acentuada: sai rápido do botão e assenta devagar, que é
      // como um objeto físico se comporta e o que faz o painel parecer o botão
      // crescendo em vez de uma caixa nova aparecendo.
      { duration: ABERTURA_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    )

    // O conteúdo entra depois do recorte, senão aparece "por trás" da borda que
    // ainda está correndo e o olho vê duas camadas em vez de uma.
    p.querySelector('.farol__corpo')?.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, delay: 120, easing: 'ease-out', fill: 'backwards' }
    )
  }, [painel, recorteDoBotao])

  return useCallback((): Promise<void> => {
    const p = painel.current
    if (!p || typeof p.animate !== 'function') return Promise.resolve()

    // `finished` rejeita se a animação for cancelada — o que acontece se o
    // componente sumir por outro caminho. Fechar assim mesmo é o certo: o
    // objetivo era só esperar, e não há o que corrigir.
    const esperar = (a: Animation) => a.finished.then(() => undefined).catch(() => undefined)

    veu.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FECHAMENTO_MS,
      easing: 'ease-in',
      fill: 'forwards',
    })

    if (movimentoReduzido()) {
      return esperar(
        p.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 100,
          easing: 'ease-in',
          fill: 'forwards',
        })
      )
    }

    const recorte = recorteDoBotao()
    if (!recorte) return Promise.resolve()

    // O conteúdo sai na frente da borda, espelhando a entrada — mas sem
    // pressa. Some rápido demais e o que se vê é um retângulo esmaecendo, não
    // um painel se recolhendo; a borda precisa alcançar conteúdo ainda
    // visível para o movimento ler como recolhimento.
    p.querySelector('.farol__corpo')?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 210,
      delay: 60,
      easing: 'ease-in',
      fill: 'forwards',
    })

    return esperar(
      p.animate(
        // Quadros parciais de propósito: o recorte tem valor no primeiro e no
        // último, então corre a duração inteira; a opacidade tem valor também
        // no meio, e só cai no último quinto.
        //
        // A ordem importa. Esmaecer junto com o recorte faz as duas coisas se
        // cancelarem — o painel some antes de chegar ao botão, e a impressão é
        // de que ele evaporou em vez de voltar para o lugar de onde veio.
        [
          { clipPath: RECORTE_ABERTO, opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.8 },
          { clipPath: recorte, opacity: 0, offset: 1 },
        ],
        { duration: FECHAMENTO_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
      )
    )
  }, [painel, veu, recorteDoBotao])
}

export function Farol({
  porLoja,
  alertasDoDispositivo,
  silenciados,
  ancora,
  aoFechar,
}: {
  porLoja: AlertasPorLoja[]
  alertasDoDispositivo: AlertaDoDispositivo[]
  silenciados: Silenciados
  /** O botão que abriu o painel — a animação sai exatamente dele. */
  ancora: RefObject<HTMLElement | null>
  aoFechar: () => void
}) {
  const painel = useRef<HTMLDivElement>(null)
  const veu = useRef<HTMLDivElement>(null)
  const recolher = useExpansaoDaAncora(painel, ancora, veu)
  const fechando = useRef(false)

  /**
   * Toda saída passa por aqui: o X, o Esc, o clique no véu.
   *
   * A trava impede que dois pedidos de fechar disparem duas animações — o
   * segundo remediria o recorte com o painel já a meio caminho, e o painel
   * daria um salto no fim.
   */
  /*
   * `aoFechar` vem como arrow inline da `Casca`, que redesenha a cada segundo
   * por causa dos cronômetros — ou seja, muda de identidade o tempo todo.
   * Guardado numa ref, `fechar` fica estável, e é isso que impede o efeito de
   * `useCamadaModal` de rodar de novo a cada tique: ele devolve o foco ao
   * painel quando roda, e o campo de busca perderia o cursor uma vez por
   * segundo enquanto alguém digita.
   */
  const fecharDoPai = useRef(aoFechar)
  fecharDoPai.current = aoFechar

  const fechar = useCallback(() => {
    if (fechando.current) return
    fechando.current = true
    void recolher().then(() => fecharDoPai.current())
  }, [recolher])

  useCamadaModal(true, painel, fechar)

  const [busca, definirBusca] = useState('')
  const [buscando, definirBuscando] = useState(false)
  const [foco, definirFoco] = useState<number | null>(null)
  const [ajudaAberta, definirAjudaAberta] = useState(false)
  const [recolhidos, definirRecolhidos] = useState<ReadonlySet<string>>(new Set())

  const todos = useMemo(() => listarAlertas(porLoja), [porLoja])
  const ativos = todos.filter((a) => !silenciados.esta(a.chave, a.contagem))
  const calados = todos.filter((a) => silenciados.esta(a.chave, a.contagem))

  const total = ativos.reduce((s, a) => s + a.contagem, 0) + alertasDoDispositivo.length

  /** Quantos alertas ativos cada loja tem — alimenta a lista da esquerda. */
  const porUnidade = useMemo(() => {
    const mapa = new Map<number, number>()
    for (const a of ativos) mapa.set(a.unityId, (mapa.get(a.unityId) ?? 0) + a.contagem)
    return mapa
  }, [ativos])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return porLoja
    return porLoja.filter((l) => l.nome.toLowerCase().includes(termo))
  }, [busca, porLoja])

  // Com uma loja em foco, o painel da direita fala só dela. Sem foco, fala de
  // todas — que é o estado em que o painel abre, porque a primeira pergunta é
  // "tem algo errado em algum lugar?" e não "e a loja X?".
  const visiveis = foco === null ? ativos : ativos.filter((a) => a.unityId === foco)
  const caladosVisiveis = foco === null ? calados : calados.filter((a) => a.unityId === foco)

  /** Alertas ativos agrupados por loja, que é como o painel os apresenta. */
  const grupos = useMemo(() => {
    const mapa = new Map<number, { loja: string; itens: AlertaDaOperacao[] }>()
    for (const a of visiveis) {
      const g = mapa.get(a.unityId) ?? { loja: a.loja, itens: [] }
      g.itens.push(a)
      mapa.set(a.unityId, g)
    }
    return [...mapa.entries()]
  }, [visiveis])

  const alternarGrupo = (chave: string) =>
    definirRecolhidos((atuais) => {
      const proximo = new Set(atuais)
      if (proximo.has(chave)) proximo.delete(chave)
      else proximo.add(chave)
      return proximo
    })

  /** Total ativo de uma categoria, somando as lojas em foco. */
  const somaDaCategoria = (chaveDaCategoria: string) =>
    visiveis
      .filter((a) => a.chave.endsWith(`:${chaveDaCategoria}`))
      .reduce((s, a) => s + a.contagem, 0)

  return (
    <div
      ref={veu}
      className="farol__veu"
      onMouseDown={(e) => e.target === e.currentTarget && fechar()}
    >
      <div
        ref={painel}
        className="farol"
        role="dialog"
        aria-modal="true"
        aria-labelledby="farol-titulo"
        tabIndex={-1}
      >
        {/*
          O cabeçalho repete a anatomia do botão fechado — ponto, título, chip.
          É o que sustenta a ideia de que o botão virou o painel: se a linha
          mudasse de forma no meio da animação, a expansão viraria uma troca de
          telas com um efeito por cima.
        */}
        <header className="farol__cabecalho">
          <span
            className="farol__ponto-titulo"
            data-estado={total > 0 ? 'alerta' : 'ok'}
            aria-hidden="true"
          />
          <div className="farol__titulo">
            <h2 id="farol-titulo">Farol da Operação</h2>
            <span className="farol__janela">{total > 0 ? `${total} agora` : 'agora'}</span>
          </div>
          <div className="farol__botoes">
            <button
              type="button"
              className="farol__quadrado"
              aria-expanded={ajudaAberta}
              onClick={() => definirAjudaAberta((v) => !v)}
              aria-label="O que o farol mostra"
            >
              ?
            </button>
            {ativos.length > 0 && (
              <button
                type="button"
                className="farol__quadrado farol__quadrado--largo"
                onClick={() => silenciados.silenciarVarios(ativos)}
                data-dica="Silencia o que está na tela; volta se piorar"
                data-dica-lado="abaixo"
                data-dica-alinhar="fim"
              >
                <Icone nome="check" tamanho={16} />
                Dar tudo por visto
              </button>
            )}

            <button
              type="button"
              className="farol__quadrado"
              onClick={fechar}
              aria-label="Fechar o farol"
            >
              <Icone nome="x" tamanho={18} />
            </button>
          </div>
        </header>

        {ajudaAberta && (
          <p className="farol__ajuda">
            O farol junta o que exige decisão agora: pedidos fora do prazo de aceite ou
            preparo, cancelamentos das últimas 2 horas, itens pausados no cardápio e loja
            parada com pedido na fila. Os alertas deste tablet — impressão e conexão —
            ficam separados, porque somem ao abrir o Hub em outra máquina.
          </p>
        )}

        <div className="farol__corpo">
          <section className="farol__lojas" aria-label="Suas lojas">
            <div className="farol__lojas-topo">
              <h3>Suas lojas</h3>
              <button
                type="button"
                className="farol__redondo"
                onClick={() => definirBuscando((v) => !v)}
                aria-expanded={buscando}
                aria-label="Buscar loja"
              >
                <Icone nome="lupa" tamanho={16} />
              </button>
            </div>

            {buscando && (
              <input
                className="farol__busca"
                type="search"
                autoFocus
                value={busca}
                onChange={(e) => definirBusca(e.target.value)}
                placeholder="Buscar loja"
                aria-label="Buscar loja"
              />
            )}

            <ul>
              {filtradas.map((loja) => {
                const n = porUnidade.get(loja.unityId) ?? 0
                return (
                  <li key={loja.unityId}>
                    <button
                      type="button"
                      className="farol__loja"
                      data-focada={foco === loja.unityId || undefined}
                      aria-pressed={foco === loja.unityId}
                      onClick={() =>
                        definirFoco((atual) => (atual === loja.unityId ? null : loja.unityId))
                      }
                    >
                      <span
                        className="farol__ponto"
                        data-estado={
                          loja.alertas === null ? 'desconhecido' : n > 0 ? 'alerta' : 'ok'
                        }
                        aria-hidden="true"
                      />
                      <span className="farol__nome">
                        {loja.nome}
                        <small data-estado={n > 0 ? 'alerta' : 'ok'}>
                          {loja.alertas === null
                            ? 'não foi possível consultar'
                            : n === 0
                              ? loja.alertas.estado === 'aberta'
                                ? 'Sem alerta'
                                : `Loja ${ROTULO_DO_ESTADO[loja.alertas.estado]}`
                              : `${n} ${n === 1 ? 'alerta' : 'alertas'}`}
                        </small>
                      </span>
                      <Icone nome="seta-direita" tamanho={16} />
                    </button>
                  </li>
                )
              })}

              {filtradas.length === 0 && (
                <li className="farol__vazio">Nenhuma loja com esse nome.</li>
              )}
            </ul>
          </section>

          <section className="farol__detalhe" aria-label="Alertas">
            {foco !== null && (
              <button type="button" className="farol__limpar" onClick={() => definirFoco(null)}>
                <Icone nome="seta-esquerda" tamanho={14} />
                Ver todas as lojas
              </button>
            )}

            <div className="farol__cartoes">
              {CATEGORIAS.map((c) => {
                const n = somaDaCategoria(c.chave)
                return (
                  <article
                    key={c.chave}
                    className="farol__cartao"
                    data-gravidade={n > 0 ? c.gravidade : undefined}
                  >
                    <header>
                      {c.rotulo}
                      <span className="farol__janela-pequena">{c.janela}</span>
                    </header>
                    <strong className={n > 0 ? 'num' : undefined}>
                      {n > 0 ? n : 'Sem alertas'}
                    </strong>
                  </article>
                )
              })}
            </div>

            {visiveis.length === 0 && alertasDoDispositivo.length === 0 ? (
              <div className="farol__tudo-bem">
                <Icone nome="check" tamanho={28} />
                <p>
                  {foco === null
                    ? 'Suas lojas estão funcionando normalmente'
                    : 'Esta loja está funcionando normalmente'}
                </p>
                <small>
                  {caladosVisiveis.length > 0
                    ? 'Nada de novo. Há alertas silenciados abaixo.'
                    : 'Nenhum pedido fora do prazo, nenhum cancelamento recente e nenhum item pausado.'}
                </small>
              </div>
            ) : (
              <>
                {grupos.map(([unityId, grupo]) => {
                  const chave = `loja-${unityId}`
                  const aberto = !recolhidos.has(chave)
                  return (
                    <article key={chave} className="farol__grupo">
                      <div className="farol__grupo-topo-linha">
                        <button
                          type="button"
                          className="farol__grupo-topo"
                          aria-expanded={aberto}
                          onClick={() => alternarGrupo(chave)}
                        >
                          <span
                            className="farol__ponto"
                            data-estado="alerta"
                            aria-hidden="true"
                          />
                          {grupo.loja}
                          <span className="farol__grupo-seta" data-aberto={aberto || undefined}>
                            <Icone nome="cima-baixo" tamanho={16} />
                          </span>
                        </button>

                        {/*
                          Silenciar a loja inteira, e não cada linha: quem abre
                          o farol depois de resolver alguma coisa quer dar por
                          visto o que aquela loja está reportando, não conferir
                          categoria por categoria.
                        */}
                        <button
                          type="button"
                          className="farol__silenciar"
                          onClick={() => silenciados.silenciarVarios(grupo.itens)}
                        >
                          <Icone nome="check" tamanho={14} />
                          Dar por visto
                        </button>
                      </div>

                      {aberto && (
                        <ul>
                          {grupo.itens.map((a) => (
                            <li key={a.chave} data-gravidade={a.gravidade}>
                              <span className="farol__item-icone" aria-hidden="true">
                                <Icone nome={a.icone} tamanho={16} />
                              </span>
                              {a.chave.endsWith(':parada') ? (
                                <span className="farol__item-texto farol__item-texto--sozinho">
                                  {a.descricao}
                                </span>
                              ) : (
                                <>
                                  <strong className="farol__item-numero num">
                                    {a.contagem}
                                  </strong>
                                  <span className="farol__item-texto">{a.descricao}</span>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  )
                })}

                {alertasDoDispositivo.length > 0 && (
                  <article className="farol__grupo farol__grupo--dispositivo">
                    <button
                      type="button"
                      className="farol__grupo-topo"
                      aria-expanded={!recolhidos.has('tablet')}
                      onClick={() => alternarGrupo('tablet')}
                    >
                      <Icone nome="wifi" tamanho={16} />
                      Este tablet
                      <span
                        className="farol__grupo-seta"
                        data-aberto={!recolhidos.has('tablet') || undefined}
                      >
                        <Icone nome="cima-baixo" tamanho={16} />
                      </span>
                    </button>

                    {!recolhidos.has('tablet') && (
                      <>
                        <p className="farol__nota">
                          Vale só para este dispositivo — some ao abrir o Hub em outro.
                        </p>
                        <ul>
                          {alertasDoDispositivo.map((alerta) => (
                            <li key={alerta.chave} data-gravidade={alerta.gravidade}>
                              <span className="farol__item-icone" aria-hidden="true">
                                <Icone
                                  nome={alerta.chave === 'conexao' ? 'wifi-cortado' : 'alerta'}
                                  tamanho={16}
                                />
                              </span>
                              <span className="farol__item-texto farol__item-texto--sozinho">
                                {alerta.texto}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </article>
                )}
              </>
            )}

            {/*
              Silenciado continua aqui, num grupo próprio.

              É o que separa "dar por visto" de "apagar": o farol para de
              chamar, mas o fato continua na tela para quem for procurar.
              Escondê-lo de vez transformaria o botão num jeito de fazer o
              problema sumir, que é exatamente o que ele não pode ser.
            */}
            {caladosVisiveis.length > 0 && (
              <article className="farol__grupo farol__grupo--calado">
                <div className="farol__grupo-topo-linha">
                  <button
                    type="button"
                    className="farol__grupo-topo"
                    aria-expanded={!recolhidos.has('calados')}
                    onClick={() => alternarGrupo('calados')}
                  >
                    <span className="farol__ponto" data-estado="calado" aria-hidden="true" />
                    {caladosVisiveis.length === 1
                      ? '1 alerta dado por visto'
                      : `${caladosVisiveis.length} alertas dados por visto`}
                    <span
                      className="farol__grupo-seta"
                      data-aberto={!recolhidos.has('calados') || undefined}
                    >
                      <Icone nome="cima-baixo" tamanho={16} />
                    </span>
                  </button>

                  <button
                    type="button"
                    className="farol__silenciar"
                    onClick={silenciados.reativarTudo}
                  >
                    <Icone nome="atualizar" tamanho={14} />
                    Mostrar de novo
                  </button>
                </div>

                {!recolhidos.has('calados') && (
                  <>
                    <p className="farol__nota">
                      Voltam sozinhos se piorarem, e em até 4 horas de qualquer forma.
                    </p>
                    <ul>
                      {caladosVisiveis.map((a) => (
                        <li key={a.chave} data-gravidade="calado">
                          <span className="farol__item-icone" aria-hidden="true">
                            <Icone nome={a.icone} tamanho={16} />
                          </span>
                          <strong className="farol__item-numero num">{a.contagem}</strong>
                          <span className="farol__item-texto">
                            {a.descricao} — {a.loja}
                          </span>
                          <button
                            type="button"
                            className="farol__reativar"
                            onClick={() => silenciados.reativar(a.chave)}
                          >
                            Mostrar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
