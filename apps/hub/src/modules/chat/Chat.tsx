import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { EstadoVazio, Icone } from '@matsuya/ui'
import {
  agruparPorAutor,
  agruparPorDia,
  janelaDeMensagens,
  ultimaDoCliente,
  JANELA_INICIAL,
  type MensagemLocal,
} from '../../dados/mensagens'
// A fronteira de carregamento sob demanda é AQUI, sobre o módulo inteiro — ver
// o cabeçalho de `SeletorDeEmoji` para por que ela não pode ficar lá dentro.
const SeletorDeEmoji = lazy(() => import('./SeletorDeEmoji'))
import { horario, iniciais } from '../../app/formato'

/**
 * A conversa com o cliente sobre um pedido.
 *
 * **Apresentacional.** Ordem, mescla, eco do próprio envio e janela moram em
 * `dados/mensagens.ts`, com teste — o `vitest` deste repositório roda sem DOM, e
 * lógica dentro do componente é lógica que ninguém consegue testar. Aqui fica só
 * o que é DOM de verdade: a rolagem e o campo de texto.
 *
 * Quatro comportamentos que a operação de balcão impõe e que continuam valendo:
 *
 * - **Enter envia, Shift+Enter quebra linha.** Botão obrigatório custa um toque
 *   a cada resposta, e o operador está com a mão ocupada.
 * - **A rolagem só acompanha se já estava no fim.** Puxar a tela enquanto
 *   alguém lê uma mensagem antiga é a forma mais rápida de fazer a pessoa
 *   perder o que estava lendo.
 * - **Mensagem que falhou fica visível**, com botão de reenviar. Some da tela e
 *   o operador acha que respondeu — e o cliente continua esperando.
 * - **Marcar como lida só com a rolagem no fim.** Se a pessoa está lendo o
 *   histórico mais acima, ela não leu o que acabou de chegar, e marcar seria
 *   recibo falso.
 */

/** Perto disso, o contador aparece. Antes, ele seria só ruído. */
const AVISO_DE_LIMITE = 900
const LIMITE = 1000

/**
 * Frases prontas — **atalho de digitação, não modelo salvo**.
 *
 * Elas preenchem o campo e a pessoa edita antes de enviar. Não existe nada no
 * servidor sobre isso: não há tabela de modelo, não há configuração por loja, e
 * apresentá-las como "os modelos da sua loja" seria prometer uma configuração
 * que ninguém fez.
 */
const ATALHOS = [
  'Seu pedido já está sendo preparado!',
  'Estamos com um atraso de alguns minutos, pedimos desculpas.',
  'O entregador já saiu e está a caminho.',
  'Pode confirmar o endereço, por favor?',
]

const AUTOR: Record<string, string> = {
  customer: 'Cliente',
  system: 'Sistema',
}

/** "Hoje", "Ontem", ou a data por extenso. */
const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' })

function rotuloDoDia(dia: string, agora: number): string {
  const hoje = new Date(agora)
  const chave = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (dia === chave(hoje)) return 'Hoje'

  const ontem = new Date(agora)
  ontem.setDate(ontem.getDate() - 1)
  if (dia === chave(ontem)) return 'Ontem'

  const [ano, mes, d] = dia.split('-').map(Number)
  return DIA_LONGO.format(new Date(ano!, mes! - 1, d!))
}

export function Chat({
  orderId,
  codigoDoPedido,
  mensagens,
  carregando,
  erro,
  podeEscrever,
  agora,
  aoEnviar,
  aoReenviar,
  aoMarcarLida,
}: {
  orderId: number
  codigoDoPedido: string | null
  mensagens: MensagemLocal[]
  carregando: boolean
  erro: string | null
  podeEscrever: boolean
  agora: number
  aoEnviar: (corpo: string) => Promise<void>
  aoReenviar: (idLocal: number) => Promise<void>
  aoMarcarLida: (upToId: number) => void
}) {
  const [texto, definirTexto] = useState('')
  const [enviando, definirEnviando] = useState(false)
  const [limite, definirLimite] = useState(JANELA_INICIAL)
  const [emojiAberto, definirEmojiAberto] = useState(false)

  const lista = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const noFim = useRef(true)
  /** Altura antes de expandir a janela, para devolver a rolagem ao lugar. */
  const alturaAntes = useRef<number | null>(null)

  /*
   * O retorno de marcação vem de fora e muda de identidade a cada render de
   * quem chama. Numa dependência de efeito, isso dispararia um POST de
   * marcação **por render** — dezenas por minuto, para um fato que só muda
   * quando chega mensagem nova.
   */
  const marcarRef = useRef(aoMarcarLida)
  marcarRef.current = aoMarcarLida

  /** Até onde já foi marcado, para não repetir a mesma marcação. */
  const jaMarcado = useRef(0)

  const { visiveis, restantes } = useMemo(
    () => janelaDeMensagens(mensagens, limite),
    [mensagens, limite]
  )

  const porDia = useMemo(() => agruparPorDia(visiveis), [visiveis])

  // A conversa trocou: volta ao fim e à janela inicial.
  useEffect(() => {
    noFim.current = true
    jaMarcado.current = 0
    definirLimite(JANELA_INICIAL)
    definirTexto('')
  }, [orderId])

  /*
   * Devolve a rolagem ao lugar depois de "ver anteriores".
   *
   * Sem isto, o efeito abaixo veria `noFim` e saltaria para o fim assim que as
   * 200 mensagens antigas entrassem — jogando a pessoa de volta exatamente de
   * onde ela pediu para sair. Um botão de histórico que faz isso é pior do que
   * não ter botão.
   */
  useLayoutEffect(() => {
    const el = lista.current
    if (!el || alturaAntes.current === null) return
    el.scrollTop += el.scrollHeight - alturaAntes.current
    alturaAntes.current = null
  }, [visiveis])

  // Rola para o fim só se o operador já estava lá.
  useEffect(() => {
    if (alturaAntes.current !== null) return
    if (noFim.current && lista.current) {
      lista.current.scrollTop = lista.current.scrollHeight
    }
  }, [visiveis])

  /*
   * Marca como lida — e só com a rolagem no fim.
   *
   * A versão anterior marcava uma vez, na abertura, com a última mensagem
   * conhecida naquele instante: mensagem que chegasse com a conversa aberta
   * nunca era marcada. Agora acompanha, mas a condição de rolagem é obrigatória:
   * marcar o que está fora da vista é afirmar uma leitura que não aconteceu.
   */
  useEffect(() => {
    if (!noFim.current) return
    const ultima = ultimaDoCliente(mensagens)
    // Só quando avança: sem isto, toda releitura remarcaria o mesmo intervalo.
    if (ultima === null || ultima <= jaMarcado.current) return
    jaMarcado.current = ultima
    marcarRef.current(ultima)
  }, [mensagens])

  const aoRolar = useCallback(() => {
    const el = lista.current
    if (!el) return
    // 40 px de tolerância: rolagem com inércia raramente para no pixel exato.
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  const verAnteriores = useCallback(() => {
    alturaAntes.current = lista.current?.scrollHeight ?? null
    noFim.current = false
    definirLimite((atual) => atual + JANELA_INICIAL)
  }, [])

  const enviar = useCallback(async () => {
    const conteudo = texto.trim()
    if (!conteudo || enviando) return

    definirTexto('')
    definirEnviando(true)
    noFim.current = true
    try {
      await aoEnviar(conteudo)
    } finally {
      definirEnviando(false)
    }
  }, [texto, enviando, aoEnviar])

  const usarAtalho = useCallback((frase: string) => {
    // Preenche em vez de enviar: quem responde ainda quer ajustar o texto ao
    // caso antes de mandar.
    definirTexto(frase)
    campo.current?.focus()
  }, [])

  /**
   * Insere o emoji **onde o cursor está**, e devolve o cursor para depois dele.
   *
   * Concatenar no fim seria mais simples e erraria no caso comum: quem já
   * escreveu a frase e volta para pôr um emoji no meio dela. E sem recolocar a
   * seleção, o próximo caractere digitado iria para o começo do campo.
   */
  const inserirEmoji = useCallback((emoji: string) => {
    const el = campo.current
    const inicio = el?.selectionStart ?? texto.length
    const fim = el?.selectionEnd ?? texto.length

    definirTexto((atual) => atual.slice(0, inicio) + emoji + atual.slice(fim))
    definirEmojiAberto(false)

    // Depois do render: antes dele, o valor do campo ainda é o antigo e a
    // posição calculada cairia no lugar errado.
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const posicao = inicio + emoji.length
      el.setSelectionRange(posicao, posicao)
      // O campo cresce sozinho, e um emoji pode empurrar para a linha seguinte.
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
  }, [texto.length])

  // Trocar de conversa fecha o seletor: ele ficaria aberto sobre outra pessoa.
  useEffect(() => definirEmojiAberto(false), [orderId])

  const restam = LIMITE - texto.length

  return (
    <section className="chat" aria-label={`Conversa do pedido ${codigoDoPedido ?? orderId}`}>
      {/*
        `log` + `aria-live` para o leitor de tela anunciar mensagem que chega.
        `additions` porque anunciar a conversa inteira a cada render seria
        inutilizável.
      */}
      <div
        className="chat__lista"
        ref={lista}
        onScroll={aoRolar}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {carregando && mensagens.length === 0 && (
          <div className="chat__esqueleto" role="status">
            <span className="chat__esqueleto-bolha" />
            <span className="chat__esqueleto-bolha chat__esqueleto-bolha--minha" />
            <span className="chat__esqueleto-bolha" />
            <span className="ui-visualmente-oculto">Carregando a conversa…</span>
          </div>
        )}

        {erro && (
          <p className="chat__aviso chat__aviso--erro" role="alert">
            {erro}
          </p>
        )}

        {!carregando && !erro && mensagens.length === 0 && (
          <EstadoVazio
            icone="balao"
            titulo="Nenhuma mensagem"
            descricao="O cliente ainda não escreveu, e nada foi enviado daqui."
          />
        )}

        {restantes > 0 && (
          <button type="button" className="chat__anteriores" onClick={verAnteriores}>
            Ver as {restantes} mensagens anteriores
          </button>
        )}

        {porDia.map(({ dia, mensagens: doDia }) => (
          <div className="chat__dia" key={dia}>
            <p className="chat__data">
              <span>{rotuloDoDia(dia, agora)}</span>
            </p>

            {agruparPorAutor(doDia).map((grupo) => {
              const primeira = grupo[0]!
              const ultima = grupo[grupo.length - 1]!
              const euFalo = primeira.authorType === 'staff'
              const doSistema = primeira.authorType === 'system'

              return (
                <div
                  className="chat__grupo"
                  key={primeira.id}
                  data-autor={primeira.authorType}
                >
                  {/*
                    O avatar mostra QUEM da loja respondeu. `authorLabel` era
                    buscado e nunca exibido — num turno de quatro pessoas, "a
                    loja respondeu" não diz quem.
                  */}
                  {!doSistema && (
                    <span className="chat__avatar" aria-hidden="true">
                      {primeira.authorLabel ? iniciais(primeira.authorLabel) : (
                        <Icone nome="pessoa" tamanho={14} />
                      )}
                    </span>
                  )}

                  <div className="chat__bolhas">
                    {!doSistema && (
                      <p className="chat__quem">
                        {euFalo ? primeira.authorLabel ?? 'Loja' : AUTOR.customer}
                      </p>
                    )}

                    {grupo.map((mensagem) => (
                      <article
                        key={mensagem.id}
                        className="chat__mensagem"
                        data-autor={mensagem.authorType}
                        data-pendente={mensagem.pendente || undefined}
                        data-falhou={mensagem.falhou || undefined}
                      >
                        <p className="chat__corpo">{mensagem.body}</p>
                      </article>
                    ))}

                    {/* Um horário por grupo, e não um por bolha: é o que separa
                        uma conversa de um log. */}
                    <footer className="chat__meta">
                      <span className="num">
                        {horario.format(new Date(ultima.createdAt))}
                      </span>

                      {/*
                        O estado de envio, só nas nossas mensagens.

                        **Dois estados, e só dois, porque só dois são fato:**
                        relógio enquanto a mensagem está no ar, e um tique quando
                        o servidor a aceitou. Como no WhatsApp, o glifo segue a
                        ÚLTIMA mensagem do grupo.

                        O tique duplo e o tique azul **não existem aqui, e não é
                        esquecimento**. "Entregue" não tem coluna nem evento — e
                        hoje nada sequer entrega: não há aviso ao cliente quando
                        a loja responde. "Lido pelo cliente" tem coluna
                        (`read_by_customer_at`) que nunca é escrita nem enviada.
                        Desenhar os dois seria inventar confirmação de leitura, e
                        é exatamente com base nela que alguém decide **não**
                        ligar para o cliente.
                      */}
                      {euFalo && !ultima.falhou && (
                        <span
                          className="chat__estado"
                          data-estado={ultima.pendente ? 'enviando' : 'enviada'}
                        >
                          <Icone
                            nome={ultima.pendente ? 'relogio' : 'check'}
                            tamanho={13}
                            rotulo={ultima.pendente ? 'Enviando' : 'Enviada'}
                          />
                        </span>
                      )}
                      {grupo
                        .filter((m) => m.falhou)
                        .map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="chat__reenviar"
                            onClick={() => void aoReenviar(m.id)}
                          >
                            <Icone nome="atualizar" tamanho={12} /> não enviou — tentar de
                            novo
                          </button>
                        ))}
                    </footer>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {podeEscrever ? (
        <form
          className="chat__envio"
          onSubmit={(e) => {
            e.preventDefault()
            void enviar()
          }}
        >
          <div className="chat__atalhos" role="group" aria-label="Frases prontas">
            {ATALHOS.map((frase) => (
              <button
                key={frase}
                type="button"
                className="chat__atalho"
                onClick={() => usarAtalho(frase)}
                title={frase}
              >
                {frase}
              </button>
            ))}
          </div>

          <div className="chat__campo">
            <label className="ui-visualmente-oculto" htmlFor="chat-texto">
              Mensagem para o cliente
            </label>

            <div className="chat__emoji-caixa">
              {emojiAberto && (
                <Suspense
                  fallback={
                    <div className="emoji emoji__carregando" role="status">
                      <span className="carregando__giro" aria-hidden="true" />
                      <span className="ui-visualmente-oculto">Carregando os emoji…</span>
                    </div>
                  }
                >
                  <SeletorDeEmoji
                    aoEscolher={inserirEmoji}
                    aoFechar={() => definirEmojiAberto(false)}
                  />
                </Suspense>
              )}
              <button
                type="button"
                className="chat__ferramenta"
                data-ativo={emojiAberto || undefined}
                aria-label="Escolher emoji"
                aria-expanded={emojiAberto}
                onClick={() => definirEmojiAberto((a) => !a)}
              >
                <Icone nome="rosto" tamanho={18} />
              </button>
            </div>
            <textarea
              id="chat-texto"
              ref={campo}
              value={texto}
              onChange={(e) => definirTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void enviar()
                }
              }}
              placeholder="Escreva para o cliente…"
              rows={1}
              maxLength={LIMITE}
              // Cresce com o conteúdo até o teto do CSS, em vez de obrigar a
              // pessoa a arrastar a alça de `resize`.
              style={{ height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${el.scrollHeight}px`
              }}
            />

            {/*
              Enviar circular, como na referência.

              É um botão próprio e não o `Botao` do sistema: aquele não tem
              variante circular e recusa `className` de fora. O que ele
              garantia vem junto à mão — 44 px de alvo, `aria-label` porque
              não há rótulo visível, e o mesmo giro de carregamento —, senão
              trocar de componente seria trocar por um pior.
            */}
            <button
              type="submit"
              className="chat__enviar"
              aria-label="Enviar mensagem"
              title="Enviar"
              disabled={!texto.trim() || enviando}
              aria-busy={enviando || undefined}
            >
              {enviando ? (
                <span className="carregando__giro" aria-hidden="true" />
              ) : (
                <Icone nome="enviar" tamanho={18} />
              )}
            </button>
          </div>

          {/*
            O contador só aparece perto do fim. O `maxLength` corta em silêncio,
            e a API recusa acima de 1000 — cortar sem avisar é pior que os dois.
          */}
          {texto.length >= AVISO_DE_LIMITE && (
            <p className="chat__contador num" role="status">
              {restam} {restam === 1 ? 'caractere restante' : 'caracteres restantes'}
            </p>
          )}
        </form>
      ) : (
        <p className="chat__aviso">Seu acesso permite ler, mas não responder.</p>
      )}
    </section>
  )
}
