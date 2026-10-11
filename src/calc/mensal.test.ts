import {
  calcularAdiantamento,
  calcularFechamentoMes,
  cronogramaDeFerias,
  diasFeriasPorMes,
  mesAnterior,
  mesSeguinte,
} from './mensal';
import { PARAMETROS_EMBUTIDOS as P } from './parametros';

/**
 * Salário e recibo FICTÍCIOS. As regras deste arquivo foram descobertas por
 * engenharia reversa de contracheques reais e conferidas contra eles; esses
 * documentos, e os testes com os valores deles, ficam fora do repositório
 * público. Aqui o recibo é o que o próprio app calcula para o salário fictício
 * (10/20 com 13º, período de 20 dias).
 */
const centavo = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.011);

const S = 13500;

const RECIBO = {
  feriasMaisUmTerco: 9000 + 3000,
  inss: 988.07,
  irrf: 2119.55,
  liquido: 8892.38,
};

describe('dias de férias por mês civil', () => {
  it('período inteiro dentro de um mês', () =>
    expect(diasFeriasPorMes('2026-05-05', 20)).toEqual([{ ano: 2026, mes: 5, diasFerias: 20 }]));

  it('vira o mês: 23/05 a 01/06 = 9 em maio + 1 em junho', () =>
    expect(diasFeriasPorMes('2026-05-23', 10)).toEqual([
      { ano: 2026, mes: 5, diasFerias: 9 },
      { ano: 2026, mes: 6, diasFerias: 1 },
    ]));

  it('vira o mês: 13/08 a 01/09 = 19 em agosto + 1 em setembro', () =>
    expect(diasFeriasPorMes('2026-08-13', 20)).toEqual([
      { ano: 2026, mes: 8, diasFerias: 19 },
      { ano: 2026, mes: 9, diasFerias: 1 },
    ]));

  it('começa no dia 1º', () =>
    expect(diasFeriasPorMes('2026-06-01', 30)).toEqual([{ ano: 2026, mes: 6, diasFerias: 30 }]));

  it('fevereiro de ano bissexto (2028)', () =>
    expect(diasFeriasPorMes('2028-02-25', 10)).toEqual([
      { ano: 2028, mes: 2, diasFerias: 5 },
      { ano: 2028, mes: 3, diasFerias: 5 },
    ]));

  it('27/04 a 06/05 = 4 em abril + 6 em maio', () =>
    expect(diasFeriasPorMes('2026-04-27', 10)).toEqual([
      { ano: 2026, mes: 4, diasFerias: 4 },
      { ano: 2026, mes: 5, diasFerias: 6 },
    ]));

  it('vira o ano: 28/12 a 06/01', () =>
    expect(diasFeriasPorMes('2026-12-28', 10)).toEqual([
      { ano: 2026, mes: 12, diasFerias: 4 },
      { ano: 2027, mes: 1, diasFerias: 6 },
    ]));

  it('a soma sempre fecha com os dias pedidos', () => {
    for (const [inicio, dias] of [
      ['2026-01-15', 30], ['2026-02-20', 20], ['2026-12-30', 15], ['2027-07-01', 10],
    ] as const) {
      const total = diasFeriasPorMes(inicio, dias).reduce((a, m) => a + m.diasFerias, 0);
      expect(total).toBe(dias);
    }
  });

  it('meses anterior e seguinte viram o ano', () => {
    expect(mesAnterior(2026, 1)).toEqual({ ano: 2025, mes: 12 });
    expect(mesSeguinte(2026, 12)).toEqual({ ano: 2027, mes: 1 });
  });
});

describe('adiantamento do dia 15 — 40% do salário dos dias trabalhados', () => {
  it('9 dias de férias no mês → 40% × 13.500 × 21/30 = 3.780,00', () =>
    centavo(calcularAdiantamento(S, 9, P), 3780));

  it('1 dia de férias → 5.220,00', () => centavo(calcularAdiantamento(S, 1, P), 5220));

  it('mês sem férias → 40% cheios', () => centavo(calcularAdiantamento(S, 0, P), 5400));

  it('mês inteiro de férias → zero', () => centavo(calcularAdiantamento(S, 30, P), 0));
});

describe('fechamento do mês', () => {
  it('o teto do INSS é do mês: férias + salário nunca passam dele', () => {
    const p = 19 / 20;
    const f = calcularFechamentoMes(
      {
        salario: S,
        diasFeriasNoMes: 19,
        feriasDoMes: RECIBO.feriasMaisUmTerco * p,
        inssFeriasDoMes: RECIBO.inss * p,
        irrfFeriasDoMes: RECIBO.irrf * p,
      },
      P,
    );
    centavo(f.inssFerias + f.inssSalario, 988.07);
  });
});

describe('cronograma — férias de 13/08 a 01/09/2026', () => {
  const c = cronogramaDeFerias(
    {
      salario: S,
      inicio: '2026-08-13',
      dias: 20,
      feriasMaisUmTerco: RECIBO.feriasMaisUmTerco,
      inssDoRecibo: RECIBO.inss,
      irrfDoRecibo: RECIBO.irrf,
      liquidoDoRecibo: RECIBO.liquido,
    },
    P,
  );
  const achar = (quando: string, tipo: string) =>
    c.find((x) => x.quando === quando && x.tipo === tipo)!;

  it('cobre julho, agosto, setembro e o retorno em outubro', () =>
    expect(c.map((x) => `${x.tipo} ${x.quando}`)).toEqual([
      'recibo final de julho',
      'fechamento último dia útil de julho',
      'adiantamento dia 15 de agosto',
      'fechamento último dia útil de agosto',
      'adiantamento dia 15 de setembro',
      'fechamento último dia útil de setembro',
      'adiantamento dia 15 de outubro',
    ]));

  it('recibo = líquido do recibo', () =>
    centavo(achar('final de julho', 'recibo').valor, RECIBO.liquido));

  it('julho fecha como mês normal: o recibo não mexe nele', () =>
    centavo(
      achar('último dia útil de julho', 'fechamento').valor,
      calcularFechamentoMes({ salario: S }, P).liquido,
    ));

  it('adiantamento de agosto: 11 dias trabalhados → 1.980,00', () =>
    centavo(achar('dia 15 de agosto', 'adiantamento').valor, 1980));

  it('adiantamento de setembro: 1 dia de férias → 5.220,00', () =>
    centavo(achar('dia 15 de setembro', 'adiantamento').valor, 5220));

  it('outubro volta aos 40% cheios', () =>
    centavo(achar('dia 15 de outubro', 'adiantamento').valor, 5400));
});

describe('cronograma — formatos de período', () => {
  const base = {
    salario: S,
    feriasMaisUmTerco: RECIBO.feriasMaisUmTerco,
    inssDoRecibo: RECIBO.inss,
    irrfDoRecibo: RECIBO.irrf,
    liquidoDoRecibo: RECIBO.liquido,
  };

  it('inteiro dentro do mês: um único mês de férias', () => {
    const c = cronogramaDeFerias({ ...base, inicio: '2026-05-05', dias: 20 }, P);
    expect(c.filter((x) => x.tipo === 'adiantamento').map((x) => x.quando)).toEqual([
      'dia 15 de maio',
      'dia 15 de junho',
    ]);
  });

  it('27/04 a 06/05 reduz os dois adiantamentos', () => {
    const c = cronogramaDeFerias({ ...base, inicio: '2026-04-27', dias: 10 }, P);
    const adtos = c.filter((x) => x.tipo === 'adiantamento');
    centavo(adtos[0]!.valor, calcularAdiantamento(S, 4, P)); // abril
    centavo(adtos[1]!.valor, calcularAdiantamento(S, 6, P)); // maio
    centavo(adtos[2]!.valor, 5400); // junho, normal
  });

  it('vira o ano: recibo no final de dezembro do ano anterior', () => {
    const c = cronogramaDeFerias({ ...base, inicio: '2027-01-04', dias: 15 }, P);
    expect(c[0]!.quando).toBe('final de dezembro de 2026');
  });

  it('mês inteiro de férias zera o adiantamento', () => {
    const c = cronogramaDeFerias({ ...base, inicio: '2026-06-01', dias: 30 }, P);
    centavo(c.find((x) => x.quando === 'dia 15 de junho')!.valor, 0);
  });
});
