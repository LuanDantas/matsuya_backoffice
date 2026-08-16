import { useEffect, useMemo, useState } from 'react'
import { EstadoVazio, Faixa, PainelDeSecao, Selo } from '@matsuya/ui'
import { createApiClient, criarApiDeCardapio, type ItemDoCardapio } from '@matsuya/api-client'
import { config } from '../../app/config'
import { moeda } from '../../app/formato'

/**
 * Cardápio da unidade — leitura.
 *
 * Responde "o que está pausado agora?" sem mandar o operador a outro sistema.
 * **Não pausa nem reativa**: a escrita vive na rota legada, restrita a admin e
 * manager, e um botão que a maioria dos operadores não pode usar ensina a não
 * confiar nos controles da tela.
 *
 * Pausados vêm primeiro. É a única parte da lista sobre a qual alguém precisa
 * fazer alguma coisa.
 */
export function Cardapio({ unityId, token }: { unityId: number; token: string | null }) {
  const [itens, definirItens] = useState<ItemDoCardapio[]>([])
  const [carregando, definirCarregando] = useState(true)
  const [erro, definirErro] = useState<string | null>(null)

  const api = useMemo(() => {
    const cliente = createApiClient({ baseUrl: config.apiBaseUrl, obterToken: () => token })
    return criarApiDeCardapio(cliente)
  }, [token])

  useEffect(() => {
    const controle = new AbortController()
    definirCarregando(true)
    api
      .daUnidade(unityId, controle.signal)
      .then((r) => definirItens(r.items))
      .catch(() => {
        if (!controle.signal.aborted) definirErro('Não foi possível carregar o cardápio.')
      })
      .finally(() => {
        if (!controle.signal.aborted) definirCarregando(false)
      })
    return () => controle.abort()
  }, [api, unityId])

  const pausados = itens.filter((i) => !i.active)
  const ativos = itens.filter((i) => i.active)

  if (carregando) {
    return (
      <main className="carregando">
        <span className="carregando__giro" aria-hidden="true" />
        <p role="status">Carregando o cardápio…</p>
      </main>
    )
  }

  return (
    <main className="cardapio">
      {erro && (
        <Faixa tom="perigo" icone="alerta">
          {erro}
        </Faixa>
      )}

      <Faixa tom="informativo" icone="alerta">
        Esta tela é somente leitura. Pausar ou reativar item é feito no painel da
        rede.
      </Faixa>

      <PainelDeSecao titulo="Pausados" contagem={pausados.length}>
        {pausados.length === 0 ? (
          <EstadoVazio
            icone="check"
            titulo="Nada pausado"
            descricao="O cardápio inteiro está disponível para o cliente."
          />
        ) : (
          <Lista itens={pausados} />
        )}
      </PainelDeSecao>

      <PainelDeSecao titulo="Disponíveis" contagem={ativos.length}>
        {ativos.length === 0 ? (
          <EstadoVazio titulo="Nenhum item disponível" />
        ) : (
          <Lista itens={ativos} />
        )}
      </PainelDeSecao>
    </main>
  )
}

function Lista({ itens }: { itens: ItemDoCardapio[] }) {
  return (
    <ul className="cardapio__lista">
      {itens.map((item) => (
        <li key={item.id} className="cardapio__item" data-pausado={!item.active || undefined}>
          <span className="cardapio__nome">
            {item.name}
            <small>{item.categoryName}</small>
          </span>
          {!item.active && <Selo tom="atencao">Pausado</Selo>}
          <span className="num">{moeda.format(item.price)}</span>
        </li>
      ))}
    </ul>
  )
}
