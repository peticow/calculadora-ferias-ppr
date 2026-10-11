/**
 * ppr.ts — Cálculo do PPR (Programa de Participação nos Resultados)
 *
 * Módulo separado das férias de propósito: a PPR tem fórmula própria, NÃO
 * sofre INSS e é tributada pela tabela ANUAL exclusiva de PLR
 * (Lei 10.101/2000), que não tem desconto simplificado, nem dedução por
 * dependente, nem a redução da Lei 15.270/2025.
 *
 * Fórmula validada contra o folheto oficial do RH:
 *   salário 2.000,00 × target 1,5 ÷ 12 × 12 meses × 106,5% − 0% de sanção
 *   = 3.195,00 bruto → isento de IR → 3.195,00 líquido
 */

import { PARAMETROS_EMBUTIDOS, carregarParametros, type Parametros } from './parametros';

// ─────────────────────────────── Tipos ───────────────────────────────

export interface EntradaPPR {
  /** Salário base bruto mensal. */
  salarioBase: number;
  /** Target multiplicador de salário (ex.: 1,5 / 2,3). */
  target: number;
  /** Meses trabalhados no ano anterior, 1 a 12. */
  mesesTrabalhados: number;
  /** Resultado da empresa, em percentual (ex.: 106,5). Divulgado pelo RH. */
  resultadoEmpresa: number;
  /**
   * Redução por sanção disciplinar ou faltas injustificadas, em percentual.
   * Default 0. Consta do folheto do RH como última etapa do cálculo.
   */
  reducaoSancao?: number;
}

export interface ResultadoPPR {
  entrada: Required<EntradaPPR>;
  /** Etapas intermediárias, na ordem exata do folheto do RH. */
  etapas: {
    salarioXTarget: number;
    divididoPor12: number;
    xMesesTrabalhados: number;
    xResultadoEmpresa: number;
    menosSancao: number;
  };
  bruto: number;
  /** Sempre 0: não incide INSS sobre PLR (Lei 10.101/2000, art. 3º). */
  inss: number;
  irrf: number;
  irrfDetalhe: { aliquota: number; deducao: number; isento: boolean };
  liquido: number;
  avisos: string[];
}

// ──────────────────────────── Tributação ────────────────────────────

/**
 * IRRF sobre PLR — tabela ANUAL exclusiva na fonte.
 * NÃO use a tabela mensal das férias aqui, e vice-versa.
 */
export function calcIRRF_PLR(
  bruto: number,
  p: Parametros = PARAMETROS_EMBUTIDOS,
): { imposto: number; aliquota: number; deducao: number; isento: boolean } {
  const b = Math.max(0, bruto);
  const faixa =
    p.plr.faixas.find((f) => f.ate === null || b <= f.ate) ??
    p.plr.faixas[p.plr.faixas.length - 1];
  const imposto = Math.max(0, b * faixa.aliquota - faixa.deducao);
  return {
    imposto,
    aliquota: faixa.aliquota,
    deducao: faixa.deducao,
    isento: faixa.aliquota === 0,
  };
}

// ─────────────────────────── Cálculo principal ───────────────────────────

/** Cálculo síncrono, com parâmetros já em mãos. */
export function calcularPPRCom(entrada: EntradaPPR, p: Parametros): ResultadoPPR {
  const e: Required<EntradaPPR> = {
    salarioBase: entrada.salarioBase,
    target: entrada.target,
    mesesTrabalhados: entrada.mesesTrabalhados,
    resultadoEmpresa: entrada.resultadoEmpresa,
    reducaoSancao: entrada.reducaoSancao ?? 0,
  };

  if (!(e.salarioBase > 0)) throw new Error('salarioBase deve ser maior que zero');
  if (!(e.target > 0)) throw new Error('target deve ser maior que zero');
  if (!Number.isInteger(e.mesesTrabalhados) || e.mesesTrabalhados < 1 || e.mesesTrabalhados > 12) {
    throw new Error('mesesTrabalhados deve ser um inteiro de 1 a 12');
  }
  if (e.resultadoEmpresa < 0) throw new Error('resultadoEmpresa não pode ser negativo');
  if (e.reducaoSancao < 0 || e.reducaoSancao > 100) {
    throw new Error('reducaoSancao deve estar entre 0 e 100');
  }

  // Etapas na ordem do folheto do RH. Não reordene: mantém a auditoria simples.
  const salarioXTarget = e.salarioBase * e.target;
  const divididoPor12 = salarioXTarget / 12;
  const xMesesTrabalhados = divididoPor12 * e.mesesTrabalhados;
  const xResultadoEmpresa = xMesesTrabalhados * (e.resultadoEmpresa / 100);
  const menosSancao = xResultadoEmpresa * (1 - e.reducaoSancao / 100);

  const bruto = menosSancao;
  const ir = calcIRRF_PLR(bruto, p);

  const avisos: string[] = [];
  avisos.push(
    'A PPR é tributada exclusivamente na fonte, por tabela anual própria. ' +
      'Não incide INSS e o valor não se soma ao salário na declaração anual.',
  );
  if (e.mesesTrabalhados < 12) {
    avisos.push(
      `Cálculo proporcional a ${e.mesesTrabalhados} de 12 meses trabalhados.`,
    );
  }
  avisos.push(
    'Valor aproximado. O resultado da empresa é divulgado pelo RH poucos dias ' +
      'antes do pagamento — confirme o percentual antes de se planejar.',
  );

  return {
    entrada: e,
    etapas: { salarioXTarget, divididoPor12, xMesesTrabalhados, xResultadoEmpresa, menosSancao },
    bruto,
    inss: 0,
    irrf: ir.imposto,
    irrfDetalhe: { aliquota: ir.aliquota, deducao: ir.deducao, isento: ir.isento },
    liquido: bruto - ir.imposto,
    avisos,
  };
}

/** Ponto de entrada do app: busca as tabelas vigentes e calcula. */
export async function calcularPPR(entrada: EntradaPPR): Promise<ResultadoPPR> {
  const { parametros, status } = await carregarParametros();
  const r = calcularPPRCom(entrada, parametros);
  if (status.aviso) r.avisos.unshift(status.aviso);
  return r;
}
