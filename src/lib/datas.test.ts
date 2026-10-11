import { describe, expect, it } from 'vitest';
import {
  ajustarInicios,
  avisosDasDatas,
  datarPeriodo,
  ehDataISO,
  fimDoPeriodo,
  formatarBR,
  indiceDiaDaSemana,
  mascaraData,
  mesDoCredito,
  pagamentoAte,
  retornoAoTrabalho,
  somarDias,
  textoBRParaISO,
} from './datas';

describe('ehDataISO', () => {
  it('aceita data completa e válida', () => {
    expect(ehDataISO('2026-01-15')).toBe(true);
  });

  it('recusa vazio e formato parcial', () => {
    for (const v of ['', '2026', '2026-01', '15/01/2026', 'ontem']) {
      expect(ehDataISO(v)).toBe(false);
    }
  });

  it('recusa data que não existe no calendário', () => {
    // 2026 não é bissexto: 29/02 não existe.
    expect(ehDataISO('2026-02-30')).toBe(false);
    expect(ehDataISO('2026-02-29')).toBe(false);
    expect(ehDataISO('2028-02-29')).toBe(true);
  });
});

describe('aritmética de dias', () => {
  it('o dia de início conta como dia de férias', () => {
    // 10 dias a partir de 15/01 terminam em 24/01, não em 25/01.
    expect(fimDoPeriodo('2026-01-15', 10)).toBe('2026-01-24');
    expect(fimDoPeriodo('2026-01-15', 30)).toBe('2026-02-13');
    expect(fimDoPeriodo('2026-01-15', 1)).toBe('2026-01-15');
  });

  it('o retorno é o dia seguinte ao fim', () => {
    expect(retornoAoTrabalho('2026-01-15', 10)).toBe('2026-01-25');
  });

  it('pagamento até 2 dias antes do início (CLT art. 145)', () => {
    expect(pagamentoAte('2026-01-15')).toBe('2026-01-13');
    // Atravessa a virada do mês sem tropeçar.
    expect(pagamentoAte('2026-03-01')).toBe('2026-02-27');
  });

  it('atravessa virada de mês, de ano e 29/02 de ano bissexto', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('fuso horário', () => {
  /**
   * A armadilha que motivou o módulo: em UTC-3, `new Date('2026-01-15')`
   * é 15/01 00:00 UTC = 14/01 21:00 local. Formatar ou ler o dia sem fixar
   * UTC devolveria 14/01 — um dia a menos em todo o app.
   */
  it('não perde um dia ao formatar', () => {
    expect(formatarBR('2026-01-15')).toBe('15/01/2026');
    expect(formatarBR('2026-01-01')).toBe('01/01/2026');
    expect(formatarBR('2026-12-31')).toBe('31/12/2026');
  });

  it('não perde um dia ao ler o dia da semana', () => {
    // 01/01/2026 é quinta-feira.
    expect(indiceDiaDaSemana('2026-01-01')).toBe(4);
    expect(indiceDiaDaSemana('2026-01-02')).toBe(5); // sexta
    expect(indiceDiaDaSemana('2026-01-03')).toBe(6); // sábado
    expect(indiceDiaDaSemana('2026-01-04')).toBe(0); // domingo
    expect(indiceDiaDaSemana('2026-01-05')).toBe(1); // segunda
  });
});

describe('datarPeriodo', () => {
  it('devolve null enquanto a data não está preenchida', () => {
    expect(datarPeriodo('', 30, 1)).toBeNull();
    expect(datarPeriodo('2026-01', 30, 1)).toBeNull();
  });

  it('monta início, fim, retorno, prazo de pagamento e mês do crédito', () => {
    expect(datarPeriodo('2026-01-15', 20, 2)).toEqual({
      ordem: 2,
      dias: 20,
      inicio: '2026-01-15',
      fim: '2026-02-03',
      retorno: '2026-02-04',
      pagamentoAte: '2026-01-13',
      mesDoCredito: 'dezembro de 2025',
    });
  });
});

describe('mesDoCredito', () => {
  it('é o mês anterior ao do início das férias', () => {
    expect(mesDoCredito('2026-05-23')).toBe('abril');
    expect(mesDoCredito('2026-08-13')).toBe('julho');
  });

  it('não depende do dia dentro do mês', () => {
    expect(mesDoCredito('2026-03-01')).toBe('fevereiro');
    expect(mesDoCredito('2026-03-31')).toBe('fevereiro');
  });

  it('mostra o ano quando vira o calendário', () => {
    // Férias em janeiro caem no final de dezembro do ano anterior — sem o ano
    // no rótulo, "final de dezembro" pareceria o dezembro seguinte.
    expect(mesDoCredito('2026-01-05')).toBe('dezembro de 2025');
  });
});

describe('avisosDasDatas', () => {
  const datar = (inicio: string, dias: number, ordem: number) =>
    datarPeriodo(inicio, dias, ordem);

  it('fica calado com início de segunda a quinta', () => {
    // 05/01/2026 é segunda, 08/01 é quinta.
    expect(avisosDasDatas([datar('2026-01-05', 10, 1)])).toEqual([]);
    expect(avisosDasDatas([datar('2026-01-08', 10, 1)])).toEqual([]);
  });

  it('avisa quando começa na sexta, no sábado ou no domingo', () => {
    for (const dia of ['2026-01-02', '2026-01-03', '2026-01-04']) {
      const avisos = avisosDasDatas([datar(dia, 10, 1)]);
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toContain('art. 134');
    }
  });

  it('avisa quando os períodos se sobrepõem', () => {
    // 1º: 05/01 a 14/01. O 2º começando em 10/01 invade.
    const avisos = avisosDasDatas([datar('2026-01-05', 10, 1), datar('2026-01-12', 20, 2)]);
    expect(avisos.some((a) => a.includes('sobrepor'))).toBe(true);
  });

  it('não reclama de períodos em sequência', () => {
    // 1º: 05/01 a 14/01; o 2º começa em 19/01 (segunda).
    expect(avisosDasDatas([datar('2026-01-05', 10, 1), datar('2026-01-19', 20, 2)])).toEqual([]);
  });

  it('ignora períodos ainda sem data', () => {
    expect(avisosDasDatas([null, null])).toEqual([]);
    expect(avisosDasDatas([datar('2026-01-05', 10, 1), null])).toEqual([]);
  });
});

describe('ajustarInicios', () => {
  it('preenche o que falta com vazio', () => {
    expect(ajustarInicios([], 2)).toEqual(['', '']);
    expect(ajustarInicios(['2026-01-05'], 2)).toEqual(['2026-01-05', '']);
  });

  it('corta o excedente ao ir de dois períodos para um', () => {
    expect(ajustarInicios(['2026-01-05', '2026-02-10'], 1)).toEqual(['2026-01-05']);
  });

  it('preserva o que já foi digitado', () => {
    const antes = ['2026-01-05', '2026-02-10'];
    expect(ajustarInicios(antes, 2)).toEqual(antes);
  });
});

describe('campo de data digitado', () => {
  it('põe as barras conforme os dígitos chegam', () => {
    expect(mascaraData('1')).toBe('1');
    expect(mascaraData('11')).toBe('11');
    expect(mascaraData('111')).toBe('11/1');
    expect(mascaraData('1110')).toBe('11/10');
    expect(mascaraData('11102')).toBe('11/10/2');
    expect(mascaraData('11102026')).toBe('11/10/2026');
  });

  it('ignora o que não é dígito e corta em 8', () => {
    expect(mascaraData('11/10/2026')).toBe('11/10/2026');
    expect(mascaraData('ab11.10-20269')).toBe('11/10/2026');
  });

  it('apagar a barra não trava a edição', () => {
    // backspace logo depois da barra: "11/" -> "11"
    expect(mascaraData('11/')).toBe('11');
  });

  it('converte data completa e válida para ISO', () => {
    expect(textoBRParaISO('11/10/2026')).toBe('2026-10-11');
    expect(textoBRParaISO('29/02/2028')).toBe('2028-02-29');
  });

  it('recusa data incompleta ou inexistente', () => {
    expect(textoBRParaISO('11/10/202')).toBeNull();
    expect(textoBRParaISO('31/02/2026')).toBeNull();
    expect(textoBRParaISO('29/02/2026')).toBeNull();
    expect(textoBRParaISO('00/10/2026')).toBeNull();
  });
});
