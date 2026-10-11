/**
 * Como ficam os pagamentos do mês na época das férias.
 *
 * Engenharia reversa de contracheques reais de 2026, que são documentos
 * pessoais e ficam fora do repositório público. Três regras:
 *
 * 1. O adiantamento do dia 15 é 40% do salário dos dias NÃO gozados do mês
 *    civil — inteiro, mesmo que as férias comecem depois do dia 15. A folha
 *    fecha no dia 10 e já sabe das férias do mês todo.
 *
 * 2. O recibo de férias não mexe no fechamento do mês em que é pago. Ele só
 *    entra no mês onde os DIAS caem, rateado quando o período vira o mês.
 *
 * 3. O fechamento recalcula o mês inteiro e abate o que já foi pago. O bloco
 *    de férias entra como provento e sai como "Desconto Adto Férias" — ele se
 *    anula, e do mês sobra só o salário dos dias trabalhados menos impostos e
 *    menos o adiantamento.
 *
 * O objetivo é ordem de grandeza para planejamento, não a folha ao centavo:
 * coparticipação do plano de saúde e vale alimentação não entram (variam com
 * o uso e ninguém consegue prever).
 */

import { calcINSS, calcIRRF } from './ferias';
import { PARAMETROS_EMBUTIDOS, type Parametros } from './parametros';
import { type DataISO } from '../lib/datas';

/** Fração do salário paga como adiantamento no dia 15. */
export const PERCENTUAL_ADIANTAMENTO = 0.4;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export interface MesComFerias {
  ano: number;
  /** 1 a 12. */
  mes: number;
  /** Dias de férias que caem neste mês civil. */
  diasFerias: number;
}

/** "2026-08-13" -> { ano: 2026, mes: 8, dia: 13 } */
function partes(iso: DataISO) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { ano: ano!, mes: mes!, dia: dia! };
}

export function nomeDoMes(ano: number, mes: number, anoReferencia?: number): string {
  const nome = MESES[mes - 1]!;
  return anoReferencia !== undefined && ano !== anoReferencia ? `${nome} de ${ano}` : nome;
}

/** Mês anterior, com virada de ano. */
export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/** Mês seguinte, com virada de ano. */
export function mesSeguinte(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

function diasNoMesCivil(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Divide os dias de férias entre os meses civis que o período atravessa.
 *
 * Mês CIVIL, e não a janela 11→10 do fechamento: é o que os contracheques
 * mostram. Férias de 23/05 a 01/06 aparecem como 9 dias em maio e 1 em junho;
 * pela janela 11/05–10/06 os 10 dias cairiam todos em maio.
 */
export function diasFeriasPorMes(inicio: DataISO, dias: number): MesComFerias[] {
  const fora: MesComFerias[] = [];
  let { ano, mes, dia } = partes(inicio);
  let restantes = dias;

  while (restantes > 0) {
    const noMes = Math.min(restantes, diasNoMesCivil(ano, mes) - dia + 1);
    fora.push({ ano, mes, diasFerias: noMes });
    restantes -= noMes;
    ({ ano, mes } = mesSeguinte(ano, mes));
    dia = 1;
  }
  return fora;
}

/**
 * Adiantamento do dia 15.
 *
 * A folha conta em horas: 210h = mês cheio, 7h por dia. Os dias de férias do
 * mês saem da conta antes de aplicar os 40%.
 */
export function calcularAdiantamento(
  salario: number,
  diasFeriasNoMes = 0,
  p: Parametros = PARAMETROS_EMBUTIDOS,
): number {
  const horas = Math.max(0, p.constantes.diasMes - diasFeriasNoMes) * 7;
  return ((salario * horas) / p.constantes.horasMes) * PERCENTUAL_ADIANTAMENTO;
}

export interface FechamentoMes {
  /** Salário dos dias trabalhados. */
  salarioDoMes: number;
  /** Proventos de férias que caem neste mês (férias + 1/3), já rateados. */
  feriasDoMes: number;
  inssFerias: number;
  inssSalario: number;
  irrfFerias: number;
  irrfSalario: number;
  /** O que o recibo já pagou e a folha abate de volta. */
  descontoAdtoFerias: number;
  adiantamentoDescontado: number;
  liquido: number;
}

export interface EntradaFechamento {
  salario: number;
  diasFeriasNoMes?: number;
  /** Férias + 1/3 do recibo que cabem neste mês. Zero num mês normal. */
  feriasDoMes?: number;
  inssFeriasDoMes?: number;
  irrfFeriasDoMes?: number;
  /** Se omitido, assume os 40% calculados sobre este mesmo mês. */
  adiantamentoPago?: number;
}

/**
 * Fechamento do mês (último dia útil).
 *
 * O bloco de férias se anula por construção: entra como provento e sai como
 * "Desconto Adto Férias". Por isso o líquido é só salário dos dias trabalhados
 * menos impostos menos o adiantamento — mas as linhas ficam expostas porque é
 * assim que o contracheque mostra, e reconhecer as rubricas ajuda a conferir.
 */
export function calcularFechamentoMes(
  e: EntradaFechamento,
  p: Parametros = PARAMETROS_EMBUTIDOS,
): FechamentoMes {
  const diasFerias = e.diasFeriasNoMes ?? 0;
  const feriasDoMes = e.feriasDoMes ?? 0;
  const inssFerias = e.inssFeriasDoMes ?? 0;
  const irrfFerias = e.irrfFeriasDoMes ?? 0;

  const horas = Math.max(0, p.constantes.diasMes - diasFerias) * 7;
  const salarioDoMes = (e.salario * horas) / p.constantes.horasMes;

  // O teto do INSS é do MÊS, não de cada folha: as férias consomem a parte
  // delas e o salário paga só o que falta para fechar o teto.
  const inssDoMes = calcINSS(salarioDoMes + feriasDoMes, p);
  const inssSalario = Math.max(0, inssDoMes - inssFerias);

  // Com o INSS do salário pequeno, o desconto simplificado passa a valer mais
  // que as deduções legais — o critério do IRRF se inverte no mês de férias.
  const irrfSalario = calcIRRF(
    { rendimentosTributaveis: salarioDoMes, inss: inssSalario },
    p,
  ).imposto;

  const descontoAdtoFerias = feriasDoMes - inssFerias - irrfFerias;
  const adiantamentoDescontado =
    e.adiantamentoPago ?? calcularAdiantamento(e.salario, diasFerias, p);

  return {
    salarioDoMes,
    feriasDoMes,
    inssFerias,
    inssSalario,
    irrfFerias,
    irrfSalario,
    descontoAdtoFerias,
    adiantamentoDescontado,
    liquido: salarioDoMes - inssSalario - irrfSalario - adiantamentoDescontado,
  };
}

export type TipoPagamento = 'recibo' | 'adiantamento' | 'fechamento';

export interface PagamentoPrevisto {
  tipo: TipoPagamento;
  /** "Recibo de férias", "Adiantamento (dia 15)", "Salário do mês". */
  rotulo: string;
  /** "final de setembro", "15 de outubro". */
  quando: string;
  valor: number;
  /** Por que este valor é diferente do normal. */
  nota?: string;
  /** Veio do recibo, não de estimativa. */
  exato?: boolean;
}

export interface EntradaCronograma {
  salario: number;
  inicio: DataISO;
  dias: number;
  /** Do período já calculado: férias + 1/3 (sem o 13º, que não é tributado agora). */
  feriasMaisUmTerco: number;
  inssDoRecibo: number;
  irrfDoRecibo: number;
  /** Líquido do recibo, incluindo o adiantamento do 13º se houver. */
  liquidoDoRecibo: number;
}

/**
 * A sequência de pagamentos em volta das férias, em ordem cronológica.
 *
 * Cobre os quatro formatos: férias inteiras dentro de um mês, começando no fim
 * de um mês e terminando no outro, começando no dia 1º, ou terminando no dia 1º.
 */
export function cronogramaDeFerias(
  e: EntradaCronograma,
  p: Parametros = PARAMETROS_EMBUTIDOS,
): PagamentoPrevisto[] {
  const meses = diasFeriasPorMes(e.inicio, e.dias);
  if (meses.length === 0) return [];

  const primeiro = meses[0]!;
  const anoRef = primeiro.ano;
  const anterior = mesAnterior(primeiro.ano, primeiro.mes);
  const pagamentos: PagamentoPrevisto[] = [];

  // 1. O recibo, no fechamento do mês anterior ao da saída.
  pagamentos.push({
    tipo: 'recibo',
    rotulo: 'Recibo de férias',
    quando: `final de ${nomeDoMes(anterior.ano, anterior.mes, anoRef)}`,
    valor: e.liquidoDoRecibo,
    exato: true,
    nota: 'Cai antes de você sair. É este dinheiro que cobre o mês das férias.',
  });

  // 2. O salário do mês anterior é normal: o recibo não mexe no mês em que é pago.
  const mesNormal = calcularFechamentoMes({ salario: e.salario }, p);
  pagamentos.push({
    tipo: 'fechamento',
    rotulo: 'Salário do mês, antes de sair',
    quando: `último dia útil de ${nomeDoMes(anterior.ano, anterior.mes, anoRef)}`,
    valor: mesNormal.liquido,
    nota: 'Mês cheio — o recibo de férias não altera o fechamento do mês em que cai.',
  });

  // 3. Cada mês tocado pelas férias: adiantamento no dia 15 e fechamento no fim.
  for (const m of meses) {
    const proporcao = m.diasFerias / e.dias;
    const fechamento = calcularFechamentoMes(
      {
        salario: e.salario,
        diasFeriasNoMes: m.diasFerias,
        feriasDoMes: e.feriasMaisUmTerco * proporcao,
        inssFeriasDoMes: e.inssDoRecibo * proporcao,
        irrfFeriasDoMes: e.irrfDoRecibo * proporcao,
      },
      p,
    );
    const diasTrabalhados = p.constantes.diasMes - m.diasFerias;
    const nome = nomeDoMes(m.ano, m.mes, anoRef);

    pagamentos.push({
      tipo: 'adiantamento',
      rotulo: 'Adiantamento quinzenal',
      quando: `dia 15 de ${nome}`,
      valor: fechamento.adiantamentoDescontado,
      nota:
        m.diasFerias > 0
          ? `Reduzido: ${m.diasFerias} ${m.diasFerias === 1 ? 'dia' : 'dias'} de férias em ` +
            `${nome} saem da conta, sobram ${diasTrabalhados}.`
          : undefined,
    });

    pagamentos.push({
      tipo: 'fechamento',
      rotulo: 'Salário do mês',
      quando: `último dia útil de ${nome}`,
      valor: fechamento.liquido,
      nota:
        `${diasTrabalhados} ${diasTrabalhados === 1 ? 'dia' : 'dias'} de salário, ` +
        'menos o adiantamento do dia 15. As férias já foram pagas no recibo.',
    });
  }

  // 4. O mês seguinte ao último tocado pelas férias volta ao normal.
  const ultimo = meses[meses.length - 1]!;
  const depois = mesSeguinte(ultimo.ano, ultimo.mes);
  pagamentos.push({
    tipo: 'adiantamento',
    rotulo: 'Adiantamento quinzenal',
    quando: `dia 15 de ${nomeDoMes(depois.ano, depois.mes, anoRef)}`,
    valor: calcularAdiantamento(e.salario, 0, p),
    nota: 'Volta ao normal: mês sem dias de férias.',
  });

  return pagamentos;
}
