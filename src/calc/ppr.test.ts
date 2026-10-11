/**
 * Testes-âncora do PPR. Rode com vitest/jest.
 *
 * Caso 1 — folheto oficial do RH (fonte da fórmula).
 * Caso 2 — salário fictício de 13.500,00 com target 2,3: cai na faixa de
 *          27,5% da tabela de PLR vigente.
 */
import { calcularPPRCom, calcIRRF_PLR, type EntradaPPR } from './ppr';
import { PARAMETROS_EMBUTIDOS as P } from './parametros';

/**
 * "Igual até 2 casas decimais", com a fronteira inclusiva.
 *
 * `toBeCloseTo(b, 2)` exige diferença ESTRITAMENTE menor que 0,005. Valores
 * exatos como 1.234,565 caem em cima da fronteira e o erro binário de
 * ponto flutuante os empurra para 0,0050000000001 — reprovando um número que
 * está certo. A tolerância explícita compara o que o documento compara.
 */
const perto = (a: number, b: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(0.005 + 1e-9);
const calc = (e: Partial<EntradaPPR> = {}) =>
  calcularPPRCom(
    { salarioBase: 2000, target: 1.5, mesesTrabalhados: 12, resultadoEmpresa: 106.5, ...e },
    P,
  );

describe('tabela de PLR (anual exclusiva)', () => {
  it('isento até 8.214,40', () => {
    perto(calcIRRF_PLR(8214.4, P).imposto, 0);
    expect(calcIRRF_PLR(8214.4, P).isento).toBe(true);
  });
  it('faixa de 7,5%', () => perto(calcIRRF_PLR(9000, P).imposto, 58.92));
  it('faixa de 15%', () => perto(calcIRRF_PLR(10000, P).imposto, 139.75));
  it('faixa de 22,5%', () => perto(calcIRRF_PLR(14000, P).imposto, 802.22));
  it('faixa de 27,5%', () => perto(calcIRRF_PLR(20000, P).imposto, 2333.2));
  it('nunca devolve imposto negativo', () => perto(calcIRRF_PLR(0, P).imposto, 0));
  it('NÃO usa a tabela mensal das férias', () => {
    // 5.000 seria tributado na tabela mensal, mas é isento na de PLR
    perto(calcIRRF_PLR(5000, P).imposto, 0);
  });
});

describe('caso-âncora 1 — folheto do RH', () => {
  const r = calc();
  it('etapa salário × target', () => perto(r.etapas.salarioXTarget, 3000));
  it('etapa ÷ 12', () => perto(r.etapas.divididoPor12, 250));
  it('etapa × 12 meses', () => perto(r.etapas.xMesesTrabalhados, 3000));
  it('etapa × resultado 106,5%', () => perto(r.etapas.xResultadoEmpresa, 3195));
  it('etapa − sanção 0%', () => perto(r.etapas.menosSancao, 3195));
  it('bruto', () => perto(r.bruto, 3195));
  it('sem INSS', () => perto(r.inss, 0));
  it('isento de IR', () => perto(r.irrf, 0));
  it('líquido igual ao bruto', () => perto(r.liquido, 3195));
});

describe('caso-âncora 2 — salário alto (target 2,3)', () => {
  const r = calc({ salarioBase: 13500, target: 2.3 });
  it('bruto', () => perto(r.bruto, 33068.25)); // 13.500 × 2,3 × 106,5%
  it('IR pela tabela vigente', () => perto(r.irrf, 5926.97));
  it('líquido', () => perto(r.liquido, 27141.28));
  it('a planilha dava 7.295,58 de IR por usar a tabela de jan-abr/2025', () => {
    expect(r.irrf).not.toBeCloseTo(7295.58, 2);
  });
});

describe('proporcionalidade e sanção', () => {
  it('6 meses = metade', () => perto(calc({ mesesTrabalhados: 6 }).bruto, 1597.5));
  it('1 mês = um doze avos', () => perto(calc({ mesesTrabalhados: 1 }).bruto, 266.25));
  it('sanção de 10%', () => perto(calc({ reducaoSancao: 10 }).bruto, 2875.5));
  it('sanção de 100% zera', () => perto(calc({ reducaoSancao: 100 }).bruto, 0));
  it('resultado 0% zera', () => perto(calc({ resultadoEmpresa: 0 }).bruto, 0));
  it('avisa quando proporcional', () => {
    expect(
      calc({ mesesTrabalhados: 7 }).avisos.some((a) => a.includes('7 de 12')),
    ).toBe(true);
  });
});

describe('invariantes', () => {
  it('líquido = bruto − INSS − IR', () => {
    for (const meses of [1, 6, 12]) {
      for (const salario of [2000, 8000, 13500]) {
        const r = calc({ salarioBase: salario, mesesTrabalhados: meses });
        perto(r.liquido, r.bruto - r.inss - r.irrf);
      }
    }
  });
  it('INSS é sempre zero', () => {
    for (const salario of [1000, 20000, 90000]) {
      perto(calc({ salarioBase: salario }).inss, 0);
    }
  });
  it('sempre traz o aviso de tributação exclusiva', () => {
    expect(calc().avisos.some((a) => a.includes('exclusivamente na fonte'))).toBe(true);
  });
});

describe('validação', () => {
  it('rejeita salário zero', () =>
    expect(() => calc({ salarioBase: 0 })).toThrow());
  it('rejeita target zero', () => expect(() => calc({ target: 0 })).toThrow());
  it('rejeita 0 meses', () => expect(() => calc({ mesesTrabalhados: 0 })).toThrow());
  it('rejeita 13 meses', () => expect(() => calc({ mesesTrabalhados: 13 })).toThrow());
  it('rejeita meses fracionários', () =>
    expect(() => calc({ mesesTrabalhados: 6.5 })).toThrow());
  it('rejeita sanção acima de 100', () =>
    expect(() => calc({ reducaoSancao: 101 })).toThrow());
});
