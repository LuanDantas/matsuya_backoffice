import { Botao, PainelDeSecao, Selo } from '@matsuya/ui'
import { config } from '../../app/config'
import type { EstadoDoSom } from '../../som/alertas'

/**
 * Ajustes deste dispositivo.
 *
 * Tudo aqui é local ao tablet, e a tela diz isso: som, impressão e conexão são
 * propriedades de onde o Hub está rodando, não da unidade. Um operador que
 * silencia o som numa tablete não pode silenciar a da cozinha ao lado.
 *
 * A configuração que vem de `config.json` aparece **somente para leitura**.
 * Editá-la aqui gravaria no navegador uma coisa que o arquivo sobrescreve na
 * próxima abertura — o pior tipo de campo: o que aceita e esquece.
 */
export function Ajustes({
  som,
  impressao,
  conexao,
  cursores,
  nomesDasUnidades,
}: {
  som: { estado: EstadoDoSom; destravar: () => void; silenciar: () => void; religar: () => void }
  impressao: {
    temAgente: boolean
    automatica: boolean
    pendentes: number
    tentarDeNovo: () => void
  }
  conexao: string
  /** Cursor por loja: cada uma tem o seu, porque `seq` é por unidade. */
  cursores: ReadonlyMap<number, number>
  nomesDasUnidades: ReadonlyMap<number, string>
}) {
  return (
    <main className="ajustes">
      <PainelDeSecao titulo="Som">
        <div className="ajustes__linha">
          <div>
            <strong>Alertas sonoros</strong>
            <p>Tocam quando entra pedido novo e quando um prazo estoura.</p>
          </div>
          {som.estado === 'pronto' ? (
            <Botao enfase="secundaria" onClick={som.silenciar}>
              Desligar
            </Botao>
          ) : (
            <Botao
              enfase="primaria"
              onClick={() => (som.estado === 'mudo' ? som.religar() : som.destravar())}
            >
              Ligar
            </Botao>
          )}
        </div>
        {som.estado === 'bloqueado' && (
          <p className="ajustes__nota">
            O navegador exige um toque antes de tocar qualquer som. Enquanto isso,
            nenhum alerta soa.
          </p>
        )}
      </PainelDeSecao>

      <PainelDeSecao titulo="Impressão">
        <div className="ajustes__linha">
          <div>
            <strong>Agente local</strong>
            <p>
              {impressao.temAgente
                ? 'Configurado. A comanda sai sem diálogo.'
                : 'Não configurado. A comanda abre o diálogo do navegador e alguém precisa confirmar.'}
            </p>
          </div>
          <Selo tom={impressao.temAgente ? 'sucesso' : 'atencao'}>
            {impressao.temAgente ? 'Ativo' : 'Ausente'}
          </Selo>
        </div>

        <div className="ajustes__linha">
          <div>
            <strong>Comanda automática no aceite</strong>
            <p>
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
          <div>
            <strong>Largura da bobina</strong>
            <p>Definida em config.json neste dispositivo.</p>
          </div>
          <Selo>{config.larguraDoPapel ?? 80} mm</Selo>
        </div>

        {impressao.pendentes > 0 && (
          <div className="ajustes__linha">
            <div>
              <strong>Comandas não impressas</strong>
              <p>{impressao.pendentes} na fila.</p>
            </div>
            <Botao enfase="secundaria" onClick={impressao.tentarDeNovo}>
              Tentar de novo
            </Botao>
          </div>
        )}
      </PainelDeSecao>

      <PainelDeSecao titulo="Conexão">
        <div className="ajustes__linha">
          <div>
            <strong>Estado</strong>
            <p>
              Cursor do diário de cada loja. É por ele que o Hub sabe se perdeu
              algum evento — e há um por unidade, porque a sequência é por loja.
            </p>
            <ul className="ajustes__cursores">
              {[...cursores].map(([unityId, cursor]) => (
                <li key={unityId}>
                  {nomesDasUnidades.get(unityId) ?? `Unidade ${unityId}`}
                  <span className="num">#{cursor}</span>
                </li>
              ))}
            </ul>
          </div>
          <Selo>{conexao}</Selo>
        </div>

        <div className="ajustes__linha">
          <div>
            <strong>Servidor</strong>
            <p className="num">{config.apiBaseUrl}</p>
          </div>
        </div>
      </PainelDeSecao>
    </main>
  )
}
