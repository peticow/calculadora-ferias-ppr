/**
 * Testes-âncora. Rode com vitest/jest.
 *
 * Os valores esperados foram conferidos contra as tabelas oficiais vigentes
 * (Portaria Interministerial MPS/MF 13/2026 e Leis 15.191/2025 + 15.270/2025).
 * Ao atualizar `parametros.json` em janeiro, ESTES TESTES DEVEM FALHAR —
 * confira cada número novo à mão antes de mexer nos esperados.
 */
import {
  calcularFeriasCom,
  calcINSS,
  calcIRRF,
  calcReducaoIRRF,
  MODALIDADES,
  parseMoeda,
  type Modalidade,
} from './ferias';
import {
  PARAMETROS_EMBUTIDOS as P,
  conferirVigencia,
  validarParametros,
} from './parametros';

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

/*
 * Salário FICTÍCIO. As regras foram conferidas, centavo a centavo, contra
 * recibos e contracheques reais, que ficam fora do repositório público. Este
 * valor foi escolhido para exercitar os mesmos caminhos: o período de 10 dias
 * cai na faixa de redução da Lei 15.270 (tributáveis de 6.000) e o de 20 dias
 * passa do teto do INSS.
 */
const S = 13500;
const HOJE = new Date('2026-06-15');

const calc = (modalidade: Modalidade, extra = {}) =>
  calcularFeriasCom(
    { salarioBase: S, modalidade, adiantamento13: true, ...extra },
    P,
    HOJE,
  );

describe('parametros.json', () => {
  it('é válido', () => expect(validarParametros(P)).toBe(true));
  it('está vigente na data de teste', () =>
    expect(conferirVigencia(P, HOJE).vigente).toBe(true));
  it('avisa quando vencido', () => {
    const s = conferirVigencia(P, new Date('2027-03-01'));
    expect(s.vigente).toBe(false);
    expect(s.aviso).toContain('venceram');
  });
});

describe('INSS progressivo', () => {
  // 988,07 e nao 988,09: cada fatia e truncada em 2 casas antes de somar, como
  // faz a folha de pagamento. Conferido em cinco documentos reais — ver §6.2
  // do docs/REGRAS_CALCULO_FERIAS.md.
  it('teto de desconto = 988,07', () => perto(calcINSS(99999, P), 988.07));
  it('teto exato do salário de contribuição', () => perto(calcINSS(8475.55, P), 988.07));
  it('1 salário mínimo', () => perto(calcINSS(1621.0, P), 121.575));
  it('base 3.000', () => perto(calcINSS(3000, P), 248.58));
  it('base 5.000', () => perto(calcINSS(5000, P), 501.5));
  // 121,57 + 115,36 + 174,17 + 230,40 (1.645,73 × 14% = 230,4022, truncado).
  it('base 6.000', () => perto(calcINSS(6000, P), 641.5));
  it('base zero', () => perto(calcINSS(0, P), 0));
});

describe('IRRF — dedução, tabela e redução', () => {
  it('escolhe o simplificado quando o INSS é menor', () => {
    const d = calcIRRF({ rendimentosTributaveis: 4000, inss: 368.6 }, P);
    expect(d.criterioAplicado).toBe('simplificado');
    perto(d.deducaoAplicada, 607.2);
  });
  it('escolhe as deduções legais quando o INSS é maior', () => {
    const d = calcIRRF({ rendimentosTributaveis: 6000, inss: 641.5 }, P);
    expect(d.criterioAplicado).toBe('legais');
    perto(d.base, 5358.5);
    perto(d.impostoTabela, 564.86); // 5.358,50 × 27,5% − 908,73 = 564,8575
    perto(d.reducao, 179.75); // 978,62 − 0,133145 × 6.000
    perto(d.imposto, 385.11);
  });
  it('redução zera o imposto até 5.000 de tributáveis', () => {
    const d = calcIRRF({ rendimentosTributaveis: 4000, inss: 368.6 }, P);
    perto(d.impostoTabela, 114.76);
    perto(d.imposto, 0);
  });
  it('sem redução acima de 7.350', () => {
    perto(calcReducaoIRRF(12000, 2119.55, P), 0);
  });
  it('redução decrescente na faixa intermediária', () => {
    perto(calcReducaoIRRF(6000, 999, P), 179.75);
  });
  it('cada dependente abate 189,59 da base', () => {
    const a = calcIRRF({ rendimentosTributaveis: 12000, inss: 988.0914 }, P);
    const b = calcIRRF(
      { rendimentosTributaveis: 12000, inss: 988.0914, dependentes: 2 },
      P,
    );
    perto(a.base - b.base, 2 * 189.59);
    perto(a.imposto - b.imposto, 2 * 189.59 * 0.275);
  });
});

describe('modalidades sem abono', () => {
  const esperado: Record<string, number> = {
    '30': 19992.38,
    '20/10': 20615.77,
    '10/20': 20615.77,
    '15/15': 20184.76,
  };
  for (const [m, liq] of Object.entries(esperado)) {
    it(`${m} -> líquido ${liq}`, () => perto(calc(m as Modalidade).totalLiquido, liq));
  }
  it('10/20 P1 detalhado', () => {
    const p = calc('10/20').periodos[0];
    perto(p.ferias, 4500);
    perto(p.umTerco, 1500);
    perto(p.adiantamento13, 6750);
    perto(p.receitasBrutas, 12750);
    perto(p.inss, 641.5);
    perto(p.irrf, 385.11);
    perto(p.liquido, 11723.39);
    perto(p.abono, 0);
  });
  it('10/20 P2 detalhado', () => {
    const p = calc('10/20').periodos[1];
    perto(p.receitasBrutas, 12000);
    perto(p.inss, 988.07);
    perto(p.irrf, 2119.55);
    perto(p.liquido, 8892.38);
    perto(p.adiantamento13, 0);
  });
  it('20/10 e 10/20 empatam no líquido', () =>
    perto(calc('20/10').totalLiquido, calc('10/20').totalLiquido));
});

describe('modalidades com abono pecuniário', () => {
  const esperado: Record<string, number> = {
    '20': 21642.38,
    '15/5': 22218.8,
  };
  for (const [m, liq] of Object.entries(esperado)) {
    it(`${m} -> líquido ${liq}`, () => perto(calc(m as Modalidade).totalLiquido, liq));
  }
  it('abono vale 10 dias + 1/3, e sai no 1º período', () => {
    const r = calc('15/5');
    perto(r.periodos[0].abono, (S * 10) / 30 + ((S / 3) * 10) / 30);
    perto(r.periodos[1].abono, 0);
    expect(r.diasVendidos).toBe(10);
    expect(r.diasGozados).toBe(20);
  });
  it('abono NÃO entra na base de INSS/IRRF', () => {
    const comAbono = calc('20').periodos[0];
    const semAbono = calc('20/10').periodos[0];
    perto(comAbono.baseINSS, semAbono.baseINSS);
    perto(comAbono.inss, semAbono.inss);
    perto(comAbono.irrf, semAbono.irrf);
  });
  it('vender dias sempre rende mais que gozar 30', () => {
    for (const m of ['20', '15/5'] as const) {
      expect(calc(m).totalLiquido).toBeGreaterThan(calc('30').totalLiquido);
    }
  });
});

describe('invariantes', () => {
  it('bruto = S + S/3 + S/2 em TODAS as modalidades', () => {
    for (const m of Object.keys(MODALIDADES) as Modalidade[]) {
      perto(calc(m).totalBruto, S + S / 3 + S / 2);
    }
  });
  it('30 dias corridos é o pior líquido', () => {
    const base = calc('30').totalLiquido;
    for (const m of Object.keys(MODALIDADES) as Modalidade[]) {
      if (m !== '30') expect(calc(m).totalLiquido).toBeGreaterThanOrEqual(base);
    }
  });
  it('rateio soma o líquido do período', () => {
    for (const p of calc('15/15').periodos) {
      perto(p.rateio.parte13 + p.rateio.guardar + p.rateio.gastar, p.liquido);
    }
  });
  it('descontos = inss + irrf', () => {
    for (const p of calc('15/5').periodos) perto(p.descontos, p.inss + p.irrf);
  });
  it('sem adiantamento do 13º o bruto cai S/2', () => {
    perto(
      calc('30').totalBruto - calc('30', { adiantamento13: false }).totalBruto,
      S / 2,
    );
  });
});

describe('salário baixo — simplificado + redução juntos', () => {
  const r = calcularFeriasCom(
    { salarioBase: 3000, modalidade: '30', adiantamento13: true },
    P,
    HOJE,
  );
  const p = r.periodos[0];
  it('receitas brutas', () => perto(p.receitasBrutas, 5500));
  it('INSS', () => perto(p.inss, 368.58));
  it('usa o desconto simplificado', () =>
    expect(p.irrfDetalhe.criterioAplicado).toBe('simplificado'));
  it('IRRF zerado pela redução', () => perto(p.irrf, 0));
  it('líquido', () => perto(p.liquido, 5131.42));
});

describe('avisos e validação', () => {
  it('sempre traz o disclaimer', () => {
    expect(calc('30').avisos.some((a) => a.includes('aproximado'))).toBe(true);
  });
  it('avisa salário abaixo do mínimo', () => {
    const r = calcularFeriasCom(
      { salarioBase: 900, modalidade: '30', adiantamento13: true },
      P,
      HOJE,
    );
    expect(r.avisos.some((a) => a.includes('salário mínimo'))).toBe(true);
  });
  it('rejeita salário zero ou negativo', () => {
    expect(() =>
      calcularFeriasCom({ salarioBase: 0, modalidade: '30', adiantamento13: true }, P),
    ).toThrow();
  });
  it('rejeita modalidade inexistente', () => {
    expect(() =>
      calcularFeriasCom(
        { salarioBase: S, modalidade: '10/10' as Modalidade, adiantamento13: true },
        P,
      ),
    ).toThrow();
  });
  it('expõe exatamente as 6 modalidades permitidas pela empresa', () => {
    expect(Object.keys(MODALIDADES).sort()).toEqual(
      ['10/20', '15/15', '15/5', '20', '20/10', '30'].sort(),
    );
  });
  it('não expõe combinações proibidas', () => {
    for (const m of ['10/10', '14/6', '16/4', '25/5']) {
      expect(Object.keys(MODALIDADES)).not.toContain(m);
    }
  });
});

describe('parseMoeda', () => {
  it('pt-BR', () => perto(parseMoeda('R$ 13.500,25'), 13500.25));
  it('en-US', () => perto(parseMoeda('13500.25'), 13500.25));
  it('só vírgula', () => perto(parseMoeda('1234,56'), 1234.56));
  it('inválido', () => expect(Number.isNaN(parseMoeda('abc'))).toBe(true));
});
