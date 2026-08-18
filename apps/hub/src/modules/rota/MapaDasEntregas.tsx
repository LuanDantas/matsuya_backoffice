import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type LngLatBoundsLike, type Map as MapaGL } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Coordenada } from '@matsuya/utils'
import { formatarDistancia } from '@matsuya/utils'
import { config } from '../../app/config'

/**
 * O mapa das entregas.
 *
 * Carregado sob demanda (`React.lazy` em `EmRota.tsx`): o motor de mapa é a
 * maior dependência do Hub, e o quadro de pedidos — que abre a cada turno — não
 * pode pagar por um mapa que ele não usa.
 *
 * ## Por que MapLibre e OpenFreeMap
 *
 * O mapa anterior era o OpenStreetMap cru em imagens: o mapa de referência
 * técnica, não o de produto. Vetorial muda três coisas de uma vez — zoom
 * contínuo em vez de degraus, rótulos que giram com o mapa, e hierarquia de
 * vias legível de longe.
 *
 * A escolha do provedor foi por eliminação, não por gosto: CARTO exige contrato
 * empresarial para uso comercial e MapTiler libera comercial só no plano pago.
 * O OpenFreeMap é gratuito, sem chave, sem cadastro e liberado para uso
 * comercial. O custo dele é a fragilidade — instância pública mantida por uma
 * pessoa —, e é por isso que o endereço do estilo mora em `config.json`.
 *
 * ## Por que sem `react-map-gl`
 *
 * O invólucro em React é mais uma dependência para o que são cinquenta linhas
 * de `useEffect`. Este repositório não usa framework de UI em lugar nenhum, e
 * um mapa não é motivo para começar.
 *
 * ## Por que a versão 5, e não a 6
 *
 * A 6 partiu o pacote em três módulos — principal, compartilhado e **worker**
 * —, e calcula a URL do worker em tempo de execução a partir de
 * `import.meta.url`. O Vite não consegue analisar essa forma: ele não emite o
 * arquivo do worker no build, e o `new Worker(...)` aponta para um endereço que
 * não existe.
 *
 * O sintoma é traiçoeiro porque o mapa **quase** funciona: o estilo carrega, o
 * fundo pinta, os controles aparecem — e nenhuma rua é desenhada, porque quem
 * decodifica os tiles vetoriais é justamente o worker. Emitir o arquivo à mão
 * também não resolve: ele importa `maplibre-gl-shared.mjs`, e o asset solto
 * fica sem o irmão.
 *
 * A 5 embute o worker num blob dentro do próprio pacote. É a versão que
 * atravessa qualquer bundler sem configuração, e é por isso que ela está aqui.
 */

const ESTILO_PADRAO = 'https://tiles.openfreemap.org/styles/liberty'

/**
 * A cor da linha, lida do token em vez de escrita aqui.
 *
 * O WebGL não enxerga variável de CSS: o `paint` do MapLibre quer um valor
 * resolvido. Ler o token no momento de criar a camada é o que mantém a linha
 * do mapa e a linha do gráfico da home com a **mesma** cor — duas constantes
 * hexadecimais em arquivos diferentes divergem na primeira vez que alguém
 * ajusta uma delas.
 *
 * O `fallback` cobre o teste em `jsdom`, onde não há folha de estilo carregada.
 */
function corDaRota(): string {
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue('--grafico-linha')
    .trim()
  return token || '#1d4ed8'
}

/**
 * O traçado desenhado sobre o mapa, quando alguém está acompanhando.
 *
 * `pontos` já vem na ordem do GeoJSON (`[lng, lat]`) da API — o Hub nunca
 * decodifica polilinha nem inverte coordenada. Ver `modules/entregas/trajeto.ts`
 * na API, onde a conversão acontece uma vez só.
 */
export interface RotaNoMapa {
  pontos: Array<[number, number]>
  /** Quem está sendo acompanhado — o mapa enquadra só este par. */
  pedidoId: number
}

export interface PontoDeEntrega {
  id: number
  codigo: string
  cliente: string | null
  coordenada: Coordenada
  distanciaKm: number
  status: string
  /** Onde o entregador está, quando se sabe e a informação é recente. */
  entregador: { lat: number; lng: number; nome: string | null } | null
}

/**
 * Marcador em HTML, e não imagem.
 *
 * O motivo do mapa anterior continua valendo: PNG resolvido por URL relativa
 * quebra em build com hash. Em HTML ele herda as cores do tema, escala sem
 * borrar e aceita transição — que é o que faz o pino do entregador **andar** em
 * vez de saltar.
 */
function elementoDoPino(classe: string, conteudo = ''): HTMLElement {
  const el = document.createElement('span')
  el.className = classe
  el.innerHTML = `<span>${conteudo}</span>`
  return el
}

export default function MapaDasEntregas({
  unidade,
  nomeDaUnidade,
  pontos,
  selecionado,
  rota,
  foco,
  aoSelecionar,
}: {
  unidade: Coordenada | null
  nomeDaUnidade: string
  pontos: PontoDeEntrega[]
  selecionado: number | null
  /** O traçado a desenhar, ou `null` quando ninguém está acompanhando. */
  rota: RotaNoMapa | null
  /** Os pontos a enquadrar ao acompanhar — sobrepõe o enquadramento do conjunto. */
  foco: Coordenada[] | null
  aoSelecionar: (id: number) => void
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const mapa = useRef<MapaGL | null>(null)
  const pinos = useRef(new Map<string, maplibregl.Marker>())

  /*
   * A assinatura do conjunto de pontos.
   *
   * O enquadramento só é refeito quando esta string muda — ou seja, quando
   * entra ou sai uma entrega. Antes ele era refeito a cada atualização do
   * quadro, porque o array de pontos é recriado a cada render: numa tela que se
   * atualiza sozinha, isso arrancava o mapa da mão de quem estava navegando a
   * cada poucos segundos.
   */
  const chaveDosPontos = useMemo(
    () => pontos.map((p) => p.id).sort((a, b) => a - b).join(','),
    [pontos]
  )

  const chaveDoFoco = useMemo(
    () => (foco ? foco.map((c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`).join('|') : ''),
    [foco]
  )

  // ── O mapa, criado uma vez ──────────────────────────────────────────────
  useEffect(() => {
    if (!caixa.current || mapa.current) return

    const centro = unidade ?? pontos[0]?.coordenada
    if (!centro) return

    const gl = new maplibregl.Map({
      container: caixa.current,
      style: config.estiloDoMapa ?? ESTILO_PADRAO,
      center: [centro.lng, centro.lat],
      zoom: 12,
      // Sem rotação: o mapa é lido de relance para saber onde as coisas estão,
      // e um norte que não é para cima custa um segundo de reorientação toda
      // vez. Girar também não responde nenhuma pergunta desta tela.
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: { compact: true },
    })

    gl.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    gl.touchZoomRotate.disableRotation()

    mapa.current = gl

    return () => {
      gl.remove()
      mapa.current = null
      pinos.current.clear()
    }
    // Só na montagem: trocar centro depois é trabalho do enquadramento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Os pinos ────────────────────────────────────────────────────────────
  useEffect(() => {
    const gl = mapa.current
    if (!gl) return

    const vivos = new Set<string>()

    const por = (
      chave: string,
      classe: string,
      coord: { lat: number; lng: number },
      conteudo: string,
      aoClicar?: () => void
    ) => {
      vivos.add(chave)
      const existente = pinos.current.get(chave)

      if (existente) {
        // Mover o marcador existente, e não recriá-lo: é a troca de coordenada
        // no mesmo elemento que permite ao CSS animar o deslocamento. Recriar
        // faria o pino piscar de um ponto para o outro.
        existente.setLngLat([coord.lng, coord.lat])
        // A classe também muda sem o pino mudar de lugar — é assim que ele
        // esmaece ao entrar num acompanhamento e volta ao sair. Sem esta linha,
        // só pinos recém-criados receberiam o estado novo.
        existente.getElement().className = classe
        return
      }

      const el = elementoDoPino(classe, conteudo)
      if (aoClicar) el.addEventListener('click', aoClicar)

      pinos.current.set(
        chave,
        new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([coord.lng, coord.lat])
          .addTo(gl)
      )
    }

    if (unidade) por('loja', 'mapa__pino mapa__pino--loja', unidade, '★')

    for (const ponto of pontos) {
      /*
       * Acompanhando um, os outros esmaecem — não somem.
       *
       * Sumir esconderia entregas que continuam existindo e continuam podendo
       * dar errado; esmaecer diz "não é este" sem apagar a informação. O
       * atributo de dado faz o CSS decidir, e não este arquivo.
       */
      const foraDoFoco = rota !== null && rota.pedidoId !== ponto.id

      por(
        `destino-${ponto.id}`,
        `mapa__pino mapa__pino--destino${selecionado === ponto.id ? ' mapa__pino--ativo' : ''}${foraDoFoco ? ' mapa__pino--esmaecido' : ''}`,
        ponto.coordenada,
        '',
        () => aoSelecionar(ponto.id)
      )

      if (ponto.entregador) {
        por(
          `entregador-${ponto.id}`,
          `mapa__pino mapa__pino--entregador${foraDoFoco ? ' mapa__pino--esmaecido' : ''}`,
          ponto.entregador,
          ''
        )
      }
    }

    // Some com o que saiu da lista. Sem isto, um pedido entregue deixaria o
    // pino dele no mapa até alguém recarregar a página.
    for (const [chave, marcador] of pinos.current) {
      if (vivos.has(chave)) continue
      marcador.remove()
      pinos.current.delete(chave)
    }
  }, [pontos, unidade, selecionado, aoSelecionar])


  // ── O traçado ───────────────────────────────────────────────────────────
  /*
   * Duas linhas empilhadas, e não uma.
   *
   * Por baixo um traço largo e claro, por cima o fino e colorido. É o desenho
   * de contorno de sempre, e ele existe porque o mapa por baixo não é uma cor
   * só: a mesma linha atravessa parques verdes, avenidas brancas e quarteirões
   * cinzentos, e sem o contorno ela some justamente onde o fundo tem a
   * luminosidade dela. Com o contorno, a legibilidade não depende do que estava
   * embaixo.
   *
   * Fonte e camadas são criadas uma vez e depois só têm os dados trocados:
   * remover e recriar camada a cada atualização faz o mapa piscar.
   */
  useEffect(() => {
    const gl = mapa.current
    if (!gl) return

    const dados = {
      type: 'FeatureCollection' as const,
      features: rota
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: rota.pontos },
            },
          ]
        : [],
    }

    const aplicar = () => {
      const fonte = gl.getSource('rota') as maplibregl.GeoJSONSource | undefined

      if (fonte) {
        fonte.setData(dados)
        return
      }

      gl.addSource('rota', { type: 'geojson', data: dados })

      gl.addLayer({
        id: 'rota-contorno',
        type: 'line',
        source: 'rota',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // Branco nos dois temas, de propósito: o estilo do mapa não muda com o
        // tema do Hub — as ruas continuam claras —, e um contorno escuro sobre
        // elas devolveria o problema que o contorno existe para resolver.
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
      })

      gl.addLayer({
        id: 'rota-linha',
        type: 'line',
        source: 'rota',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': corDaRota(), 'line-width': 3.5 },
      })
    }

    // `addSource` antes de o estilo carregar lança. Numa tela que abre com o
    // acompanhamento já pedido, essa é a corrida normal, não a exceção.
    if (gl.isStyleLoaded()) aplicar()
    else gl.once('load', aplicar)
  }, [rota])

  // ── O enquadramento ─────────────────────────────────────────────────────
  useEffect(() => {
    const gl = mapa.current
    if (!gl) return

    /*
     * Acompanhando, o mapa enquadra **o par**, não o conjunto.
     *
     * Enquadrar todas as entregas enquanto se acompanha uma deixa a linha
     * traçada como um risco de dois centímetros no canto. O par é o que a
     * pergunta pede: onde ele está, e para onde vai.
     */
    const todos = foco ?? [
      ...(unidade ? [unidade] : []),
      ...pontos.map((p) => p.coordenada),
    ]
    if (todos.length === 0) return

    if (todos.length === 1) {
      gl.easeTo({ center: [todos[0]!.lng, todos[0]!.lat], zoom: 14, duration: 400 })
      return
    }

    const limites = todos.reduce(
      (b, c) => b.extend([c.lng, c.lat]),
      new maplibregl.LngLatBounds([todos[0]!.lng, todos[0]!.lat], [todos[0]!.lng, todos[0]!.lat])
    ) as LngLatBoundsLike

    /*
     * Mais folga embaixo quando a folha está aberta: ela ocupa a faixa inferior
     * do mapa, e sem isso o destino cairia atrás dela — justamente o ponto que
     * quem abriu a folha quer ver.
     */
    gl.fitBounds(limites, {
      padding: foco ? { top: 56, right: 56, bottom: 220, left: 56 } : 56,
      maxZoom: 15,
      duration: 400,
    })
    // Só quando o CONJUNTO muda — ver `chaveDosPontos` —, ou quando entra e sai
    // um acompanhamento. `chaveDoFoco` é string pelo mesmo motivo: o array é
    // recriado a cada render e arrancaria o mapa da mão de quem navega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDosPontos, unidade, chaveDoFoco])

  // Sem nenhuma coordenada não há mapa a desenhar — e um mapa do oceano com
  // zoom mundial é pior do que uma explicação.
  if (!unidade && pontos.length === 0) {
    return (
      <div className="mapa mapa--sem-dados">
        <p>
          Nenhum destino tem coordenada cadastrada. O mapa aparece quando os
          endereços forem geocodificados.
        </p>
      </div>
    )
  }

  return (
    <div className="mapa" ref={caixa} aria-label={`Mapa das entregas de ${nomeDaUnidade}`}>
      {/*
        A lista abaixo é a leitura do mapa sem o mapa. Um `canvas` de WebGL é
        opaco para leitor de tela, e a informação não pode existir só ali.
      */}
      <ul className="ui-visualmente-oculto">
        <li>{nomeDaUnidade}, a loja</li>
        {pontos.map((p) => (
          <li key={p.id}>
            {p.codigo}
            {p.cliente ? `, ${p.cliente}` : ''}, a{' '}
            {formatarDistancia(p.distanciaKm)} da loja
            {p.entregador ? `, entregador ${p.entregador.nome ?? 'a caminho'}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
