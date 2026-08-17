/**
 * Codificação CP850, porque impressora térmica não fala UTF-8.
 *
 * Uma comanda que sai com "Sanduiche de peru com aa" em vez de "Sanduíche de
 * peru com açaí" não é um defeito estético: é a cozinha lendo outra coisa. E o
 * caso mais caro é o silencioso — `ç` virando `c` passa despercebido, `ã`
 * virando lixo binário faz a impressora cortar a linha no meio.
 *
 * O Node não traz codificador CP850 (`Buffer.from(s, 'latin1')` é ISO-8859-1,
 * que **não** é a mesma tabela — `ã` é 0xE3 em latin1 e 0xC6 em CP850). Daí a
 * tabela à mão. Ela cobre o português; o que não estiver nela cai numa
 * transliteração sem acento, que é feio mas legível — bem melhor que um byte
 * aleatório no meio do nome de um prato.
 */

/** Unicode → byte CP850. Só o que aparece em português. */
const TABELA: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85,
  'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8a, 'ï': 0x8b, 'î': 0x8c,
  'ì': 0x8d, 'Ä': 0x8e, 'É': 0x90, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95,
  'û': 0x96, 'ù': 0x97, 'Ö': 0x99, 'Ü': 0x9a, '£': 0x9c,
  'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5,
  'ª': 0xa6, 'º': 0xa7, '¿': 0xa8,
  'Á': 0xb5, 'Â': 0xb6, 'À': 0xb7,
  'ã': 0xc6, 'Ã': 0xc7,
  'Ê': 0xd2, 'Ë': 0xd3, 'È': 0xd4, 'Í': 0xd6, 'Î': 0xd7, 'Ï': 0xd8,
  'Ó': 0xe0, 'ß': 0xe1, 'Ô': 0xe2, 'Ò': 0xe3, 'õ': 0xe4, 'Õ': 0xe5,
  'Ú': 0xe9, 'Û': 0xea, 'Ù': 0xeb,
  '°': 0xf8,
}

/** Último recurso: tira o acento em vez de mandar byte que a impressora não sabe. */
function semAcento(caractere: string): string {
  return caractere.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function paraCp850(texto: string): Buffer {
  const bytes: number[] = []

  for (const caractere of texto) {
    const mapeado = TABELA[caractere]

    if (mapeado !== undefined) {
      bytes.push(mapeado)
      continue
    }

    const codigo = caractere.codePointAt(0) ?? 0x3f

    // ASCII puro passa direto.
    if (codigo < 0x80) {
      bytes.push(codigo)
      continue
    }

    // Fora da tabela: tenta sem acento, e o que sobrar vira '?'. Um '?' visível
    // é diagnóstico; um byte inválido é a impressora travando no meio da
    // comanda.
    const simples = semAcento(caractere)
    for (const c of simples) {
      const cod = c.codePointAt(0) ?? 0x3f
      bytes.push(cod < 0x80 ? cod : 0x3f)
    }

    if (simples.length === 0) bytes.push(0x3f)
  }

  return Buffer.from(bytes)
}
