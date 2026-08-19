import { useMemo, useState } from 'react'
import { Botao, Faixa, Icone, Selo } from '@matsuya/ui'
import type { Identidade } from '@matsuya/api-client'
import { corDoNome, dataCurta, iniciais, restante } from '../../app/formato'
import { corDaLoja } from '../../app/loja'
import { faixaDaValidade } from '../../dados/validadeDoToken'
import { textoDoDesvio } from './sinais'
import {
  lojasDaConta,
  papeisDaConta,
  permissoesDaConta,
  telasDaConta,
} from './acessos'
import { TrocaDeSenha } from './TrocaDeSenha'

/**
 * Minha conta.
 *
 * ## Para quem
 *
 * Para quem opera a loja — não é tela de administração de usuários, que não
 * existe em lugar nenhum do sistema. Ela responde três perguntas concretas:
 * *com que autoridade eu estou aqui*, *por que eu não vejo tal tela*, e *o que
 * acontece se eu sair*.
 *
 * ## O que ela mostra que ninguém mostrava
 *
 * `/auth/me` é chamado a cada entrada e traz papéis com escopo e validade, a
 * lista de permissões e as sensíveis. Antes desta página, `roles[]` só aparecia
 * dentro de um `<details>` **fechado** do Diagnóstico, e `permissions` /
 * `dangerousPermissions` não apareciam em lugar nenhum — a primeira só virava
 * porteiro, a segunda tinha zero referências no repositório inteiro.
 *
 * ## O que ela recusa a prometer
 *
 * Sair é **local**: não existe `POST /auth/logout` e o token continua valendo no
 * servidor até vencer. Trocar a senha não derruba sessão nenhuma. As duas coisas
 * estão escritas na tela, porque uma tela de conta que insinua o contrário
 * impede a pessoa de tomar a atitude que resolveria de verdade.
 */

export function Conta({
  identidade,
  permissoes,
  unidadesAtuais,
  expiraEm,
  desvioMs,
  pendentesNaFila,
  aoAlterarSenha,
  aoSair,
}: {
  identidade: Identidade | null
  permissoes: ReadonlySet<string>
  unidadesAtuais: readonly number[]
  /** Vencimento do token, já lido em `Casca`. O token em si não entra aqui. */
  expiraEm: number | null
  /** Desvio do relógio contra o servidor. Medido, e nunca aplicado. */
  desvioMs: number
  pendentesNaFila: number
  aoAlterarSenha: (atual: string, nova: string) => Promise<void>
  aoSair: () => void
}) {
  const [trocando, definirTrocando] = useState(false)
  const [trocou, definirTrocou] = useState(false)

  const agora = Date.now()

  // Sem `useMemo`: ele depende de `agora`, que muda a cada render, e um memo
  // cuja dependência sempre muda é só cerimônia em volta de um `map` de três
  // itens.
  const papeis = identidade ? papeisDaConta(identidade, agora) : []
  const telas = useMemo(() => telasDaConta(permissoes), [permissoes])
  const grupos = useMemo(
    () => (identidade ? permissoesDaConta(identidade) : []),
    [identidade]
  )
  const lojas = useMemo(
    () => (identidade ? lojasDaConta(identidade, unidadesAtuais) : []),
    [identidade, unidadesAtuais]
  )

  const nome = identidade?.user.name ?? 'Sessão'
  const abertas = telas.filter((t) => t.aberta)
  const fechadas = telas.filter((t) => !t.aberta)
  const acompanhando = lojas.filter((l) => l.acompanhando).length
  const validade = faixaDaValidade(expiraEm, agora)

  return (
    <>
      {/* ── Quem está usando ───────────────────────────────────────────── */}
      <section className="ajustes__secao">
        <div className="conta__cabecalho">
          <span
            className="conta__avatar"
            style={{ background: corDoNome(nome) }}
            aria-hidden="true"
          >
            {iniciais(nome)}
          </span>

          <div className="conta__quem">
            <h3 className="conta__nome">{nome}</h3>
            <p className="conta__email num">{identidade?.user.email ?? '—'}</p>
          </div>
        </div>

        {/*
          Os papéis saem do `<details>` do Diagnóstico e vêm para cá. É a
          resposta para "com que autoridade eu estou aqui", e ela não pertence a
          um bloco de detalhes técnicos.
        */}
        {papeis.length > 0 ? (
          <ul className="conta__papeis">
            {papeis.map((papel) => (
              <li className="conta__papel" key={papel.chave} data-vencido={papel.vencido || undefined}>
                <span className="conta__papel-nome">{papel.nome}</span>
                <span className="conta__papel-onde">{papel.onde}</span>

                {papel.expiraEm && (
                  <Selo
                    tom={papel.vencido ? 'perigo' : 'atencao'}
                    icone={papel.vencido ? 'alerta' : 'relogio'}
                  >
                    {papel.vencido
                      ? `venceu em ${dataCurta(papel.expiraEm)}`
                      : `até ${dataCurta(papel.expiraEm)}`}
                  </Selo>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ajustes__descricao">
            Nenhum papel atribuído a esta conta. O acesso que você tem vem de
            outro caminho — fale com quem administra a rede.
          </p>
        )}

        {/*
          A identidade é buscada uma vez por entrada e não é revalidada. Sem esta
          linha, a página passaria a impressão de estar ao vivo e um papel
          revogado hoje de manhã continuaria aparecendo como se fosse notícia
          fresca.
        */}
        <p className="conta__nota">
          Carregado quando você entrou. Mudanças de papel aparecem no próximo
          acesso.
        </p>
      </section>

      {/* ── O que abre ─────────────────────────────────────────────────── */}
      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">O que esta conta abre</h3>

        <ul className="conta__telas">
          {abertas.map(({ tela }) => (
            <li className="conta__tela" key={tela.tela}>
              <span className="conta__tela-marca" aria-hidden="true">
                <Icone nome={tela.icone} tamanho={16} />
              </span>
              <span className="conta__tela-nome">{tela.rotulo}</span>
              <span className="conta__tela-estado" data-aberta="true">
                <Icone nome="check" tamanho={14} aria-hidden="true" />
                liberada
              </span>
            </li>
          ))}

          {/*
            As bloqueadas ficam na mesma lista, e não escondidas: a pergunta que
            leva alguém a esta página é "por que eu não vejo Cardápio?", e ela só
            se responde mostrando o Cardápio ausente com o motivo ao lado.
          */}
          {fechadas.map(({ tela, falta }) => (
            <li className="conta__tela" key={tela.tela} data-fechada="true">
              <span className="conta__tela-marca" aria-hidden="true">
                <Icone nome={tela.icone} tamanho={16} />
              </span>
              <span className="conta__tela-nome">
                {tela.rotulo}
                {falta && (
                  <small>
                    Precisa de: {falta.descricao ?? falta.chave}
                  </small>
                )}
              </span>
              <span className="conta__tela-estado">
                <Icone nome="x" tamanho={14} aria-hidden="true" />
                sem acesso
              </span>
            </li>
          ))}
        </ul>

        {grupos.length > 0 && (
          <details className="ajustes__detalhes">
            <summary>
              Todas as permissões desta conta
              <span className="conta__contagem num">
                {grupos.reduce((total, g) => total + g.permissoes.length, 0)}
              </span>
            </summary>

            {/*
              A ressalva importa. Boa parte destas chaves ainda não tem rota nem
              tela em lugar nenhum; sem dizer isso, a lista prometeria poderes
              sem lugar onde exercê-los, e alguém sairia procurando uma tela de
              carteira que não existe.
            */}
            <p className="conta__nota">
              Isto é o que o seu papel concede. Nem toda permissão tem tela no
              Hub ainda — quem manda no que você vê é a lista acima.
            </p>

            <div className="conta__grupos">
              {grupos.map((grupo) => (
                <div className="conta__grupo" key={grupo.dominio}>
                  <h4>{grupo.rotulo}</h4>
                  <ul>
                    {grupo.permissoes.map((permissao) => (
                      <li key={permissao.chave}>
                        <span className="conta__permissao">
                          {permissao.descricao ?? permissao.chave}
                          {permissao.sensivel && (
                            <Selo tom="atencao" icone="alerta">
                              sensível
                            </Selo>
                          )}
                        </span>
                        <span className="conta__chave num">{permissao.chave}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ── Lojas ──────────────────────────────────────────────────────── */}
      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">Suas lojas</h3>

        <div className="ajustes__linha">
          <div className="ajustes__sobre">
            <p className="ajustes__titulo">
              {identidade?.scope.network
                ? `Todas as ${lojas.length} lojas da rede`
                : `${lojas.length} ${lojas.length === 1 ? 'loja' : 'lojas'}`}
            </p>
            <p className="ajustes__descricao">
              Quem define esse alcance é o seu papel no sistema — não dá para
              mudar por aqui. O que dá para escolher é <strong>quais delas este
              dispositivo acompanha</strong>, pelo seletor de lojas no alto da
              tela.
            </p>
          </div>
          <Selo tom="informativo">
            {identidade?.scope.network ? 'Rede' : 'Unidade'}
          </Selo>
        </div>

        <ul className="conta__lojas">
          {lojas.map((loja) => (
            <li className="conta__loja" key={loja.id} data-orfa={loja.orfa || undefined}>
              {/*
                Disco com ícone e não com letra: as lojas se chamam
                "MATSUYA ⟨bairro⟩" e a inicial seria "M" em todas. Ícone também
                baixa a régua de contraste de 4,5:1 (texto) para 3:1 (elemento
                gráfico), que é o que estes tons sustentam.
              */}
              <span
                className="conta__loja-disco"
                // A órfã fica cinza: pintar com a cor da loja daria a ela a
                // mesma presença das que ainda valem.
                style={loja.orfa ? undefined : { background: corDaLoja(loja.nome) }}
                aria-hidden="true"
              >
                <Icone nome="loja" tamanho={14} />
              </span>

              <span className="conta__loja-nome">
                {loja.nome}
                {loja.apoio && <small>{loja.apoio}</small>}
              </span>

              {loja.orfa ? (
                <Selo tom="atencao" icone="alerta">
                  acesso removido
                </Selo>
              ) : (
                loja.acompanhando && (
                  <span className="conta__loja-estado">
                    <Icone nome="check" tamanho={14} aria-hidden="true" />
                    acompanhando
                  </span>
                )
              )}
            </li>
          ))}
        </ul>

        <p className="conta__nota">
          {acompanhando} de {lojas.length} sendo acompanhadas neste dispositivo.
        </p>
      </section>

      {/* ── Segurança ──────────────────────────────────────────────────── */}
      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">Segurança</h3>

        {trocou && (
          <Faixa tom="sucesso" icone="check">
            Senha alterada. Esta sessão continua aberta — e as que estiverem
            abertas em outros aparelhos também, porque o servidor não tem como
            derrubá-las antes de vencerem. Se você trocou por suspeita de vazamento,
            peça a quem administra a rede para desativar e reativar seu acesso.
          </Faixa>
        )}

        <div className="ajustes__linha">
          <div className="ajustes__sobre">
            <p className="ajustes__titulo">Senha</p>
            <p className="ajustes__descricao">
              Pedimos a senha de agora para confirmar que é você.
            </p>
          </div>
          <Botao icone="cadeado" onClick={() => definirTrocando(true)}>
            Alterar senha
          </Botao>
        </div>
      </section>

      {/* ── Sessão ─────────────────────────────────────────────────────── */}
      <section className="ajustes__secao">
        <h3 className="ajustes__rotulo">Sessão neste dispositivo</h3>

        {/*
          O `exp` sempre esteve no token guardado aqui, e o Hub nunca o abriu:
          descobria o vencimento no primeiro 401, jogando a pessoa para fora no
          meio do turno sem aviso nenhum.
        */}
        {validade !== 'desconhecida' && expiraEm !== null && (
          <div className="ajustes__linha">
            <div className="ajustes__sobre">
              <p className="ajustes__titulo">
                {validade === 'vencida'
                  ? 'Este acesso já venceu'
                  : `Vence em ${restante(new Date(expiraEm).toISOString(), agora)}`}
              </p>
              <p className="ajustes__descricao">
                Não há renovação automática: quando vencer, a próxima ação pede
                para entrar de novo.
                {Math.abs(desvioMs) >= 60_000 && (
                  <>
                    {' '}
                    {textoDoDesvio(desvioMs)} — esta conta é feita pelo relógio
                    daqui e <strong>não corrige isso</strong>.
                  </>
                )}
              </p>
            </div>
            <Selo
              tom={
                validade === 'vencida'
                  ? 'perigo'
                  : validade === 'perto'
                    ? 'atencao'
                    : 'neutro'
              }
              icone="relogio"
            >
              {new Intl.DateTimeFormat('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              }).format(expiraEm)}
            </Selo>
          </div>
        )}

        <div className="ajustes__linha ajustes__linha--separada">
          <div className="ajustes__sobre">
            <p className="ajustes__titulo">Sair deste dispositivo</p>
            {/*
              O texto antigo dizia que as lojas escolhidas continuavam guardadas.
              Não continuam: `sair()` apaga a chave delas junto com o token.
            */}
            <p className="ajustes__descricao">
              Esquece o acesso <strong>e as lojas escolhidas</strong>. Os ajustes
              deste dispositivo — som, menu e o que você silenciou — continuam
              guardados. O encerramento é só aqui: o acesso segue valendo no
              servidor até vencer.
            </p>

            {pendentesNaFila > 0 && (
              <p className="conta__aviso">
                <Icone nome="alerta" tamanho={14} aria-hidden="true" />
                {pendentesNaFila === 1
                  ? 'Há 1 ação esperando para ser enviada.'
                  : `Há ${pendentesNaFila} ações esperando para serem enviadas.`}{' '}
                Elas continuam na fila deste dispositivo e vencem sozinhas em 30
                minutos.
              </p>
            )}
          </div>
          <Botao enfase="destrutiva" icone="sair" onClick={aoSair}>
            Sair
          </Botao>
        </div>
      </section>

      <TrocaDeSenha
        aberto={trocando}
        aoFechar={() => definirTrocando(false)}
        aoTrocar={aoAlterarSenha}
        aoConcluir={() => {
          definirTrocando(false)
          definirTrocou(true)
        }}
      />
    </>
  )
}
