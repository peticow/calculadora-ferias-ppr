/**
 * Testes de cobertura da aplicacao — complementam os testes-ancora de
 * `ferias.test.ts` e `ppr.test.ts`, que continuam valendo como estao.
 *
 * O que este arquivo trava:
 *  - as 6 combinacoes de divisao, com e sem venda de 10 dias;
 *  - com e sem adiantamento do 13o;
 *  - de 0 a 10 dependentes;
 *  - o caso de salario baixo da secao 11 (3.000, modalidade 30);
 *  - a invariante Liquido = Bruto - INSS - IR em toda combinacao, nas 2 abas;
 *  - os dois casos oficiais da empresa (ferias 20.615,77 e PPR 3.195,00).
 */
import parametrosDoPublic from '../../public/parametros.json';
import parametrosEmbutidoJson from './parametros.json';
import { calcularFeriasCom, MODALIDADES, type Modalidade } from './ferias';
import { calcularPPRCom } from './ppr';
import { PARAMETROS_EMBUTIDOS as P } from './parametros';
import { MODALIDADES_COM_VENDA, MODALIDADES_SEM_VENDA } from '../lib/opcoes';

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
const HOJE = new Date('2026-06-15');

const ferias = (
  salarioBase: number,
  modalidade: Modalidade,
  extra: Record<string, unknown> = {},
) => calcularFeriasCom({ salarioBase, modalidade, adiantamento13: true, ...extra }, P, HOJE);

const TODAS = Object.keys(MODALIDADES) as Modalidade[];
const SALARIOS = [1621, 3000, 5000, 8000, 13500, 40000];

// ─────────────────────────────── casos-âncora ───────────────────────────────

describe('CASOS-ÂNCORA — não podem falhar', () => {
  // Salário fictício. A versão com o salário real, conferida contra o recibo
  // de férias, fica num teste privado fora do repositório público.
  it('Férias: 13.500,00 · 10/20 · com 13º → líquido total 20.615,77', () => {
    perto(ferias(13500, '10/20').totalLiquido, 20615.77);
  });

  it('PPR: 2.000,00 · target 1,5 · 12 meses · 106,5% · 0% → 3.195,00 bruto, isento, 3.195,00 líquido', () => {
    const r = calcularPPRCom(
      {
        salarioBase: 2000,
        target: 1.5,
        mesesTrabalhados: 12,
        resultadoEmpresa: 106.5,
        reducaoSancao: 0,
      },
      P,
    );
    perto(r.bruto, 3195);
    expect(r.irrfDetalhe.isento).toBe(true);
    perto(r.irrf, 0);
    perto(r.liquido, 3195);
  });
});

// ───────────────────── as 6 combinações oferecidas na UI ─────────────────────

describe('as 6 combinações de divisão', () => {
  it('a UI oferece exatamente as 6 modalidades do motor, sem repetir', () => {
    const daUI = [...MODALIDADES_SEM_VENDA, ...MODALIDADES_COM_VENDA].map((o) => o.valor);
    expect(new Set(daUI).size).toBe(6);
    expect([...daUI].sort()).toEqual([...TODAS].sort());
  });

  it('sem venda: 4 opções, 30 dias gozados, 0 vendidos', () => {
    expect(MODALIDADES_SEM_VENDA).toHaveLength(4);
    for (const o of MODALIDADES_SEM_VENDA) {
      const r = ferias(13500, o.valor);
      expect(r.diasGozados).toBe(30);
      expect(r.diasVendidos).toBe(0);
      expect(r.periodos.every((p) => p.abono === 0)).toBe(true);
    }
  });

  it('com venda: 2 opções, 20 dias gozados, 10 vendidos', () => {
    expect(MODALIDADES_COM_VENDA).toHaveLength(2);
    for (const o of MODALIDADES_COM_VENDA) {
      const r = ferias(13500, o.valor);
      expect(r.diasGozados).toBe(20);
      expect(r.diasVendidos).toBe(10);
      expect(r.periodos[0].abono).toBeGreaterThan(0);
    }
  });

  it('a soma dos dias dos períodos bate com o rótulo da opção', () => {
    const dias = (texto: string) =>
      texto.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);
    for (const o of [...MODALIDADES_SEM_VENDA, ...MODALIDADES_COM_VENDA]) {
      expect(dias(o.texto)).toBe(MODALIDADES[o.valor].dias.reduce((a, b) => a + b, 0));
    }
  });
});

// ──────────────────────── adiantamento do 13º ────────────────────────

describe('com e sem adiantamento do 13º', () => {
  for (const m of TODAS) {
    it(`${m}: o bruto difere exatamente em S/2`, () => {
      const com = ferias(13500, m, { adiantamento13: true });
      const sem = ferias(13500, m, { adiantamento13: false });
      perto(com.totalBruto - sem.totalBruto, 13500 / 2);
    });

    it(`${m}: o 13º não muda INSS nem IRRF (não entra nas bases)`, () => {
      const com = ferias(13500, m, { adiantamento13: true });
      const sem = ferias(13500, m, { adiantamento13: false });
      perto(com.totalDescontos, sem.totalDescontos);
    });

    it(`${m}: sem 13º, nenhum período traz adiantamento`, () => {
      const sem = ferias(13500, m, { adiantamento13: false });
      expect(sem.periodos.every((p) => p.adiantamento13 === 0)).toBe(true);
    });

    it(`${m}: com 13º, só o 1º período traz o adiantamento`, () => {
      const com = ferias(13500, m, { adiantamento13: true });
      perto(com.periodos[0].adiantamento13, 13500 / 2);
      for (const p of com.periodos.slice(1)) perto(p.adiantamento13, 0);
    });
  }
});

// ────────────────────────── dependentes 0 a 10 ──────────────────────────

describe('de 0 a 10 dependentes', () => {
  for (let d = 0; d <= 10; d++) {
    it(`${d} dependente(s): calcula e mantém a invariante`, () => {
      const r = ferias(13500, '30', { dependentes: d });
      expect(Number.isFinite(r.totalLiquido)).toBe(true);
      perto(
        r.totalLiquido,
        r.totalBruto -
          r.periodos.reduce((a, p) => a + p.inss, 0) -
          r.periodos.reduce((a, p) => a + p.irrf, 0),
      );
    });
  }

  it('salário alto: cada dependente abate 189,59 da base e reduz o IR', () => {
    // Base de 30 dias em 13.500,00 cai na faixa de 27,5% e usa deduções legais.
    for (let d = 1; d <= 10; d++) {
      const zero = ferias(13500, '30', { dependentes: 0 }).periodos[0];
      const comD = ferias(13500, '30', { dependentes: d }).periodos[0];
      expect(comD.irrfDetalhe.criterioAplicado).toBe('legais');
      perto(zero.irrfDetalhe.base - comD.irrfDetalhe.base, d * P.irrf.deducaoPorDependente);
      perto(zero.irrf - comD.irrf, d * P.irrf.deducaoPorDependente * 0.275);
    }
  });

  it('salário baixo: o critério vira legais a partir de 2 dependentes', () => {
    // INSS de 368,60 + d x 189,59 só passa dos 607,20 do simplificado com d >= 2.
    for (let d = 0; d <= 10; d++) {
      const p = ferias(3000, '30', { dependentes: d }).periodos[0];
      expect(p.irrfDetalhe.criterioAplicado).toBe(d < 2 ? 'simplificado' : 'legais');
    }
  });

  it('salário baixo: mesmo assim o líquido não muda, porque a redução zera o IR', () => {
    const base = ferias(3000, '30', { dependentes: 0 }).totalLiquido;
    for (let d = 1; d <= 10; d++) {
      const r = ferias(3000, '30', { dependentes: d });
      perto(r.periodos[0].irrf, 0);
      perto(r.totalLiquido, base);
    }
  });

  it('dependentes nunca aumentam o imposto', () => {
    for (const s of SALARIOS) {
      let anterior = ferias(s, '30', { dependentes: 0 }).totalDescontos;
      for (let d = 1; d <= 10; d++) {
        const atual = ferias(s, '30', { dependentes: d }).totalDescontos;
        expect(atual).toBeLessThanOrEqual(anterior + 1e-9);
        anterior = atual;
      }
    }
  });
});

// ───────────────────── outras deduções (Mais Opções) ─────────────────────

describe('outras deduções mensais', () => {
  it('entram nas deduções legais e podem virar o critério', () => {
    const sem = ferias(3000, '30', { outrasDeducoes: 0 }).periodos[0];
    const com = ferias(3000, '30', { outrasDeducoes: 1000 }).periodos[0];
    expect(sem.irrfDetalhe.criterioAplicado).toBe('simplificado');
    expect(com.irrfDetalhe.criterioAplicado).toBe('legais');
    perto(com.irrfDetalhe.deducoesLegais - sem.irrfDetalhe.deducoesLegais, 1000);
  });

  it('não alteram o bruto nem o INSS', () => {
    const sem = ferias(13500, '30');
    const com = ferias(13500, '30', { outrasDeducoes: 500 });
    perto(sem.totalBruto, com.totalBruto);
    perto(sem.periodos[0].inss, com.periodos[0].inss);
  });
});

// ───────────────── caso de salário baixo — seção 11 do documento ─────────────────

describe('salário 3.000 · modalidade 30 — simplificado + redução (seção 11)', () => {
  const r = ferias(3000, '30');
  const p = r.periodos[0];
  it('receitas brutas 5.500,00', () => perto(p.receitasBrutas, 5500));
  it('rendimentos tributáveis 4.000,00', () => perto(p.irrfDetalhe.rendimentosTributaveis, 4000));
  it('INSS 368,58', () => perto(p.inss, 368.58));
  it('critério: desconto simplificado', () =>
    expect(p.irrfDetalhe.criterioAplicado).toBe('simplificado'));
  it('dedução aplicada 607,20', () => perto(p.irrfDetalhe.deducaoAplicada, 607.2));
  it('base 3.392,80', () => perto(p.irrfDetalhe.base, 3392.8));
  it('imposto pela tabela 114,76', () => perto(p.irrfDetalhe.impostoTabela, 114.76));
  it('redução zera o imposto', () => {
    perto(p.irrfDetalhe.reducao, 114.76);
    perto(p.irrf, 0);
  });
  it('líquido 5.131,42', () => perto(p.liquido, 5131.42));
});

// ─────────────── invariante Líquido = Bruto − INSS − IR (aba 1) ───────────────

describe('invariante Líquido = Bruto − INSS − IR — aba Férias', () => {
  it('vale em toda combinação de salário × modalidade × 13º × dependentes', () => {
    let combinacoes = 0;
    for (const salario of SALARIOS) {
      for (const m of TODAS) {
        for (const adiantamento13 of [true, false]) {
          for (const dependentes of [0, 1, 5, 10]) {
            const r = calcularFeriasCom(
              { salarioBase: salario, modalidade: m, adiantamento13, dependentes },
              P,
              HOJE,
            );
            const inss = r.periodos.reduce((a, p) => a + p.inss, 0);
            const irrf = r.periodos.reduce((a, p) => a + p.irrf, 0);
            perto(r.totalLiquido, r.totalBruto - inss - irrf);
            // e também período a período, que é como a UI exibe o detalhamento
            for (const p of r.periodos) perto(p.liquido, p.receitasBrutas - p.inss - p.irrf);
            combinacoes++;
          }
        }
      }
    }
    expect(combinacoes).toBe(SALARIOS.length * 6 * 2 * 4);
  });

  it('nenhum valor exibido é negativo ou NaN', () => {
    for (const salario of SALARIOS) {
      for (const m of TODAS) {
        const r = ferias(salario, m);
        for (const v of [r.totalBruto, r.totalDescontos, r.totalLiquido]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        for (const p of r.periodos) {
          expect(p.inss).toBeGreaterThanOrEqual(0);
          expect(p.irrf).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

// ───────────────── invariante Líquido = Bruto − INSS − IR (aba 2) ─────────────────

describe('invariante Líquido = Bruto − INSS − IR — aba PPR', () => {
  it('vale em toda combinação de salário × target × meses × resultado × sanção', () => {
    let combinacoes = 0;
    for (const salarioBase of [1621, 2000, 8000, 13500, 40000]) {
      for (const target of [0.5, 1.5, 2.3]) {
        for (const mesesTrabalhados of [1, 6, 12]) {
          for (const resultadoEmpresa of [0, 80, 106.5, 150]) {
            for (const reducaoSancao of [0, 10, 100]) {
              const r = calcularPPRCom(
                {
                  salarioBase,
                  target,
                  mesesTrabalhados,
                  resultadoEmpresa,
                  reducaoSancao,
                },
                P,
              );
              expect(r.inss).toBe(0);
              perto(r.liquido, r.bruto - r.inss - r.irrf);
              expect(r.bruto).toBeGreaterThanOrEqual(0);
              expect(r.irrf).toBeGreaterThanOrEqual(0);
              combinacoes++;
            }
          }
        }
      }
    }
    expect(combinacoes).toBe(5 * 3 * 3 * 4 * 3);
  });

  it('as etapas encadeiam na ordem do folheto e terminam no bruto', () => {
    const r = calcularPPRCom(
      {
        salarioBase: 2000,
        target: 1.5,
        mesesTrabalhados: 12,
        resultadoEmpresa: 106.5,
        reducaoSancao: 10,
      },
      P,
    );
    const e = r.etapas;
    perto(e.salarioXTarget, 2000 * 1.5);
    perto(e.divididoPor12, e.salarioXTarget / 12);
    perto(e.xMesesTrabalhados, e.divididoPor12 * 12);
    perto(e.xResultadoEmpresa, e.xMesesTrabalhados * 1.065);
    perto(e.menosSancao, e.xResultadoEmpresa * 0.9);
    perto(r.bruto, e.menosSancao);
  });

  it('a tabela de PLR nunca é confundida com a mensal das férias', () => {
    // 5.000 de PLR e isento; 5.000 de rendimento mensal nao seria.
    const r = calcularPPRCom(
      {
        salarioBase: 5000,
        target: 1,
        mesesTrabalhados: 12,
        resultadoEmpresa: 100,
        reducaoSancao: 0,
      },
      P,
    );
    perto(r.bruto, 5000);
    perto(r.irrf, 0);
    expect(r.irrfDetalhe.isento).toBe(true);
  });
});

// ─────────────────── as duas cópias do parametros.json ───────────────────

describe('dupla localização do parametros.json', () => {
  it('public/ e src/calc/ têm exatamente o mesmo conteúdo', () => {
    // As duas cópias existem de proposito (secao 2): a de public/ e buscada
    // por fetch e atualizada em janeiro sem recompilar; a de src/calc/ e o
    // fallback embutido no bundle. Divergir entre elas e o erro classico da
    // rotina anual — este teste e a trava.
    expect(parametrosDoPublic).toEqual(parametrosEmbutidoJson);
  });

  it('o embutido é o mesmo que o motor usa', () => {
    expect(parametrosEmbutidoJson.versao).toBe(P.versao);
    expect(parametrosEmbutidoJson.vigencia).toEqual(P.vigencia);
  });
});
