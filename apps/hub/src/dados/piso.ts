/**
 * Tempo mínimo com uma tela em estado de carregamento.
 *
 * O piso vale para o **indicador**, não para a busca: os dados são escritos no
 * estado assim que a resposta chega, e ficam prontos esperando a bandeira cair.
 * Sem ele, numa rede boa a resposta volta em 40 ms e o esqueleto vira um tremor
 * na tela — quem apertou "atualizar" não vê nada acontecer e aperta de novo.
 *
 * Três segundos é escolha de produto, pedida para o carregamento ter presença.
 * Vale saber o que ela custa: é tempo em que a tela mostra blocos cinzas embora
 * os dados já estejam em memória, e recarregar durante um pico atrasa em três
 * segundos a leitura de uma fila que mudou. Se um dia isso incomodar no balcão,
 * é este número que se mexe.
 *
 * Mora aqui, e não dentro do `useQuadro`, porque a home usa **o mesmo** piso.
 * Dois números iguais em arquivos diferentes é como duas telas começam a
 * carregar em ritmos diferentes depois que alguém ajusta um deles.
 */
export const PISO_DE_CARREGAMENTO_MS = 3000

export const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * O piso de uma **atualização**, que é uma espera de outra natureza.
 *
 * Recarregar uma tela que já está pintada não precisa de presença: o dado
 * continua à vista o tempo todo. Mas precisa de um instante — sem ele, uma
 * resposta de 5 ms faz o indicador nascer e morrer no mesmo quadro, e quem
 * clicou conclui que o botão não funciona. Foi exatamente o que aconteceu na
 * home: a requisição saía, voltava 200 em 5 ms, e a tela não piscava.
 *
 * Meio segundo é o bastante para o olho registrar a mudança de estado e curto
 * o bastante para não parecer lentidão.
 */
export const PISO_DE_ATUALIZACAO_MS = 500

/**
 * Segura o resultado até o piso completar.
 *
 * `comecou` é o instante em que a busca saiu. Se ela já demorou mais que o
 * piso, não espera nada — o piso é chão, não teto.
 */
export async function aguardarPiso(
  comecou: number,
  piso: number = PISO_DE_CARREGAMENTO_MS
): Promise<void> {
  const restante = piso - (Date.now() - comecou)
  if (restante > 0) await espera(restante)
}
