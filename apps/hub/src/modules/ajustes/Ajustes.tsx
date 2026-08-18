import { useCallback, useMemo, useRef, useState } from 'react'
import { Botao, Icone, Selo } from '@matsuya/ui'
import type {
  DispositivoDeImpressao,
  DispositivoRegistrado,
  Identidade,
} from '@matsuya/api-client'
import type { EstadoDeSincronia } from '@matsuya/realtime'
import type { EstadoDoSom, SomDePedidoNovo, TipoDeAlerta } from '../../som/alertas'
import type { EstadoDaConexao } from '../../dados/conexao'
import type { SaudeDoAgente } from '../../impressao/saudeDoAgente'
import { config } from '../../app/config'
import { Dispositivos } from './Dispositivos'
import { SomDosAlertas } from './SomDosAlertas'
import { Diagnostico } from './Diagnostico'
import { cartoesDeDiagnostico, saudeGeral, type SinaisDoDiagnostico } from './sinais'
import {
  gruposPermitidos,
  paginaEfetiva,
  paginaVizinha,
  paginasPermitidas,
  type PaginaDeAjustes,
} from './paginas'

/**
 * Ajustes.
 *
 * ## Duas colunas
 *
 * Lista de páginas à esquerda, painel à direita — o desenho que toda tela de
 * configuração usa, e que a referência confirma. Antes eram três cartões
 * empilhados numa coluna só: funcionava com três seções e não escala, porque
 * cada seção nova aumenta a rolagem de todo mundo que veio procurar outra coisa.
 *
 * Isso põe **duas navegações laterais** na tela, junto do menu do aplicativo.
 * Fecha porque o menu recolhe para 60 px e guarda essa escolha — e ele **não é
 * recolhido sozinho** ao entrar aqui: mover a navegação da pessoa sem ela pedir
 * é pior do que um painel mais estreito.
 *
 * ## Quase tudo aqui é deste dispositivo
 *
 * Som, impressão e diagnóstico valem para **este tablete**, e é o que se quer:
 * quem silencia numa tablete não pode silenciar a da cozinha ao lado. A exceção
 * é "Agentes de impressão", que é por loja e passa pelo servidor.
 *
 * A configuração que vem de `config.json` aparece **somente para leitura**.
 * Editá-la aqui gravaria no navegador uma coisa que o arquivo sobrescreve na
 * próxima abertura — o pior tipo de campo: o que aceita e esquece.
 */

const SELO_DO_AGENTE: Record<
  SaudeDoAgente['estado'],
  { texto: string; tom: 'neutro' | 'sucesso' | 'perigo' | 'atencao' }
> = {
  verificando: { texto: 'Verificando', tom: 'neutro' },
  ativo: { texto: 'Ativo', tom: 'sucesso' },
  ausente: { texto: 'Sem resposta', tom: 'perigo' },
  nao_configurado: { texto: 'Não configurado', tom: 'neutro' },
}

export function Ajustes({
  som,
  impressao,
  saudeDoAgente,
  unityId,
  apiDeImpressao,
  conexao,
  sincronia,
  desvioMs,
  fila,
  cursores,
  nomesDasUnidades,
  identidade,
  permissoes,
  aoSair,
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
  impressao: {
    temAgente: boolean
    automatica: boolean
    pendentes: number
    tentarDeNovo: () => void
  }
  saudeDoAgente: SaudeDoAgente
  unityId: number
  apiDeImpressao: {
    dispositivos: (unityId: number, signal?: AbortSignal) => Promise<DispositivoDeImpressao[]>
    registrar: (unityId: number, nome: string) => Promise<DispositivoRegistrado>
    revogar: (unityId: number, deviceId: string) => Promise<{ revogado: boolean }>
  }
  conexao: EstadoDaConexao
  /**
   * O estado do cursor do diário.
   *
   * **Calculado desde sempre e nunca mostrado em lugar nenhum** até esta tela.
   * Ele responde outra pergunta que não a da conexão: o cabeçalho diz "Ao vivo"
   * enquanto isto pode estar `recuperando`.
   */
  sincronia: EstadoDeSincronia
  /** Desvio do relógio contra o servidor. Medido, e nunca aplicado. */
  desvioMs: number
  fila: { pendentes: number; disponivel: boolean }
  /** Cursor por loja: cada uma tem o seu, porque `seq` é por unidade. */
  cursores: ReadonlyMap<number, number>
  nomesDasUnidades: ReadonlyMap<number, string>
  identidade: Identidade | null
  permissoes: ReadonlySet<string>
  aoSair: () => void
}) {
  const [escolhida, definirEscolhida] = useState<PaginaDeAjustes | null>(null)
  const lateral = useRef<HTMLDivElement>(null)

  const grupos = useMemo(() => gruposPermitidos(permissoes), [permissoes])
  const ativa = paginaEfetiva(escolhida, permissoes)

  const sinais: SinaisDoDiagnostico = useMemo(
    () => ({
      conexao,
      sincronia,
      agente: saudeDoAgente.estado,
      agentePendentes: saudeDoAgente.pendentes,
      agenteFalhas: saudeDoAgente.falhas,
      filaPendentes: fila.pendentes,
      filaDisponivel: fila.disponivel,
    }),
    [conexao, sincronia, saudeDoAgente, fila.pendentes, fila.disponivel]
  )

  /*
   * A saúde geral vive aqui, e não dentro do Diagnóstico, porque quem precisa
   * dela é a lista à esquerda: uma bolinha no item avisa que há algo errado sem
   * obrigar a abrir a página. Um diagnóstico que só se descobre entrando nele
   * serve para conferir, não para avisar.
   */
  const geral = useMemo(() => saudeGeral(cartoesDeDiagnostico(sinais)), [sinais])

  const descricao = useMemo(
    () => paginasPermitidas(permissoes).find((p) => p.chave === ativa)!,
    [permissoes, ativa]
  )

  /** Cima e Baixo, porque a lista é vertical. A mecânica mora em `paginas.ts`. */
  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent<HTMLDivElement>) => {
      const destino = paginaVizinha(ativa, evento.key, permissoes)
      if (!destino) return
      evento.preventDefault()
      definirEscolhida(destino)
      lateral.current
        ?.querySelector<HTMLButtonElement>(`[data-pagina='${destino}']`)
        ?.focus()
    },
    [ativa, permissoes]
  )

  return (
    <main className="ajustes">
      <nav className="ajustes__lateral" aria-label="Seções dos ajustes">
        <h2 className="ajustes__marca">Ajustes</h2>

        <div
          className="ajustes__paginas"
          role="tablist"
          aria-orientation="vertical"
          ref={lateral}
          onKeyDown={aoTeclar}
        >
          {grupos.map((grupo) => (
            <div className="ajustes__grupo" key={grupo.rotulo}>
              {/*
                O rótulo do grupo é `presentation`: ele organiza a lista para
                quem enxerga, mas não é um destino. Anunciá-lo como item faria o
                leitor de tela contar cinco páginas e três títulos como oito.
              */}
              <p className="ajustes__grupo-rotulo" role="presentation">
                {grupo.rotulo}
              </p>

              {grupo.paginas.map((pagina) => {
                const corrente = ativa === pagina.chave
                return (
                  <button
                    key={pagina.chave}
                    type="button"
                    role="tab"
                    data-pagina={pagina.chave}
                    className="ajustes__pagina"
                    aria-selected={corrente}
                    aria-controls="ajustes-painel"
                    // Só a corrente entra na ordem de tabulação: chega-se à
                    // lista com um Tab e anda-se por ela com as setas.
                    tabIndex={corrente ? 0 : -1}
                    onClick={() => definirEscolhida(pagina.chave)}
                  >
                    {pagina.rotulo}
                    {/*
                      Só o Diagnóstico ganha marca, e só quando não está bem. A
                      bolinha é acompanhada do texto no `title` e de um rótulo
                      lido: cor sozinha não sobrevive a daltonismo nem a
                      contraluz de balcão.
                    */}
                    {pagina.chave === 'diagnostico' && geral !== 'ok' && geral !== 'neutro' && (
                      <span
                        className="ajustes__marca-saude"
                        data-saude={geral}
                        title={geral === 'ruim' ? 'Algo não está funcionando' : 'Algo pede atenção'}
                      >
                        <span className="ui-visualmente-oculto">
                          {geral === 'ruim' ? 'Algo não está funcionando' : 'Algo pede atenção'}
                        </span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </nav>

      <div
        className="ajustes__painel"
        id="ajustes-painel"
        role="tabpanel"
        aria-label={descricao.titulo}
        tabIndex={0}
        // Remonta ao trocar de página: devolve a rolagem ao topo, que é o que
        // se espera ao abrir outra seção.
        key={ativa}
      >
        <header className="ajustes__cabecalho">
          <h2>{descricao.titulo}</h2>
          <p>{descricao.resumo}</p>
        </header>

        {ativa === 'som' && <SomDosAlertas som={som} />}

        {ativa === 'impressao' && (
          <>
            <section className="ajustes__secao">
              <h3 className="ajustes__rotulo">Agente local</h3>

              <div className="ajustes__linha">
                <div className="ajustes__sobre">
                  <p className="ajustes__titulo">Estado do agente</p>
                  <p className="ajustes__descricao">
                    {saudeDoAgente.estado === 'ativo'
                      ? 'Respondendo. A comanda sai sem diálogo.'
                      : saudeDoAgente.estado === 'ausente'
                        ? 'Configurado, mas não respondeu. Confira se o serviço está rodando na loja — a comanda vai cair no diálogo do navegador.'
                        : saudeDoAgente.estado === 'verificando'
                          ? 'Perguntando ao agente…'
                          : 'Não configurado. A comanda abre o diálogo do navegador e alguém precisa confirmar.'}
                  </p>
                  {saudeDoAgente.impressoras.length > 0 && (
                    <ul className="ajustes__impressoras">
                      {saudeDoAgente.impressoras.map((i) => (
                        <li key={i.nome}>
                          <Selo tom={i.online ? 'sucesso' : 'perigo'}>
                            {i.online ? 'ok' : 'sem resposta'}
                          </Selo>
                          {i.nome} <span className="ajustes__papel">({i.papel})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="ajustes__controle">
                  <Selo tom={SELO_DO_AGENTE[saudeDoAgente.estado].tom}>
                    {SELO_DO_AGENTE[saudeDoAgente.estado].texto}
                  </Selo>
                  {saudeDoAgente.estado !== 'nao_configurado' && (
                    <Botao enfase="secundaria" icone="atualizar" onClick={saudeDoAgente.verificar}>
                      Verificar
                    </Botao>
                  )}
                </div>
              </div>

              {impressao.pendentes > 0 && (
                <div className="ajustes__linha">
                  <div className="ajustes__sobre">
                    <p className="ajustes__titulo">Comandas não impressas</p>
                    <p className="ajustes__descricao">
                      {impressao.pendentes} na fila. Elas se perdem se a página for
                      recarregada.
                    </p>
                  </div>
                  <Botao enfase="primaria" icone="impressora" onClick={impressao.tentarDeNovo}>
                    Tentar de novo
                  </Botao>
                </div>
              )}
            </section>

            <section className="ajustes__secao">
              <h3 className="ajustes__rotulo">Deste dispositivo</h3>

              {/*
                As duas linhas abaixo mostram valor real e **não** deixam mudar,
                de propósito: eles vêm do `config.json` instalado na tablete, e
                um campo aqui gravaria no navegador algo que o arquivo
                sobrescreve na próxima abertura.
              */}
              <div className="ajustes__linha">
                <div className="ajustes__sobre">
                  <p className="ajustes__titulo">Comanda automática no aceite</p>
                  <p className="ajustes__descricao">
                    {impressao.automatica
                      ? 'A comanda sai sozinha quando o pedido é aceito.'
                      : 'Desligada. Sem agente local, a impressão abriria o diálogo do navegador a cada aceite e travaria a tela. Use o botão Imprimir no detalhe do pedido.'}
                  </p>
                </div>
                <Selo tom={impressao.automatica ? 'sucesso' : 'neutro'}>
                  {impressao.automatica ? 'Ligada' : 'Desligada'}
                </Selo>
              </div>

              <div className="ajustes__linha">
                <div className="ajustes__sobre">
                  <p className="ajustes__titulo">Largura da bobina</p>
                  <p className="ajustes__descricao">
                    Definida no <span className="num">config.json</span> deste
                    dispositivo.
                  </p>
                </div>
                <Selo>{config.larguraDoPapel ?? 80} mm</Selo>
              </div>
            </section>
          </>
        )}

        {ativa === 'agentes' && <Dispositivos api={apiDeImpressao} unityId={unityId} />}

        {ativa === 'diagnostico' && (
          <Diagnostico
            sinais={sinais}
            desvioMs={desvioMs}
            cursores={cursores}
            nomesDasUnidades={nomesDasUnidades}
            identidade={identidade}
          />
        )}

        {ativa === 'conta' && (
          <section className="ajustes__secao">
            <h3 className="ajustes__rotulo">Sessão</h3>

            <div className="ajustes__linha">
              <div className="ajustes__sobre">
                <p className="ajustes__titulo">{identidade?.user.name ?? 'Sessão'}</p>
                <p className="ajustes__descricao num">{identidade?.user.email ?? '—'}</p>
              </div>
            </div>

            <div className="ajustes__linha">
              <div className="ajustes__sobre">
                <p className="ajustes__titulo">Alcance</p>
                <p className="ajustes__descricao">
                  {identidade?.scope.network
                    ? 'Todas as lojas da rede.'
                    : `${identidade?.units.length ?? 0} ${
                        (identidade?.units.length ?? 0) === 1 ? 'loja' : 'lojas'
                      }.`}
                </p>
              </div>
              <Selo tom="informativo">
                {identidade?.scope.network ? 'Rede' : 'Loja'}
              </Selo>
            </div>

            {/*
              O sair vive na barra do topo desde sempre. Ele fica aqui também
              porque é onde as pessoas procuram — e separado por uma divisória,
              como manda a regra de não encostar ação destrutiva no resto.
            */}
            <div className="ajustes__linha ajustes__linha--separada">
              <div className="ajustes__sobre">
                <p className="ajustes__titulo">Sair deste dispositivo</p>
                <p className="ajustes__descricao">
                  Encerra a sessão aqui. As lojas escolhidas e os ajustes deste
                  dispositivo continuam guardados.
                </p>
              </div>
              <Botao enfase="destrutiva" icone="sair" onClick={aoSair}>
                Sair
              </Botao>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
