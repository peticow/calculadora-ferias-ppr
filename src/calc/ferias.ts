/**
 * ferias.ts — Motor de cálculo de férias (regra única, tabelas vigentes)
 *
 * Regras em REGRAS_CALCULO_FERIAS.md. Tabelas em parametros.json.
 * Sem dependências além de parametros.ts. Roda em browser e Node.
 * Não arredonda etapas — formate só na exibição.
 */

import {
  carregarParametros,
  conferirVigencia,
  PARAMETROS_EMBUTIDOS,
  type Parametros,
} from './parametros';

// ─────────────────────────────── Tipos ───────────────────────────────

/** Modalidades sem abono: os 30 dias são gozados. */
export type ModalidadeSemAbono = '30' | '20/10' | '10/20' | '15/15';
/** Modalidades com abono: 10 dias vendidos + 20 dias gozados. */
export type ModalidadeComAbono = '20' | '15/5';
export type Modalidade = ModalidadeSemAbono | ModalidadeComAbono;

export const MODALIDADES: Record<Modalidade, { dias: number[]; abono: boolean }> = {
  '30': { dias: [30], abono: false },
  '20/10': { dias: [20, 10], abono: false },
  '10/20': { dias: [10, 20], abono: false },
  '15/15': { dias: [15, 15], abono: false },
  '20': { dias: [20], abono: true },
  '15/5': { dias: [15, 5], abono: true },
};

export interface Entrada {
  /** Salário base bruto mensal. */
  salarioBase: number;
  modalidade: Modalidade;
  /** Adiantamento de 50% do 13º junto das férias (art. 2º, Lei 4.749/65). */
  adiantamento13: boolean;
  /** Nº de dependentes para o IRRF. Default 0. */
  dependentes?: number;
  /**
   * Critério de dedução do IRRF.
   * 'auto' (default) = usa o mais vantajoso, como faz a folha.
   */
  criterioIRRF?: 'auto' | 'legais' | 'simplificado';
  /** Outras deduções legais mensais: previdência privada, pensão alimentícia. */
  outrasDeducoes?: number;
}

export interface DetalheIRRF {
  /** Rendimentos tributáveis brutos do pagamento (férias + 1/3). */
  rendimentosTributaveis: number;
  deducoesLegais: number;
  descontoSimplificado: number;
  criterioAplicado: 'legais' | 'simplificado';
  deducaoAplicada: number;
  base: number;
  aliquota: number;
  parcelaDeduzir: number;
  impostoTabela: number;
  /** Redução da Lei 15.270/2025. */
  reducao: number;
  imposto: number;
}

export interface Periodo {
  ordem: number;
  dias: number;
  horas: number;
  /** Remuneração dos dias de férias gozados. */
  ferias: number;
  /** 1/3 constitucional proporcional aos dias gozados. */
  umTerco: number;
  /** Abono pecuniário + 1/3 sobre ele. Isento de INSS e IRRF. */
  abono: number;
  adiantamento13: number;
  receitasBrutas: number;
  baseINSS: number;
  inss: number;
  irrf: number;
  irrfDetalhe: DetalheIRRF;
  descontos: number;
  liquido: number;
  rateio: { parte13: number; guardar: number; gastar: number };
}

export interface Resultado {
  entrada: Required<Omit<Entrada, 'modalidade'>> & { modalidade: Modalidade };
  diasGozados: number;
  diasVendidos: number;
  periodos: Periodo[];
  totalBruto: number;
  totalDescontos: number;
  totalLiquido: number;
  /** Mensagens que a UI deve exibir (vigência das tabelas, etc.). */
  avisos: string[];
  meta: { versaoParametros: string; vigencia: { inicio: string; fim: string } };
}

// ──────────────────────────── Tributos ────────────────────────────

/**
 * INSS progressivo por faixa: cada fatia do salário de contribuição é
 * tributada pela sua própria alíquota. Limitado ao teto.
 * Este é o método exato — a "parcela a deduzir" das tabelas de folha é só
 * um atalho aritmético para o mesmo resultado.
 *
 * Cada fatia é TRUNCADA em 2 casas antes de somar, e não arredondada no fim.
 * Não é preciosismo: é o que a folha de pagamento faz, conferido em cinco documentos
 * reais (ver docs/REGRAS_CALCULO_FERIAS.md §6.2). No teto a diferença é de
 * 2 centavos — 988,07 em vez de 988,09 — e aparece em todo cálculo de férias
 * de salário alto.
 */
export function calcINSS(base: number, p: Parametros = PARAMETROS_EMBUTIDOS): number {
  const limitada = Math.min(Math.max(0, base), p.inss.tetoSalarioContribuicao);
  let total = 0;
  let anterior = 0;
  for (const f of p.inss.faixas) {
    if (limitada <= anterior) break;
    // 1e-9 protege do binário: 174.17000000000002 truncaria para 174.16.
    total += Math.floor((Math.min(limitada, f.ate) - anterior) * f.aliquota * 100 + 1e-9) / 100;
    anterior = f.ate;
  }
  return total;
}

/** Redução mensal do imposto (Lei 15.270/2025), sobre os rendimentos BRUTOS. */
export function calcReducaoIRRF(
  rendimentosTributaveis: number,
  impostoTabela: number,
  p: Parametros = PARAMETROS_EMBUTIDOS,
): number {
  const r = p.irrf.reducao;
  if (rendimentosTributaveis <= r.limiteIsencaoTotal) return impostoTabela; // zera
  if (rendimentosTributaveis >= r.limiteSuperior) return 0;
  const reducao = r.coeficienteA - r.coeficienteB * rendimentosTributaveis;
  return Math.min(impostoTabela, Math.max(0, reducao));
}

export function calcIRRF(
  args: {
    rendimentosTributaveis: number;
    inss: number;
    dependentes?: number;
    outrasDeducoes?: number;
    criterio?: 'auto' | 'legais' | 'simplificado';
  },
  p: Parametros = PARAMETROS_EMBUTIDOS,
): DetalheIRRF {
  const rt = Math.max(0, args.rendimentosTributaveis);
  const dependentes = args.dependentes ?? 0;
  const outras = args.outrasDeducoes ?? 0;
  const criterio = args.criterio ?? 'auto';

  const deducoesLegais = args.inss + dependentes * p.irrf.deducaoPorDependente + outras;
  const simplificado = p.irrf.descontoSimplificado;

  const criterioAplicado: 'legais' | 'simplificado' =
    criterio === 'auto'
      ? simplificado > deducoesLegais
        ? 'simplificado'
        : 'legais'
      : criterio;

  const deducaoAplicada = criterioAplicado === 'simplificado' ? simplificado : deducoesLegais;
  const base = Math.max(0, rt - deducaoAplicada);

  const faixa =
    p.irrf.faixas.find((f) => f.ate === null || base <= f.ate) ??
    p.irrf.faixas[p.irrf.faixas.length - 1];

  const impostoTabela = Math.max(0, base * faixa.aliquota - faixa.deducao);
  const reducao = calcReducaoIRRF(rt, impostoTabela, p);

  return {
    rendimentosTributaveis: rt,
    deducoesLegais,
    descontoSimplificado: simplificado,
    criterioAplicado,
    deducaoAplicada,
    base,
    aliquota: faixa.aliquota,
    parcelaDeduzir: faixa.deducao,
    impostoTabela,
    reducao,
    imposto: Math.max(0, impostoTabela - reducao),
  };
}

// ─────────────────────────── Cálculo principal ───────────────────────────

function calcularPeriodo(
  e: Required<Omit<Entrada, 'modalidade'>>,
  dias: number,
  ordem: number,
  comAdiantamento13: boolean,
  comAbono: boolean,
  p: Parametros,
): Periodo {
  const S = e.salarioBase;
  const { diasMes, horasMes, diasAbonoPecuniario: diasAbono } = p.constantes;

  const ferias = (S * dias) / diasMes;
  const umTerco = ((S / 3) * dias) / diasMes;

  // Abono pecuniário: dias vendidos + 1/3 sobre eles. Isento de INSS e IRRF.
  const abono = comAbono
    ? (S * diasAbono) / diasMes + ((S / 3) * diasAbono) / diasMes
    : 0;

  const adiantamento13 = comAdiantamento13 ? S / 2 : 0;
  const receitasBrutas = ferias + umTerco + abono + adiantamento13;

  // Nem o 13º nem o abono entram nas bases das férias.
  const baseINSS = ferias + umTerco;
  const inss = calcINSS(baseINSS, p);

  const irrfDetalhe = calcIRRF(
    {
      rendimentosTributaveis: baseINSS,
      inss,
      dependentes: e.dependentes,
      outrasDeducoes: e.outrasDeducoes,
      criterio: e.criterioIRRF,
    },
    p,
  );
  const irrf = irrfDetalhe.imposto;

  const descontos = inss + irrf;
  const liquido = receitasBrutas - descontos;
  const resto = liquido - adiantamento13;

  return {
    ordem,
    dias,
    horas: (dias * horasMes) / diasMes,
    ferias,
    umTerco,
    abono,
    adiantamento13,
    receitasBrutas,
    baseINSS,
    inss,
    irrf,
    irrfDetalhe,
    descontos,
    liquido,
    rateio: { parte13: adiantamento13, guardar: (resto / 3) * 2, gastar: resto / 3 },
  };
}

/** Cálculo síncrono, com parâmetros já em mãos. */
export function calcularFeriasCom(
  entrada: Entrada,
  p: Parametros,
  hoje = new Date(),
): Resultado {
  const e: Required<Omit<Entrada, 'modalidade'>> = {
    salarioBase: entrada.salarioBase,
    adiantamento13: entrada.adiantamento13,
    dependentes: entrada.dependentes ?? 0,
    criterioIRRF: entrada.criterioIRRF ?? 'auto',
    outrasDeducoes: entrada.outrasDeducoes ?? 0,
  };

  if (!(e.salarioBase > 0)) throw new Error('salarioBase deve ser maior que zero');
  const mod = MODALIDADES[entrada.modalidade];
  if (!mod) throw new Error(`modalidade inválida: ${entrada.modalidade}`);

  const periodos = mod.dias.map((d, i) =>
    calcularPeriodo(e, d, i + 1, e.adiantamento13 && i === 0, mod.abono && i === 0, p),
  );

  const soma = (f: (x: Periodo) => number) => periodos.reduce((a, x) => a + f(x), 0);

  const avisos: string[] = [];
  const vig = conferirVigencia(p, hoje);
  if (vig.aviso) avisos.push(vig.aviso);
  if (e.salarioBase < p.salarioMinimo) {
    avisos.push(
      `O salário informado é menor que o salário mínimo vigente ` +
        `(${brl(p.salarioMinimo)}). Confira o valor.`,
    );
  }
  avisos.push(
    'Valor aproximado. Não considera horas extras, adicionais, comissões, ' +
      'vale-transporte, plano de saúde, empréstimos consignados nem faltas.',
  );

  return {
    entrada: { ...e, modalidade: entrada.modalidade },
    diasGozados: mod.dias.reduce((a, b) => a + b, 0),
    diasVendidos: mod.abono ? p.constantes.diasAbonoPecuniario : 0,
    periodos,
    totalBruto: soma((x) => x.receitasBrutas),
    totalDescontos: soma((x) => x.descontos),
    totalLiquido: soma((x) => x.liquido),
    avisos,
    meta: { versaoParametros: p.versao, vigencia: p.vigencia },
  };
}

/** Ponto de entrada do app: busca as tabelas vigentes e calcula. */
export async function calcularFerias(entrada: Entrada): Promise<Resultado> {
  const { parametros } = await carregarParametros();
  return calcularFeriasCom(entrada, parametros);
}

/** Todas as modalidades, ordenadas do maior para o menor líquido. */
export async function compararModalidades(
  entrada: Omit<Entrada, 'modalidade'>,
): Promise<Array<{ modalidade: Modalidade; resultado: Resultado; diferenca: number }>> {
  const { parametros } = await carregarParametros();
  const todos = (Object.keys(MODALIDADES) as Modalidade[]).map((modalidade) => ({
    modalidade,
    resultado: calcularFeriasCom({ ...entrada, modalidade }, parametros),
  }));
  const referencia = todos.find((t) => t.modalidade === '30')!.resultado.totalLiquido;
  return todos
    .map((t) => ({ ...t, diferenca: t.resultado.totalLiquido - referencia }))
    .sort((a, b) => b.resultado.totalLiquido - a.resultado.totalLiquido);
}

// ──────────────────────────────── PPR ────────────────────────────────

/**
 * O cálculo do PPR foi movido para `ppr.ts`.
 *
 * A PPR não é férias: tem fórmula própria (target, meses trabalhados e
 * resultado da empresa), NÃO sofre INSS e é tributada pela tabela ANUAL
 * exclusiva de PLR (Lei 10.101/2000) — nada em comum com a tabela mensal
 * usada aqui. Manter os dois no mesmo módulo só cria risco de aplicar a
 * tabela errada.
 *
 * Use: import { calcularPPR } from './ppr';
 */

// ───────────────────────────── Formatação ─────────────────────────────

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: number) => fmt.format(v);
export const pct = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(v);

/** "13.500,25" ou "13500.25" ou "R$ 13.500,25" -> 13500.25 */
export function parseMoeda(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  // Sem nenhum dígito não há número: Number('') devolveria 0 e um texto
  // inválido passaria por valor zero em vez de ser recusado.
  if (!/\d/.test(limpo)) return NaN;
  const usaVirgula = limpo.includes(',') && limpo.lastIndexOf(',') > limpo.lastIndexOf('.');
  const n = Number(
    usaVirgula ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, ''),
  );
  return Number.isFinite(n) ? n : NaN;
}
