import { useCallback, useEffect, useRef, useState } from 'react'
import { Botao, CampoLinha, EstadoVazio, Icone, Modal, Selo } from '@matsuya/ui'
import type { DispositivoDeImpressao, DispositivoRegistrado } from '@matsuya/api-client'
import { decorrido } from '../../app/formato'

/**
 * Os agentes de impressão registrados nesta loja.
 *
 * ## Por que esta tela existe
 *
 * Até ela, registrar um agente exigia `curl`. Instalar impressão numa loja
 * dependia de alguém com acesso a terminal e ao token de autenticação da API —
 * o que na prática significa que a instalação não acontecia sem um
 * desenvolvedor junto, e o portão da fase é operar duas lojas piloto.
 *
 * ## O token aparece uma vez
 *
 * E a tela precisa deixar isso brutalmente claro **antes** de a pessoa fechar
 * o diálogo. Não há recuperação: quem perder registra outro e revoga este. Um
 * aviso discreto aqui vira um chamado de suporte depois, com alguém já na loja
 * com a instalação pela metade.
 *
 * ## Cartão, e não linha de ajuste
 *
 * O resto desta tela é ajuste — um rótulo e um controle. Aqui cada item é uma
 * **coisa** com nome, estado, impressoras e uma ação destrutiva. Cartão é a
 * forma que comporta isso sem espremer tudo numa linha, e é o que separa
 * visualmente "o que eu configuro" de "o que existe lá na loja".
 */
export function Dispositivos({
  api,
  unityId,
}: {
  api: {
    dispositivos: (unityId: number, signal?: AbortSignal) => Promise<DispositivoDeImpressao[]>
    registrar: (unityId: number, nome: string) => Promise<DispositivoRegistrado>
    revogar: (unityId: number, deviceId: string) => Promise<{ revogado: boolean }>
  }
  unityId: number
}) {
  const [lista, definirLista] = useState<DispositivoDeImpressao[] | null>(null)
  const [erro, definirErro] = useState<string | null>(null)
  const [nome, definirNome] = useState('')
  const [registrando, definirRegistrando] = useState(false)
  const [revogando, definirRevogando] = useState<string | null>(null)
  const [recemCriado, definirRecemCriado] = useState<DispositivoRegistrado | null>(null)
  const [aRevogar, definirARevogar] = useState<DispositivoDeImpressao | null>(null)
  /** Erro da revogação, mostrado **dentro** do diálogo — ver `Modal` abaixo. */
  const [erroDaRevogacao, definirErroDaRevogacao] = useState<string | null>(null)
  const [copiado, definirCopiado] = useState(false)

  const campoDoToken = useRef<HTMLTextAreaElement>(null)

  const carregar = useCallback(
    async (signal?: AbortSignal) => {
      try {
        definirLista(await api.dispositivos(unityId, signal))
        definirErro(null)
      } catch (falha) {
        if (signal?.aborted) return
        definirErro(falha instanceof Error ? falha.message : 'Não consegui carregar.')
      }
    },
    [api, unityId]
  )

  useEffect(() => {
    const controle = new AbortController()
    void carregar(controle.signal)
    return () => controle.abort()
  }, [carregar])

  const registrar = async () => {
    if (nome.trim().length < 2) return

    definirRegistrando(true)
    try {
      definirRecemCriado(await api.registrar(unityId, nome.trim()))
      definirCopiado(false)
      definirNome('')
      await carregar()
    } catch (falha) {
      definirErro(falha instanceof Error ? falha.message : 'Não consegui registrar.')
    } finally {
      definirRegistrando(false)
    }
  }

  /**
   * Confirma a revogação num diálogo do próprio sistema.
   *
   * Era `window.confirm`. Ele funciona, e tem três defeitos que importam num
   * ponto destrutivo: **não dá para escrever nele** — o texto sai numa linha
   * corrida, sem hierarquia entre "o quê" e "o que acontece depois" —, ele
   * **trava a aba inteira** enquanto está aberto, e o navegador desenha os
   * botões com o mesmo peso, então "OK" e "Cancelar" parecem a mesma coisa. Aqui
   * o botão que destrói é o vermelho, e o `Modal` do sistema já traz `Esc`,
   * armadilha de foco e devolução de foco ao fechar.
   *
   * A confirmação continua sendo obrigatória: revogar derruba a impressão da
   * loja até alguém reinstalar, e é a diferença entre um clique errado e uma
   * cozinha sem comanda no sábado à noite.
   */
  const revogar = async () => {
    const dispositivo = aRevogar
    if (!dispositivo) return

    definirRevogando(dispositivo.id)
    definirErroDaRevogacao(null)
    try {
      await api.revogar(unityId, dispositivo.id)
      definirARevogar(null)
      await carregar()
    } catch (falha) {
      // Dentro do diálogo, e não na página: fechar levaria embora o contexto de
      // qual agente falhou, e a pessoa teria de recomeçar para tentar de novo.
      definirErroDaRevogacao(
        falha instanceof Error ? falha.message : 'Não consegui revogar.'
      )
    } finally {
      definirRevogando(null)
    }
  }

  /**
   * Copia o token.
   *
   * A área de transferência exige contexto seguro e pode ser negada. Quando
   * falha, o texto é **selecionado** e a mensagem muda para "selecionado, use
   * Ctrl+C" — um botão que não faz nada e não explica seria pior do que não ter
   * botão, ainda mais num diálogo que diz que o valor não aparece de novo.
   */
  const copiar = async () => {
    const token = recemCriado?.token ?? ''
    try {
      await navigator.clipboard.writeText(token)
      definirCopiado(true)
    } catch {
      campoDoToken.current?.select()
      definirCopiado(false)
    }
  }

  return (
    <>
      {erro && (
        <p className="ajustes__aviso" role="alert">
          <Icone nome="alerta" tamanho={14} />
          {erro}
        </p>
      )}

      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">Registrados nesta loja</h3>

        {/* Esqueleto no formato do cartão: a lista vem da rede, e um espaço em
            branco enquanto ela não chega parece "nenhum agente". */}
        {lista === null && !erro && (
          <div className="agentes__lista" role="status">
            <span className="agentes__esqueleto" />
            <span className="ui-visualmente-oculto">Carregando os agentes…</span>
          </div>
        )}

        {lista !== null && lista.length === 0 && (
          <EstadoVazio
            icone="impressora"
            titulo="Nenhum agente registrado"
            descricao="Sem agente, a comanda abre o diálogo do navegador e alguém precisa confirmar a cada pedido."
          />
        )}

        {lista !== null && lista.length > 0 && (
          <ul className="agentes__lista">
            {lista.map((d) => (
              <li className="agentes__item" key={d.id} data-offline={!d.online || undefined}>
                {/*
                  O ladrilho com o ícone ancora o olho, como o avatar ancora a
                  lista de conversas: numa lista de quatro agentes, é por ele
                  que se desce procurando o que está fora do ar.
                */}
                <span className="agentes__ladrilho" aria-hidden="true">
                  <Icone nome="impressora" tamanho={18} />
                </span>

                <div className="agentes__corpo">
                  <div className="agentes__topo">
                    <span className="agentes__nome">
                      <strong>{d.nome}</strong>
                      {/*
                        Selo com a palavra, e não só cor: é este dado que decide
                        se alguém pega o carro e vai até a loja.
                      */}
                      <Selo tom={d.online ? 'sucesso' : 'perigo'}>
                        {d.online ? 'Online' : 'Offline'}
                      </Selo>
                    </span>

                    {/*
                      Revogar é **neutro em repouso e vermelho sob o ponteiro**.

                      Preenchido de vermelho ele competia com o selo de offline e
                      escondia justamente o aviso que importa; sem moldura
                      nenhuma, virava um link e deixava de parecer botão. Assim
                      ele fica quieto na lista e declara o perigo no instante em
                      que alguém encosta — que é quando a informação serve. A
                      confirmação continua sendo a trava de verdade.
                    */}
                    <Botao
                      enfase="secundaria"
                      icone="lixeira"
                      carregando={revogando === d.id}
                      onClick={() => {
                        definirErroDaRevogacao(null)
                        definirARevogar(d)
                      }}
                    >
                      Revogar
                    </Botao>
                  </div>

                  <p className="agentes__estado">
                    {d.online
                      ? 'Comunicando com o servidor.'
                      : d.lastSeenAt
                        ? `Sem sinal há ${decorrido(d.lastSeenAt, Date.now())}.`
                        : 'Nunca se comunicou. Confira se o agente está rodando na loja.'}
                  </p>

                  {d.impressoras.length > 0 && (
                    <ul className="agentes__impressoras">
                      {d.impressoras.map((i) => (
                        <li key={i.nome} data-offline={!i.online || undefined}>
                          <span className="agentes__ponto" aria-hidden="true" />
                          {i.nome}
                          {/*
                            O papel só aparece quando diz algo que o nome não
                            diz. "Cozinha (cozinha)" lia como defeito, e é o caso
                            comum: a impressora costuma ser batizada com o
                            próprio posto.
                          */}
                          {i.papel.toLowerCase() !== i.nome.toLowerCase() && (
                            <span className="agentes__papel">{i.papel}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Sem exibir o token: o prefixo basta para identificar na
                      lista, e o rótulo evita que ele fique um código solto. */}
                  <p className="agentes__token">
                    Token <span className="num">{d.tokenPrefix}…</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">Registrar novo agente</h3>

        {/*
          A ajuda fica FORA do `CampoLinha`, e essa é a razão de o botão alinhar.

          O `.ui-campo` é uma coluna com rótulo, campo e ajuda; alinhar a linha
          pelo fim dela punha o botão abaixo do texto de ajuda, e não ao lado do
          campo. Tirando a ajuda para debaixo da linha inteira, o fim da coluna
          volta a ser o campo — sem nenhuma margem calculada à mão, que quebraria
          de novo assim que o rótulo passasse a ocupar duas linhas.

          O `aria-describedby` é passado à mão porque o `CampoLinha` só o monta
          quando ele mesmo desenha a ajuda; sem isso, o leitor de tela perderia a
          explicação do que escrever ali.
        */}
        <div className="agentes__registro">
          <CampoLinha
            id="nome-do-dispositivo"
            rotulo="Nome do agente"
            placeholder="PC do balcão"
            value={nome}
            maxLength={60}
            aria-describedby="ajuda-do-dispositivo"
            onChange={(e) => definirNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void registrar()}
          />
          <Botao
            enfase="primaria"
            icone="impressora"
            carregando={registrando}
            onClick={() => void registrar()}
            disabled={nome.trim().length < 2}
          >
            Registrar
          </Botao>
        </div>

        <p className="agentes__ajuda" id="ajuda-do-dispositivo">
          Um nome que diga onde ele está: “PC do balcão”, “Caixinha da cozinha”.
        </p>
      </section>

      <Modal
        aberto={aRevogar !== null}
        titulo={`Revogar “${aRevogar?.nome ?? ''}”?`}
        descricao="O agente para de imprimir imediatamente e só volta depois de ser registrado de novo, com um token novo."
        largura="estreito"
        aoFechar={() => definirARevogar(null)}
        rodape={
          <>
            <Botao enfase="secundaria" onClick={() => definirARevogar(null)}>
              Cancelar
            </Botao>
            {/*
              O botão que destrói é o único vermelho, e o foco **não** começa
              nele — o `useCamadaModal` foca o painel de propósito, justamente
              para um Enter distraído não revogar nada.
            */}
            <Botao
              enfase="destrutiva"
              icone="lixeira"
              carregando={revogando === aRevogar?.id}
              onClick={() => void revogar()}
            >
              Revogar agente
            </Botao>
          </>
        }
      >
        <p>
          Enquanto isso, as comandas desta loja voltam a abrir o diálogo do
          navegador, e alguém precisa confirmar a cada pedido.
        </p>

        {erroDaRevogacao && (
          <p className="ajustes__aviso" role="alert">
            <Icone nome="alerta" tamanho={14} />
            {erroDaRevogacao}
          </p>
        )}
      </Modal>

      <Modal
        aberto={recemCriado !== null}
        titulo="Token do agente"
        descricao="Copie agora. Ele não será exibido de novo."
        aoFechar={() => definirRecemCriado(null)}
        rodape={
          <Botao enfase="primaria" onClick={() => definirRecemCriado(null)}>
            Já copiei
          </Botao>
        }
      >
        <p>
          Cole no <code>agente.config.json</code> da loja, no campo{' '}
          <code>servidor.token</code>.
        </p>

        <div className="agentes__token-caixa">
          {/* `readOnly` e não `disabled`: campo desabilitado não deixa selecionar
              o texto, e copiar é a única coisa que se faz aqui. */}
          <textarea
            className="ajustes__token"
            ref={campoDoToken}
            readOnly
            rows={3}
            value={recemCriado?.token ?? ''}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Botao
            enfase={copiado ? 'sucesso' : 'secundaria'}
            icone={copiado ? 'check' : 'lista'}
            onClick={() => void copiar()}
          >
            {copiado ? 'Copiado' : 'Copiar'}
          </Botao>
        </div>

        <p className="ajustes__aviso">
          <Icone nome="alerta" tamanho={14} />
          Se perder, registre outro agente e revogue este. Não há como
          recuperá-lo.
        </p>
      </Modal>
    </>
  )
}
