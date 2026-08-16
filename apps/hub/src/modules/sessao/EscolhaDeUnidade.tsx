import { Botao, EstadoVazio, Icone } from '@matsuya/ui'
import type { Identidade } from '@matsuya/api-client'

/**
 * Escolha da unidade.
 *
 * Só aparece quando há mais de uma: com uma unidade só, obrigar a escolher é
 * pedir um clique que não decide nada. Quem tem escopo de rede vê a lista
 * inteira; quem tem escopo de unidade vê apenas as suas — a filtragem é do
 * servidor, e o front nem chega a conhecer as outras.
 */
export function EscolhaDeUnidade({
  identidade,
  aoEscolher,
  aoSair,
}: {
  identidade: Identidade
  aoEscolher: (unityId: number) => void
  aoSair: () => void
}) {
  return (
    <main className="escolha">
      <header className="escolha__cabecalho">
        <div>
          <h1>Em qual loja você está?</h1>
          <p className="escolha__nota">
            {identidade.user.name} · {identidade.scope.network ? 'acesso à rede' : 'acesso por unidade'}
          </p>
        </div>
        <Botao enfase="fantasma" icone="sair" onClick={aoSair}>
          Sair
        </Botao>
      </header>

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
        <ul className="escolha__lista">
          {identidade.units.map((unidade) => (
            <li key={unidade.id}>
              <button
                type="button"
                className="escolha__opcao"
                onClick={() => aoEscolher(unidade.id)}
              >
                <Icone nome="loja" tamanho={22} />
                <span className="escolha__nome">{unidade.name}</span>
                <Icone nome="seta-direita" tamanho={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
