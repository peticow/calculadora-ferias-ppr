/**
 * Máscara monetária brasileira.
 *
 * O estado do campo é a string de DÍGITOS que o usuário digitou, interpretada
 * como centavos. Digitar 1050050 vira "10.500,50" na tela e 10500.5 no cálculo.
 * Nada aqui arredonda o cálculo: a conversão centavos -> reais é exata para os
 * valores que um campo de formulário aceita.
 */

const fmtDecimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Mantém só os dígitos e limita o tamanho (evita overflow visual e numérico). */
export function somenteDigitos(texto: string, max = 12): string {
  return texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, max);
}

/** "1050050" -> "10.500,50". String vazia continua vazia. */
export function digitosParaTexto(digitos: string): string {
  if (!digitos) return '';
  return fmtDecimal.format(Number(digitos) / 100);
}

/** "1050050" -> 10500.5. String vazia -> undefined. */
export function digitosParaNumero(digitos: string): number | undefined {
  if (!digitos) return undefined;
  return Number(digitos) / 100;
}

/** 10500.5 -> "1050050". Usado para pré-preencher um campo com um valor pronto. */
export function numeroParaDigitos(valor: number | undefined): string {
  if (valor === undefined || !Number.isFinite(valor)) return '';
  return String(Math.round(valor * 100));
}

/**
 * Máscara decimal genérica (não monetária): inteiros + N casas.
 * Usada no target do PPR (0,0) e no resultado da empresa (000,0).
 */
export function mascaraDecimal(
  texto: string,
  opts: { inteiros: number; decimais: number },
): string {
  const limpo = texto.replace(/[^\d,.]/g, '').replace(/\./g, ',');
  const [ini, ...resto] = limpo.split(',');
  const inteiros = ini.slice(0, opts.inteiros);
  if (resto.length === 0) return inteiros;
  return `${inteiros},${resto.join('').slice(0, opts.decimais)}`;
}

/** "106,5" -> 106.5. Vazio ou inválido -> undefined. */
export function textoParaNumero(texto: string): number | undefined {
  if (!texto.trim()) return undefined;
  const n = Number(texto.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
