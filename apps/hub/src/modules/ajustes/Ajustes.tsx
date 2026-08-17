import { Botao, PainelDeSecao, Selo } from '@matsuya/ui'
import type { TomDoSelo } from '@matsuya/ui'
import { config } from '../../app/config'
import type { EstadoDoSom } from '../../som/alertas'
import type { SaudeDoAgente } from '../../impressao/saudeDoAgente'
import { Dispositivos } from './Dispositivos'
import type { DispositivoDeImpressao, DispositivoRegistrado } from '@matsuya/api-client'

/**
 * O que o selo do agente diz, e por que ele deixou de olhar só a configuração.
 *
 * A versão anterior lia `Boolean(urlDoAgente)` e mostrava "Ativo" só porque
 * havia uma URL escrita no `config.json` — com o agente desligado, com o PC do
 * balcão reiniciando ou com o serviço morto, a tela continuava verde. Um
 * indicador que não pode ficar vermelho não é indicador; é decoração que ensina
 * a confiar no que ninguém verificou.
 */
const SELO_DO_AGENTE: Record<SaudeDoAgente['estado'], { tom: TomDoSelo; texto: string }> = {
  verificando: { tom: 'neutro', texto: 'Verificando' },
  ativo: { tom: 'sucesso', texto: 'Ativo' },
  ausente: { tom: 'perigo', texto: 'Sem resposta' },
  nao_configurado: { tom: 'atencao', texto: 'Não configurado' },
}

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
  saudeDoAgente,
  unityId,
  apiDeImpressao,
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
  saudeDoAgente: SaudeDoAgente
  unityId: number
  apiDeImpressao: {
    dispositivos: (unityId: number, signal?: AbortSignal) => Promise<DispositivoDeImpressao[]>
    registrar: (unityId: number, nome: string) => Promise<DispositivoRegistrado>
    revogar: (unityId: number, deviceId: string) => Promise<{ revogado: boolean }>
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
          <div className="ajustes__acoes">
            <Selo tom={SELO_DO_AGENTE[saudeDoAgente.estado].tom}>
              {SELO_DO_AGENTE[saudeDoAgente.estado].texto}
            </Selo>
            {saudeDoAgente.estado !== 'nao_configurado' && (
              <Botao enfase="secundaria" onClick={saudeDoAgente.verificar}>
                Verificar
              </Botao>
            )}
          </div>
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

      <Dispositivos api={apiDeImpressao} unityId={unityId} />

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
