import { useEffect, useRef } from 'react'
import { Botao, Escolha, Faixa, Icone, Interruptor } from '@matsuya/ui'
import { proximoVolumeDaRoda } from '../../som/preferencias'
import type { EstadoDoSom, SomDePedidoNovo, TipoDeAlerta } from '../../som/alertas'

/**
 * Alertas de som.
 *
 * ## Duas coisas que calam, e por que continuam separadas
 *
 * **Mudo** é a chave geral; **volume** é quanto. Fazer uma significar a outra é
 * como um controle passa a mentir sobre o outro: silenciar apagaria o volume
 * que a pessoa ajustou, e arrastar até zero marcaria como mudo um som que ela
 * só queria baixo. As duas calam; cada uma guarda a própria resposta — e a tela
 * **diz** quando o volume está em zero, senão o mudo desligado com volume zero
 * seria um mistério.
 *
 * ## O que a prévia demonstra
 *
 * Ela toca **mesmo com o evento desligado**. Quem está decidindo se liga aquele
 * aviso precisa ouvi-lo justamente enquanto ele está desligado; um botão de
 * prévia mudo no único momento em que serve não serve para nada.
 *
 * Ela respeita o mudo e o "navegador não deixa", porque forçar ali seria tocar
 * som que a pessoa acabou de proibir.
 */

interface Alerta {
  tipo: TipoDeAlerta
  titulo: string
  descricao: string
}

/**
 * Os três sons que existem.
 *
 * São padrões **sintetizados** em `som/alertas.ts`, não arquivos — daí não
 * haver "escolher um som" aqui: não há biblioteca de onde escolher. O que dá
 * para fazer é ligar, desligar e ouvir.
 */
/**
 * As três opções de som de pedido recebido.
 *
 * Nomeadas pelo que soam, e não "Som 1, 2 e 3": num seletor de três, o número
 * obriga a ouvir os três toda vez só para lembrar qual era qual.
 */
const SONS: Array<{ valor: SomDePedidoNovo; rotulo: string; detalhe: string }> = [
  { valor: 'duas-notas', rotulo: 'Duas notas', detalhe: 'Sobe, curto e discreto' },
  { valor: 'telefone', rotulo: 'Telefone', detalhe: 'Trinado alto, corta o barulho' },
  { valor: 'campainha', rotulo: 'Campainha', detalhe: 'Grave, din-don' },
]

const ALERTAS: Alerta[] = [
  {
    tipo: 'pedido-novo',
    // "Pedido recebido" aqui também: o mesmo evento com dois nomes na mesma
    // tela — "Pedido novo" em cima e "Pedido recebido" embaixo — leria como
    // dois ajustes diferentes.
    titulo: 'Pedido recebido',
    descricao: 'Toca quando um pedido entra na fila de aceite.',
  },
  {
    tipo: 'sla-estourado',
    titulo: 'Prazo estourado',
    descricao:
      'Toca quando um pedido passa do prazo. Mais insistente que os outros, de propósito.',
  },
  {
    tipo: 'erro',
    titulo: 'Falha numa ação',
    descricao: 'Toca quando aceitar, despachar ou imprimir não deu certo.',
  },
]

export function SomDosAlertas({
  som,
}: {
  som: {
    estado: EstadoDoSom
    volume: number
    eventos: Readonly<Record<TipoDeAlerta, boolean>>
    destravar: () => void
    silenciar: () => void
    religar: () => void
    definirVolume: (v: number) => void
    definirEvento: (tipo: TipoDeAlerta, ligado: boolean) => void
    somDePedidoNovo: SomDePedidoNovo
    definirSomDePedidoNovo: (som: SomDePedidoNovo) => void
    ouvir: (tipo: TipoDeAlerta) => void
  }
}) {
  const faixa = useRef<HTMLInputElement>(null)

  /*
   * A roda do mouse ajusta o volume — **só com o controle focado**.
   *
   * Roda que muda valor por estar apenas sob o ponteiro rouba a rolagem do
   * painel, e é assim que uma tela de ajustes fica impossível de percorrer.
   * Exigir foco resolve os dois lados: quem só está passando rola a página,
   * quem clicou no controle ajusta.
   *
   * Ouvinte nativo com `{ passive: false }` porque o `onWheel` do React é
   * registrado como passivo — nele o `preventDefault` é ignorado, e a página
   * rolaria **junto** com a mudança de volume.
   */
  useEffect(() => {
    const el = faixa.current
    if (!el) return

    const aoGirar = (evento: WheelEvent) => {
      if (document.activeElement !== el) return
      evento.preventDefault()
      som.definirVolume(proximoVolumeDaRoda(som.volume, evento.deltaY))
    }

    el.addEventListener('wheel', aoGirar, { passive: false })
    return () => el.removeEventListener('wheel', aoGirar)
  }, [som])

  const mudo = som.estado === 'mudo'
  const bloqueado = som.estado === 'bloqueado'
  const indisponivel = som.estado === 'indisponivel'
  const semVolume = som.volume <= 0

  /** Nada vai soar — por qualquer um dos motivos. */
  const calado = mudo || bloqueado || indisponivel || semVolume

  return (
    <>
      {/*
        O navegador exige um gesto antes de qualquer som. Sem esta explicação,
        alertas silenciosos numa aba recém-aberta parecem defeito do Hub.
      */}
      {bloqueado && (
        <Faixa
          tom="atencao"
          icone="alerta"
          acao={
            <Botao enfase="primaria" icone="som" onClick={som.destravar}>
              Ativar o som
            </Botao>
          }
        >
          O navegador exige um toque antes de tocar qualquer som. Enquanto isso,
          nenhum alerta soa.
        </Faixa>
      )}

      {indisponivel && (
        <Faixa tom="perigo" icone="alerta">
          Este navegador não permite tocar som. Os avisos continuam aparecendo na
          tela — só não fazem barulho.
        </Faixa>
      )}

      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">Geral</h3>

        <div className="ajustes__linha">
          <div className="ajustes__sobre">
            <p className="ajustes__titulo" id="ajuste-mudo">
              Alertas sonoros
            </p>
            <p className="ajustes__descricao">
              {mudo
                ? 'Silenciado neste dispositivo. Continua assim depois de recarregar a página.'
                : 'Ligados neste dispositivo. Cada tablete guarda a própria escolha.'}
            </p>
          </div>

          <Interruptor
            ligado={!mudo}
            rotuladoPor="ajuste-mudo"
            desabilitado={indisponivel}
            dica={indisponivel ? 'Este navegador não permite tocar som.' : undefined}
            aoAlternar={(ligar) => (ligar ? som.religar() : som.silenciar())}
          />
        </div>

        {/*
          A escolha do som de pedido recebido.

          Só este evento tem variante: é o que toca dezenas de vezes por turno, e
          é onde faz diferença poder trocar quando o padrão se confunde com o de
          outro aparelho da loja. Dar variante a "prazo estourado" transformaria
          um alarme numa preferência estética.
        */}
        <div className="ajustes__linha">
          <div className="ajustes__sobre">
            <p className="ajustes__titulo" id="ajuste-som-pedido">
              Pedido recebido
            </p>
            <p className="ajustes__descricao">
              Escolha um aviso de som para tocar quando sua loja receber um novo
              pedido.
            </p>
          </div>

          <div className="ajustes__controle">
            {/*
              A prévia toca o som **escolhido agora**, mesmo com o evento
              desligado — é ouvindo que se decide, e quem está comparando os três
              costuma estar justamente com ele desligado.
            */}
            <button
              type="button"
              className="ajustes__previa"
              aria-label="Ouvir o som escolhido"
              title={
                mudo
                  ? 'Silenciado pela chave acima'
                  : semVolume
                    ? 'Volume em zero'
                    : 'Ouvir o som escolhido'
              }
              disabled={mudo || bloqueado || indisponivel || semVolume}
              onClick={() => som.ouvir('pedido-novo')}
            >
              <Icone nome="som" tamanho={15} />
            </button>

            {/*
              Lista desenhada por nós, e não o `select` nativo: a lista de
              `<option>` é renderizada pelo sistema operacional e não aceita
              estilo nenhum. O que o nativo dava de graça — teclado, Escape,
              clique fora, devolução de foco — está reconstruído dentro da
              `Escolha`, que é o trabalho que essa troca custa.

              O rótulo vem do título da linha, que já está escrito ao lado.
            */}
            <Escolha
              valor={som.somDePedidoNovo}
              opcoes={SONS}
              rotuladoPor="ajuste-som-pedido"
              desabilitado={indisponivel}
              aoEscolher={som.definirSomDePedidoNovo}
            />
          </div>
        </div>

        <div className="ajustes__linha">
          <div className="ajustes__sobre">
            <p className="ajustes__titulo" id="ajuste-volume">
              Volume
            </p>
            <p className="ajustes__descricao">
              {semVolume
                ? 'Em zero, nenhum alerta vai soar — mesmo com tudo ligado.'
                : 'Vale para os três avisos. O de prazo estourado continua sendo o mais alto.'}
            </p>
          </div>

          <div className="ajustes__controle">
            <label className="ui-visualmente-oculto" htmlFor="ajuste-volume-faixa">
              Volume dos alertas
            </label>
            {/*
              `input[type=range]` nativo, estilizado. Recriar um deslizante
              custaria teclado, leitor de tela e toque que o nativo já traz — e
              é justamente o tipo de controle que se erra ao reimplementar.
            */}
            <input
              id="ajuste-volume-faixa"
              ref={faixa}
              className="ajustes__faixa"
              type="range"
              min={0}
              max={100}
              // De 1 em 1: contínuo de verdade. Com passo de 5 o carrinho
              // pulava entre vinte posições fixas, e arrastar dava a sensação
              // de engate em vez de deslize.
              step={1}
              // Sem isto o leitor de tela anuncia "70" — de quê, não diz.
              aria-valuetext={`${Math.round(som.volume * 100)} por cento`}
              value={Math.round(som.volume * 100)}
              disabled={indisponivel}
              aria-describedby="ajuste-volume"
              /*
                O trecho já percorrido, em vermelho — como na referência.
                Navegador nenhum estiliza a parte preenchida de um `range` por
                CSS puro, então a posição vem daqui como variável e o gradiente
                do trilho a consome. É o único jeito sem trocar o controle
                nativo por um reimplementado, que custaria teclado e toque.
              */
              style={
                { ['--preenchido' as string]: `${Math.round(som.volume * 100)}%` }
              }
              onChange={(e) => som.definirVolume(Number(e.target.value) / 100)}
            />
            <span className="ajustes__medida num">{Math.round(som.volume * 100)}%</span>
          </div>
        </div>
      </section>

      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">Quando tocar</h3>

        {calado && (
          <p className="ajustes__aviso">
            <Icone nome="som-cortado" tamanho={14} />
            {mudo
              ? 'Tudo silenciado pela chave acima — estas escolhas ficam guardadas para quando ela voltar.'
              : semVolume
                ? 'Volume em zero: nada vai soar, mesmo com as chaves ligadas.'
                : 'Nenhum som vai tocar até o alerta acima ser resolvido.'}
          </p>
        )}

        {ALERTAS.map((alerta) => {
          const id = `ajuste-${alerta.tipo}`
          const ligado = som.eventos[alerta.tipo] !== false

          return (
            <div className="ajustes__linha" key={alerta.tipo}>
              <div className="ajustes__sobre">
                <p className="ajustes__titulo" id={id}>
                  {alerta.titulo}
                </p>
                <p className="ajustes__descricao">{alerta.descricao}</p>
              </div>

              <div className="ajustes__controle">
                {/*
                  A prévia toca mesmo com a chave desligada — é quando ela mais
                  serve. Fica desabilitada só quando NADA pode soar, e aí a dica
                  explica o motivo em vez de deixar um botão morto.
                */}
                <button
                  type="button"
                  className="ajustes__previa"
                  aria-label={`Ouvir o som de ${alerta.titulo.toLowerCase()}`}
                  title={
                    mudo
                      ? 'Silenciado pela chave geral'
                      : semVolume
                        ? 'Volume em zero'
                        : `Ouvir ${alerta.titulo.toLowerCase()}`
                  }
                  disabled={mudo || bloqueado || indisponivel || semVolume}
                  onClick={() => som.ouvir(alerta.tipo)}
                >
                  <Icone nome="som" tamanho={15} />
                </button>

                <Interruptor
                  ligado={ligado}
                  rotuladoPor={id}
                  desabilitado={indisponivel}
                  aoAlternar={(v) => som.definirEvento(alerta.tipo, v)}
                />
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}
