import { MODALIDADES, type Modalidade } from '../calc/ferias';

export interface OpcaoModalidade {
  valor: Modalidade;
  texto: string;
}

/**
 * Lista FECHADA por política interna da empresa (§1 do documento).
 * Sem venda o funcionário goza 30 dias; vendendo 10, goza 20.
 * Não gere outras combinações — `MODALIDADES` é a fonte, e o teste
 * `opcoes.test.ts` trava as duas listas contra ela.
 */
export const MODALIDADES_SEM_VENDA: OpcaoModalidade[] = [
  { valor: '30', texto: '30 dias' },
  { valor: '20/10', texto: '20 dias + 10 dias' },
  { valor: '10/20', texto: '10 dias + 20 dias' },
  { valor: '15/15', texto: '15 dias + 15 dias' },
];

export const MODALIDADES_COM_VENDA: OpcaoModalidade[] = [
  { valor: '20', texto: '20 dias' },
  { valor: '15/5', texto: '15 dias + 05 dias' },
];

export function opcoesDeModalidade(vendeu10Dias: boolean): OpcaoModalidade[] {
  return vendeu10Dias ? MODALIDADES_COM_VENDA : MODALIDADES_SEM_VENDA;
}

/** true quando a modalidade pertence à lista da opção de venda escolhida. */
export function modalidadeCompativel(m: string, vendeu10Dias: boolean): m is Modalidade {
  return opcoesDeModalidade(vendeu10Dias).some((o) => o.valor === m);
}

export const TODAS_MODALIDADES = Object.keys(MODALIDADES) as Modalidade[];

export const MESES = Array.from({ length: 12 }, (_, i) => ({
  valor: String(i + 1),
  texto: i + 1 === 1 ? '1 mês' : `${i + 1} meses`,
}));

export const DEPENDENTES = Array.from({ length: 10 }, (_, i) => ({
  valor: String(i + 1),
  texto: i + 1 === 1 ? '1 dependente' : `${i + 1} dependentes`,
}));
