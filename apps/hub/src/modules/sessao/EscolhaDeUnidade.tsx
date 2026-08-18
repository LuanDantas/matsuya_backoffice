import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Botao, CampoLinha, EstadoVazio, Icone } from '@matsuya/ui'
import type { Identidade } from '@matsuya/api-client'
import { corDaLoja, nomeDaLoja } from '../../app/loja'
import { LayoutDeEntrada } from './LayoutDeEntrada'

/**
 * Escolha da unidade.
 *
 * Só aparece quando há mais de uma: com uma unidade só, obrigar a escolher é
 * pedir um clique que não decide nada — `useSessao` já resolve esse caso
 * sozinho. Quem tem escopo de rede vê a lista inteira; quem tem escopo de
 * unidade vê apenas as suas, e a filtragem é do servidor: o front nem chega a
 * conhecer as outras.
 *
 * ## Por que dentro da casca da entrada
 *
 * Esta tela é o segundo passo de um fluxo cujo primeiro passo é o login — e o
 * login é uma tela de duas colunas, com marca, painel e tipografia própria.
 * Fora da casca, a mesma pessoa saía de lá e caía num `<ul>` cinza um segundo
 * depois. A moldura idêntica faz a troca ler como a mesma tela mudando de
 * assunto, e não como outro produto abrindo.
 *
 * ## Por que o bairro na frente
 *
 * As nove lojas se chamam `MATSUYA <bairro>`. Numa lista, isso são nove linhas
 * abrindo com a mesma palavra, e o que decide a escolha fica no fim de cada
 * uma. `nomeDaLoja` inverte o peso: bairro grande, marca pequena embaixo.
 */

/**
 * Acima disto, a lista ganha campo de busca.
 *
 * O cadastro de desenvolvimento tem nove unidades e cabe inteiro na tela; a
 * rede real opera perto de trinta e cinco, e trinta e cinco cartões sem filtro
 * é uma rolagem longa na primeira coisa que se abre no turno. O campo aparece
 * quando passa a servir para algo — antes disso ele só é mais um alvo entre a
 * pessoa e a loja dela.
 */
const BUSCA_A_PARTIR_DE = 8

/**
 * Quanto tempo o cartão escolhido fica marcado antes de o quadro montar.
 *
 * Não é atraso decorativo. O quadro tem piso de carregamento de três segundos
 * (`PISO_DE_CARREGAMENTO_MS`), então o toque hoje é seguido de uma tela que
 * troca e imediatamente congela em esqueleto. Um quarto de segundo mostrando
 * QUAL loja foi escolhida transforma o começo dessa espera em resposta ao
 * toque — e some dentro de uma espera que já existia, sem somar nada a ela.
 */
const CONFIRMACAO_MS = 240

const semAcento = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')

export function EscolhaDeUnidade({
  identidade,
  aoEscolher,
  aoSair,
}: {
  identidade: Identidade
  aoEscolher: (unityId: number) => void
  aoSair: () => void
}) {
  const [busca, definirBusca] = useState('')
  const [escolhida, definirEscolhida] = useState<number | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current)
  }, [])

  const lojas = useMemo(
    () => identidade.units.map((u) => ({ ...u, ...nomeDaLoja(u.name) })),
    [identidade.units]
  )

  const comBusca = lojas.length > BUSCA_A_PARTIR_DE

  const filtradas = useMemo(() => {
    const alvo = semAcento(busca.trim())
    if (!alvo) return lojas
    // Busca no nome do cadastro e no nome exibido: quem digita "matsuya" está
    // procurando pelo que leu na tela antiga, e quem digita "vila" pelo que lê
    // nesta. As duas coisas precisam achar.
    return lojas.filter(
      (u) => semAcento(u.name).includes(alvo) || semAcento(u.principal).includes(alvo)
    )
  }, [lojas, busca])

  function escolher(id: number) {
    if (escolhida !== null) return
    definirEscolhida(id)

    const imediato = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (imediato) {
      aoEscolher(id)
      return
    }

    temporizador.current = setTimeout(() => aoEscolher(id), CONFIRMACAO_MS)
  }

  return (
    <LayoutDeEntrada
      variante="escolha"
      titulo="Em qual loja você está?"
      subtitulo={`${identidade.user.name} · ${
        identidade.scope.network ? 'acesso à rede' : 'acesso por unidade'
      }`}
      acao={
        <Botao enfase="fantasma" icone="sair" onClick={aoSair}>
          Sair
        </Botao>
      }
      // A frase padrão do painel apresenta o produto, e quem chegou aqui já
      // entrou. No lugar dela, a única dúvida que esta tela cria de verdade.
      rodape="Escolha por onde começar. Dá para acompanhar outras lojas depois, pelo seletor no topo do quadro — nada aqui é definitivo."
    >
      {identidade.units.length === 0 ? (
        <EstadoVazio
          icone="loja"
          titulo="Nenhuma unidade no seu acesso"
          descricao="Peça ao responsável para conceder acesso a uma loja antes de abrir o Hub."
          acao={
            <Botao enfase="secundaria" onClick={aoSair}>
              Trocar de usuário
            </Botao>
          }
        />
      ) : (
        <div className="escolha">
          {comBusca && (
            <div className="escolha__busca">
              <CampoLinha
                id="busca-unidade"
                rotulo="Buscar loja"
                type="search"
                value={busca}
                onChange={(e) => definirBusca(e.target.value)}
                placeholder="Bairro ou nome"
                autoComplete="off"
              />
              {/*
                A contagem é para quem não vê a lista encolher. `polite` e não
                `assertive`: ela muda a cada tecla, e interromper a digitação
                para anunciar cada passo é pior que não anunciar.
              */}
              <p className="escolha__contagem" role="status" aria-live="polite">
                {filtradas.length === lojas.length
                  ? `${lojas.length} lojas no seu acesso`
                  : `${filtradas.length} de ${lojas.length} lojas`}
              </p>
            </div>
          )}

          {filtradas.length === 0 ? (
            <p className="escolha__vazio">Nenhuma loja com esse nome.</p>
          ) : (
            <ul className="escolha__lista">
              {filtradas.map((unidade, indice) => {
                const marcada = escolhida === unidade.id
                const esbatida = escolhida !== null && !marcada

                return (
                  <li
                    key={unidade.id}
                    className="escolha__item"
                    /* O escalonamento da entrada vem daqui e não de `nth-child`
                       porque a lista é filtrável: com `nth-child`, o item que
                       sobra numa busca herdaria o atraso da posição em que
                       ficou, e a lista de um item entraria com meio segundo de
                       silêncio antes. */
                    style={{ '--ordem': String(Math.min(indice, 7)) } as CSSProperties}
                  >
                    <button
                      type="button"
                      className="escolha__opcao"
                      onClick={() => escolher(unidade.id)}
                      disabled={escolhida !== null}
                      aria-busy={marcada || undefined}
                      data-escolhida={marcada || undefined}
                      data-esbatida={esbatida || undefined}
                    >
                      <span
                        className="escolha__disco"
                        style={{ background: marcada ? 'var(--marca)' : corDaLoja(unidade.name) }}
                        aria-hidden="true"
                      >
                        <Icone nome={marcada ? 'check' : 'loja'} tamanho={20} />
                      </span>

                      <span className="escolha__nome">
                        <strong>{unidade.principal}</strong>
                        {unidade.apoio && <small>{unidade.apoio}</small>}
                      </span>

                      <Icone
                        nome="seta-direita"
                        tamanho={18}
                        className="escolha__seta"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </LayoutDeEntrada>
  )
}
