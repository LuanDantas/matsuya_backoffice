/**
 * Separa o nome de uma unidade no que identifica e no que se repete.
 *
 * As nove lojas do cadastro se chamam `MATSUYA <bairro>`. Numa lista, isso são
 * nove linhas começando pela mesma palavra: para achar Perdizes o olho precisa
 * percorrer o nome inteiro, toda vez, em todas as linhas. O que distingue uma
 * loja da outra é o bairro, e ele está no fim.
 *
 * Então o bairro vira o texto principal e a marca vira apoio. Nada é
 * escondido — "Matsuya" continua na tela, em corpo menor, onde não disputa a
 * varredura.
 *
 * ## O que esta função NÃO faz
 *
 * **Não devolve acento que o cadastro não tem.** `MATSUYA SAUDE` sai como
 * `Saude`, não `Saúde`; `ACLIMACAO` sai como `Aclimacao`. Normalizar caixa é
 * apresentação — a informação continua a mesma escrita de outro jeito. Inserir
 * acento seria inventar dado, e a hora de arrumar isso é no cadastro da
 * unidade, não na tela que a lê.
 */

/** O prefixo da marca, e os separadores que costumam sobrar quando ele sai. */
const PREFIXO = /^matsuya\b/i
const SEPARADOR_SOLTO = /^[\s\-–—·.:]+/

/** Palavras que ficam em minúscula no meio de um nome próprio em pt-BR. */
const ATONAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/**
 * Caixa de título — aplicada **só** quando o nome está todo em maiúsculas.
 *
 * `MATSUYA VILA MARIANA` grita, e uma lista inteira em caixa alta se lê mais
 * devagar. Mas `Matsuya Santana` já foi escrito por alguém com cuidado, e
 * reprocessar isso só criaria uma chance de estragar. Quem já está certo passa
 * intocado.
 */
function caixaDeTitulo(texto: string): string {
  return texto
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((palavra, indice) => {
      if (indice > 0 && ATONAS.has(palavra)) return palavra
      return palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1)
    })
    .join(' ')
}

const TODA_MAIUSCULA = (texto: string) =>
  texto === texto.toLocaleUpperCase('pt-BR') && /\p{L}/u.test(texto)

export interface NomeDaLoja {
  /** O que identifica a loja — normalmente o bairro. */
  principal: string
  /** A marca, quando ela foi separada. `null` quando o nome não a tinha. */
  apoio: string | null
}

export function nomeDaLoja(nome: string): NomeDaLoja {
  const inteiro = nome.trim().replace(/\s+/g, ' ')

  if (inteiro === '') return { principal: 'Loja sem nome', apoio: null }

  const marca = inteiro.match(PREFIXO)?.[0]
  if (!marca) {
    return {
      principal: TODA_MAIUSCULA(inteiro) ? caixaDeTitulo(inteiro) : inteiro,
      apoio: null,
    }
  }

  const resto = inteiro.slice(marca.length).replace(SEPARADOR_SOLTO, '').trim()

  // Uma unidade chamada só "Matsuya" existe no cadastro como qualquer outra.
  // Sem o resto, separar deixaria o cartão com o nome vazio e a marca embaixo.
  if (resto === '') return { principal: caixaDeTitulo(marca), apoio: null }

  return {
    principal: TODA_MAIUSCULA(resto) ? caixaDeTitulo(resto) : resto,
    apoio: caixaDeTitulo(marca),
  }
}

/**
 * A cor do disco de uma loja, derivada do próprio nome.
 *
 * `unity` não tem campo de imagem, então a alternativa a uma cor calculada
 * seria nove discos cinza iguais. Derivada do nome, ela é estável: a mesma
 * loja tem o mesmo tom aqui e no seletor da barra, e quem opera todo dia
 * aprende a achar a sua pela cor antes de ler.
 *
 * **A cor não identifica sozinha** — nunca é o único sinal. O nome está sempre
 * ao lado, em corpo grande, e dentro do disco vai um ícone e não uma letra:
 * as nove lojas se chamam `MATSUYA <bairro>`, então a inicial seria "M" nove
 * vezes. Isso também baixa a exigência de contraste do conteúdo do disco de
 * 4,5:1 (texto) para 3:1 (elemento gráfico), que estes tons sustentam em
 * qualquer matiz — a versão com letra não sustenta.
 */
export function corDaLoja(nome: string): string {
  let soma = 0
  for (let i = 0; i < nome.length; i += 1) soma = (soma + nome.charCodeAt(i)) % 360
  return `hsl(${soma} 45% 38%)`
}
