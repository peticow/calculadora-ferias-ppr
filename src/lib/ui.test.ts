/**
 * Testes da camada de interface: mascara monetaria, mascara decimal e as
 * listas fechadas de modalidade que alimentam o dropdown.
 */
import {
  digitosParaNumero,
  digitosParaTexto,
  mascaraDecimal,
  numeroParaDigitos,
  somenteDigitos,
  textoParaNumero,
} from './moeda';
import {
  modalidadeCompativel,
  opcoesDeModalidade,
  MODALIDADES_COM_VENDA,
  MODALIDADES_SEM_VENDA,
} from './opcoes';
import { calcularFeriasCom, parseMoeda } from '../calc/ferias';
import { calcularPPRCom } from '../calc/ppr';
import { PARAMETROS_EMBUTIDOS as P } from '../calc/parametros';

describe('máscara monetária', () => {
  it('digitar 1050050 exibe 10.500,50', () => {
    expect(digitosParaTexto(somenteDigitos('1050050'))).toBe('10.500,50');
    expect(digitosParaNumero('1050050')).toBe(10500.5);
  });

  it('ignora tudo que não é dígito', () => {
    expect(somenteDigitos('R$ 1.234,56abc')).toBe('123456');
    expect(digitosParaTexto(somenteDigitos('R$ 1.234,56abc'))).toBe('1.234,56');
  });

  it('sempre 2 casas, inclusive nos primeiros dígitos', () => {
    expect(digitosParaTexto('5')).toBe('0,05');
    expect(digitosParaTexto('50')).toBe('0,50');
    expect(digitosParaTexto('500')).toBe('5,00');
  });

  it('campo vazio continua vazio (não vira 0,00)', () => {
    expect(digitosParaTexto('')).toBe('');
    expect(digitosParaNumero('')).toBeUndefined();
  });

  it('descarta zeros à esquerda', () => {
    expect(somenteDigitos('0001500')).toBe('1500');
    expect(digitosParaTexto('1500')).toBe('15,00');
  });

  it('ida e volta preserva o valor', () => {
    for (const v of [0.05, 1234.56, 10500.5, 13500, 99999999.99]) {
      expect(digitosParaNumero(numeroParaDigitos(v))).toBeCloseTo(v, 2);
    }
  });

  it('o salário-âncora atravessa a máscara intacto', () => {
    const digitos = somenteDigitos('1350000');
    expect(digitosParaTexto(digitos)).toBe('13.500,00');
    expect(digitosParaNumero(digitos)).toBe(13500);
    // e bate com o parseMoeda do motor, que le o texto formatado
    expect(parseMoeda(digitosParaTexto(digitos))).toBeCloseTo(13500, 2);
  });
});

describe('máscara decimal (target e resultado da empresa)', () => {
  it('target 0,0 — 1 inteiro e 1 decimal', () => {
    expect(mascaraDecimal('1,5', { inteiros: 1, decimais: 1 })).toBe('1,5');
    expect(mascaraDecimal('12,55', { inteiros: 1, decimais: 1 })).toBe('1,5');
  });

  it('resultado 000,0 — até 3 inteiros e 1 decimal', () => {
    expect(mascaraDecimal('106,5', { inteiros: 3, decimais: 1 })).toBe('106,5');
    expect(mascaraDecimal('1065,55', { inteiros: 3, decimais: 1 })).toBe('106,5');
  });

  it('aceita ponto e converte para vírgula', () => {
    expect(mascaraDecimal('106.5', { inteiros: 3, decimais: 1 })).toBe('106,5');
  });

  it('descarta letras e símbolos', () => {
    expect(mascaraDecimal('a1b,5%', { inteiros: 1, decimais: 1 })).toBe('1,5');
  });

  it('textoParaNumero lê o que a máscara produz', () => {
    expect(textoParaNumero('106,5')).toBe(106.5);
    expect(textoParaNumero('1,5')).toBe(1.5);
    expect(textoParaNumero('0')).toBe(0);
    expect(textoParaNumero('')).toBeUndefined();
    expect(textoParaNumero('  ')).toBeUndefined();
  });
});

describe('dropdown de divisão das férias', () => {
  it('sem venda oferece as 4 opções de 30 dias gozados', () => {
    expect(opcoesDeModalidade(false).map((o) => o.valor)).toEqual([
      '30',
      '20/10',
      '10/20',
      '15/15',
    ]);
  });

  it('com venda oferece as 2 opções de 20 dias gozados', () => {
    expect(opcoesDeModalidade(true).map((o) => o.valor)).toEqual(['20', '15/5']);
  });

  it('os rótulos são os da especificação', () => {
    expect(MODALIDADES_SEM_VENDA.map((o) => o.texto)).toEqual([
      '30 dias',
      '20 dias + 10 dias',
      '10 dias + 20 dias',
      '15 dias + 15 dias',
    ]);
    expect(MODALIDADES_COM_VENDA.map((o) => o.texto)).toEqual([
      '20 dias',
      '15 dias + 05 dias',
    ]);
  });

  it('as listas são disjuntas — trocar a venda invalida a escolha anterior', () => {
    for (const o of MODALIDADES_SEM_VENDA) {
      expect(modalidadeCompativel(o.valor, false)).toBe(true);
      expect(modalidadeCompativel(o.valor, true)).toBe(false);
    }
    for (const o of MODALIDADES_COM_VENDA) {
      expect(modalidadeCompativel(o.valor, true)).toBe(true);
      expect(modalidadeCompativel(o.valor, false)).toBe(false);
    }
  });

  it('rejeita combinações fora da política da empresa', () => {
    for (const m of ['', '10/10', '14/6', '16/4', '25/5', '30/0']) {
      expect(modalidadeCompativel(m, false)).toBe(false);
      expect(modalidadeCompativel(m, true)).toBe(false);
    }
  });
});

/**
 * Fluxo da tela ponta a ponta: as teclas que o usuario digita atravessam as
 * mascaras, viram os tipos que os motores esperam e chegam aos dois valores
 * de referencia (o PPR e o do folheto oficial; as ferias, um salario ficticio). E a mesma cadeia da interface, sem o React no meio.
 */
describe('fluxo da tela — casos de referência digitados', () => {
  it('Férias: digitar 1350000, escolher 10/20 e marcar o 13º → 20.615,77', () => {
    const salarioBase = digitosParaNumero(somenteDigitos('1350000'));
    expect(salarioBase).toBe(13500);
    expect(modalidadeCompativel('10/20', false)).toBe(true);

    const r = calcularFeriasCom(
      {
        salarioBase: salarioBase as number,
        modalidade: '10/20',
        adiantamento13: true,
        dependentes: 0,
        outrasDeducoes: 0,
      },
      P,
      new Date('2026-06-15'),
    );

    expect(r.totalLiquido).toBeCloseTo(20615.77, 2);

    // Os quatro campos da tela, e a invariante que os liga.
    const inss = r.periodos.reduce((a, p) => a + p.inss, 0);
    const irrf = r.periodos.reduce((a, p) => a + p.irrf, 0);
    expect(r.totalBruto).toBeCloseTo(24750, 2);
    expect(r.totalLiquido).toBeCloseTo(r.totalBruto - inss - irrf, 2);
    expect(r.periodos).toHaveLength(2);
  });

  it('PPR: digitar 200000, target 1,5, 12 meses e 106,5 → 3.195,00 isento', () => {
    const salarioBase = digitosParaNumero(somenteDigitos('200000'));
    const target = textoParaNumero(mascaraDecimal('1,5', { inteiros: 1, decimais: 1 }));
    const resultadoEmpresa = textoParaNumero(
      mascaraDecimal('106,5', { inteiros: 3, decimais: 1 }),
    );
    const reducaoSancao = textoParaNumero('0');

    expect([salarioBase, target, resultadoEmpresa, reducaoSancao]).toEqual([
      2000, 1.5, 106.5, 0,
    ]);

    const r = calcularPPRCom(
      {
        salarioBase: salarioBase as number,
        target: target as number,
        mesesTrabalhados: 12,
        resultadoEmpresa: resultadoEmpresa as number,
        reducaoSancao: reducaoSancao as number,
      },
      P,
    );

    expect(r.bruto).toBeCloseTo(3195, 2);
    expect(r.inss).toBe(0);
    expect(r.irrfDetalhe.isento).toBe(true);
    expect(r.irrf).toBeCloseTo(0, 2);
    expect(r.liquido).toBeCloseTo(3195, 2);
    expect(r.liquido).toBeCloseTo(r.bruto - r.inss - r.irrf, 2);
  });

  it('campos faltando: a tela não calcula e mostra tudo zerado', () => {
    // Enquanto salario ou modalidade faltarem, `pronto` e falso na aba 1.
    expect(digitosParaNumero('')).toBeUndefined();
    expect(modalidadeCompativel('', false)).toBe(false);
    // E na aba 2, sem target ou sem resultado da empresa.
    expect(textoParaNumero('')).toBeUndefined();
  });
});
