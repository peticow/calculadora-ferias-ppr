# Regras de Cálculo — Calculadora de Férias

> Regra **única**, sempre com as tabelas vigentes. Como o app simula férias
> **futuras**, não há histórico de anos: existe apenas o conjunto de parâmetros
> em vigor, carregado de `parametros.json`.
>
> Base: estrutura de cálculo da planilha `Calculadora de Férias.xlsx`, com as
> tabelas de INSS e IRRF substituídas pelas oficiais vigentes (ver §2).
>
> Arquivos: `ferias.ts` (motor) · `parametros.ts` (carregamento) ·
> `parametros.json` (tabelas) · `ferias.test.ts` (testes-âncora).

---

## 1. Escopo

O funcionário informa o **salário base bruto mensal** e escolhe como quer tirar
as férias. O app devolve, por período: receitas brutas, INSS, IRRF e líquido;
mais o consolidado e a comparação entre modalidades.

### Modalidades

**Sem abono — 30 dias gozados**

| Chave | Períodos |
|---|---|
| `30` | 30 dias corridos |
| `20/10` | 20 dias, depois 10 |
| `10/20` | 10 dias, depois 20 |
| `15/15` | 15 dias, depois 15 |

**Com abono pecuniário — 10 dias vendidos + 20 gozados**

| Chave | Períodos gozados |
|---|---|
| `20` | 20 dias corridos |
| `15/5` | 15 dias, depois 5 |

> **Estas 6 modalidades são a lista fechada. Não gere combinações novas nem
> aceite dias arbitrários** — nem na UI, nem na API. Duas camadas de regra se
> somam aqui:
>
> 1. **CLT art. 134, §1º** — as férias podem ser divididas em até 3 períodos;
>    um deles precisa ter no mínimo 14 dias e os demais, no mínimo 5 dias cada.
>    Isso já elimina, por exemplo, `10/10` com abono.
> 2. **Política interna da empresa**, mais restritiva que a CLT: só as 6
>    combinações acima estão liberadas. `14/6` e `16/4`, por exemplo, seriam
>    válidos pela CLT mas **não** são permitidos aqui.
>
> Se a política interna mudar, a alteração é pontual: acrescente ou remova a
> entrada em `MODALIDADES` (`ferias.ts`) e o teste correspondente. O motor de
> cálculo não precisa de nenhuma mudança.

---

## 2. Fonte dos parâmetros fiscais — arquitetura

**Não existe API oficial do governo que devolva as tabelas de INSS e IRRF em
JSON.** As fontes oficiais são páginas HTML no gov.br, que mudam de layout,
não têm versionamento e bloqueiam scraping automatizado. Consultá-las em
runtime seria frágil e quebraria o app justamente quando ele mais é usado.

A solução é **uma fonte fixa sob seu controle**, com guarda de validade:

```
parametros.json  →  hospedado numa URL fixa (CDN / public/ / GitHub Raw)
                    ↓ fetch a cada simulação (TTL 12h)
                 →  cache em localStorage (funciona offline)
                    ↓ falha
                 →  cópia embutida no bundle (nunca falha)
```

O que impede o app de errar silenciosamente é a **guarda de vigência**: cada
`parametros.json` declara `vigencia.inicio` e `vigencia.fim`. Se a data de hoje
cair fora, `resultado.avisos` recebe um alerta e **a UI é obrigada a exibi-lo**
(ver §9). O cálculo continua, mas rotulado como estimativa com tabela antiga.

### 2.1 Fontes oficiais (as duas únicas que você deve consultar)

| Parâmetro | Fonte oficial | Norma |
|---|---|---|
| INSS: faixas, alíquotas, teto | [INSS — Tabela de contribuição mensal](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal) | Portaria Interministerial MPS/MF nº 13, de 09/01/2026 |
| IRRF: tabela mensal, dependente, desconto simplificado, tabela de redução | [Receita Federal — Tributação de 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) | Lei nº 15.191/2025 e Lei nº 15.270/2025 |

### 2.2 Rotina anual (janeiro)

O governo reajusta as duas tabelas em janeiro, junto com o salário mínimo.
O checklist está no rodapé de `parametros.ts`. Em resumo: copiar os novos
valores das duas URLs acima, bumpar `versao` / `vigencia` / `verificadoEm`,
rodar os testes (vão falhar de propósito), conferir número por número e
publicar. Os clientes pegam a atualização em até 12h.

---

## 3. Entradas

| Campo | Tipo | Default | Observação |
|---|---|---|---|
| `salarioBase` | número | — | Bruto mensal. Obrigatório, > 0 |
| `modalidade` | enum | `30` | Ver §1 |
| `adiantamento13` | booleano | `true` | 50% do 13º junto das férias |
| `dependentes` | inteiro | `0` | Para o IRRF (§6.1) |
| `criterioIRRF` | `auto` \| `legais` \| `simplificado` | `auto` | Ver §6.2 |
| `outrasDeducoes` | número | `0` | Previdência privada, pensão alimentícia |

Constante estrutural: `diasMes = 30`. A planilha usava `horasMes = 210`
(7 h/dia) para proporcionalizar; é matematicamente idêntico a `dias / 30` e foi
mantido apenas no campo informativo `periodo.horas`.

---

## 4. Receitas por período

Para um período de `d` dias gozados:

```
ferias(d)      = S * d / 30
umTerco(d)     = (S / 3) * d / 30
adiantamento13 = S / 2          -> SÓ no primeiro período (0 nos demais)
abono          = (S * 10 / 30) + ((S / 3) * 10 / 30)   -> SÓ se vendeu dias
receitasBrutas = ferias + umTerco + abono + adiantamento13
```

**Adiantamento do 13º:** é único no ano e sai no primeiro período. Se
`adiantamento13 = false`, é 0 em todos.

**Somatório invariante:** o bruto total é sempre `S + S/3 + S/2`,
independentemente da modalidade e de haver abono. O que muda entre as
modalidades são só os **descontos**.

---

## 5. Abono pecuniário (venda de 10 dias) — CLT art. 143

O funcionário pode converter **1/3 do período** (10 dias) em dinheiro. Efeitos:

1. Recebe 10 dias de remuneração **+ 1/3 sobre esses 10 dias**;
2. Goza apenas 20 dias;
3. **O abono é isento de INSS e de IRRF** — não entra em nenhuma base.
   Fundamento: art. 28, §9º, da Lei 8.212/91 (redação da Lei 13.149/2015),
   IN RFB 1.500/2014 art. 11, VI, e Súmula 386 do STJ.

É por isso que vender dias é sempre a opção com maior líquido: converte
receita tributável em receita isenta. É a alavanca de maior impacto no app —
vale destacar na UI.

Restrições a validar: o pedido deve ser feito **até 15 dias antes do fim do
período aquisitivo**, e não se aplica a férias coletivas (regra própria) nem a
contratos de tempo parcial em algumas hipóteses.

---

## 6. Descontos por período

### 6.1 Bases

Nem o adiantamento do 13º nem o abono entram nas bases das férias. O 13º é
tributado separadamente quando pago (INSS e IRRF em apuração própria); o abono
é isento.

```
rendimentosTributaveis = ferias(d) + umTerco(d)
```

### 6.2 INSS — progressivo por faixa

Cada fatia do salário de contribuição é tributada pela **sua própria**
alíquota, e o total é limitado ao teto:

```
calcINSS(base):
  base = min(base, tetoSalarioContribuicao)
  total = 0; anterior = 0
  para cada faixa (ate, aliquota):
    se base <= anterior: pare
    total += (min(base, ate) - anterior) * aliquota
    anterior = ate
  return total
```

Tabela vigente (competência jan/2026 — Portaria Interministerial MPS/MF 13):

| Salário de contribuição | Alíquota |
|---|---|
| até R$ 1.621,00 | 7,5% |
| de R$ 1.621,01 a R$ 2.902,84 | 9,0% |
| de R$ 2.902,85 a R$ 4.354,27 | 12,0% |
| de R$ 4.354,28 a R$ 8.475,55 | 14,0% |

**Teto de desconto: R$ 988,07.**

Cada fatia é **truncada em 2 casas antes de somar**, não arredondada no fim.
Somar exato daria 988,0914 → 988,09; a folha de pagamento cobra 988,07:

| Fatia | Exato | Truncado |
|---|---|---|
| 1.621,00 × 7,5% | 121,575 | 121,57 |
| 1.281,84 × 9,0% | 115,3656 | 115,36 |
| 1.451,43 × 12,0% | 174,1716 | 174,17 |
| 4.121,28 × 14,0% | 576,9792 | 576,97 |
| | 988,0914 | **988,07** |

Truncar explicou **cinco** documentos reais de folha (dois recibos de férias e
três contracheques; quatro no teto do INSS, um abaixo dele); arredondar errou os cinco. Os
documentos são pessoais e não estão neste repositório.

> **Por que progressivo e não "alíquota × base − parcela a deduzir":** os dois
> métodos dão o mesmo resultado, mas as "parcelas a deduzir" divulgadas por
> terceiros vêm arredondadas e divergem entre fontes (24,31 / 24,32 …). O
> método progressivo usa apenas os números que a portaria oficial publica, sem
> intermediário. **A planilha original errava aqui:** usava a 1ª faixa em
> R$ 1.577,00 (valor estimado antes do salário mínimo sair) em vez de
> R$ 1.621,00, e um teto de R$ 988,75 em vez de R$ 988,07.

### 6.3 IRRF — dedução, tabela e redução

Três etapas, nesta ordem.

**Etapa 1 — escolher a dedução (a maior das duas):**

```
deducoesLegais = INSS + dependentes * 189,59 + outrasDeducoes
simplificado   = 607,20
deducao = max(deducoesLegais, simplificado)    // criterioIRRF = 'auto'
base    = max(0, rendimentosTributaveis - deducao)
```

**Etapa 2 — tabela progressiva mensal** (a partir de jan/2026, Lei 15.191/2025):

| Base de cálculo | Alíquota | Parcela a deduzir |
|---|---|---|
| até R$ 2.428,80 | isento | — |
| de R$ 2.428,81 a R$ 2.826,65 | 7,5% | R$ 182,16 |
| de R$ 2.826,66 a R$ 3.751,05 | 15,0% | R$ 394,16 |
| de R$ 3.751,06 a R$ 4.664,68 | 22,5% | R$ 675,49 |
| acima de R$ 4.664,68 | 27,5% | R$ 908,73 |

```
impostoTabela = max(0, base * aliquota - parcelaDeduzir)
```

**Etapa 3 — redução da Lei 15.270/2025.** Incide sobre os **rendimentos
tributáveis brutos**, não sobre a base:

| Rendimentos tributáveis | Redução |
|---|---|
| até R$ 5.000,00 | o suficiente para **zerar** o imposto |
| de R$ 5.000,01 a R$ 7.350,00 | `978,62 − (0,133145 × rendimentos)` |
| acima de R$ 7.350,00 | nenhuma |

```
irrf = max(0, impostoTabela - reducao)
```

> ⚠️ **A tabela de IRRF da planilha estava desatualizada** (isenção em
> R$ 2.259,20; deduções 169,44 / 381,44 / 662,77) e não tinha a redução da Lei
> 15.270/2025. Isso superestimava o imposto — em especial para salários
> menores, que hoje ficam isentos.

### 6.4 Líquido

```
descontos = inss + irrf
liquido   = receitasBrutas - descontos
```

**Cada período é apurado isoladamente**, com suas próprias bases. É por isso
que fracionar as férias reduz o imposto total: duas bases menores caem em
faixas mais baixas do que uma base única de 30 dias.

---

## 7. Respondendo às dúvidas de UX

### 7.1 Dependentes — o que mudam

Cada dependente abate **R$ 189,59 da base do IRRF** (não do imposto). O ganho
no bolso é `189,59 × alíquota da faixa`:

| Faixa | Economia por dependente |
|---|---|
| 7,5% | R$ 14,22 |
| 15,0% | R$ 28,44 |
| 22,5% | R$ 42,66 |
| 27,5% | R$ 52,14 |

Só vale a pena informar dependentes se as **deduções legais** superarem os
R$ 607,20 do desconto simplificado (§7.2). Quem tem INSS alto — caso de quem
bate o teto — já está no critério legal, e aí cada dependente reduz de fato.

Quem conta como dependente é definido pela Lei 9.250/95 art. 35 (cônjuge,
filhos até 21 anos ou até 24 se universitários, pais dentro do limite de
rendimentos, etc.). **O mesmo dependente não pode ser usado por duas pessoas.**

### 7.2 Desconto simplificado — como funciona

É uma dedução fixa de **R$ 607,20** que **substitui todas as deduções legais**
— inclusive o INSS. Ou você deduz `INSS + dependentes + pensão + previdência`,
ou deduz R$ 607,20. Nunca os dois.

A folha de pagamento usa automaticamente **o que der menos imposto**, e o app
faz o mesmo com `criterioIRRF: 'auto'`. Na prática:

- **Salários baixos:** o INSS é pequeno, o simplificado ganha. Ex.: base
  tributável de R$ 4.000 → INSS R$ 368,58 vs. simplificado R$ 607,20 → usa o
  simplificado.
- **Salários altos:** o INSS já passa de R$ 607,20 (acontece a partir de uma
  base de ~R$ 5.400), então as deduções legais ganham e os dependentes contam.

Deixe o critério em `auto` na UI e apenas **mostre qual foi aplicado**
(`irrfDetalhe.criterioAplicado`) — é um dado que gera confiança. Os campos
`legais` / `simplificado` existem só para depuração.

---

## 8. Rateio sugerido do líquido (opcional)

Da planilha (`2026!H23:H25`), por período:

```
parte13 = adiantamento13 do período      -> "Gastar"
resto   = liquido - parte13
guardar = (resto / 3) * 2                -> "Guardar para pagar contas"
gastar  = resto / 3                      -> "Gastar"
```

Invariante: `parte13 + guardar + gastar = liquido`.

---

## 9. Avisos obrigatórios na UI

`resultado.avisos` é um array de strings que **precisa ser renderizado**. Ele
carrega:

1. **Vigência vencida** — tabelas fora do período de validade;
2. **Salário abaixo do mínimo** — provável erro de digitação;
3. **Disclaimer permanente** — o resultado é aproximado.

### 9.1 O que o cálculo NÃO considera

- Médias de **horas extras, adicionais** (noturno, insalubridade,
  periculosidade), **comissões** e outras variáveis que integram a base das
  férias (CLT art. 142) — na prática, isso costuma **aumentar** o valor real.
- Faltas injustificadas, que reduzem os dias de direito (CLT art. 130).
- Descontos de folha: vale-transporte, coparticipação em plano de saúde,
  empréstimo consignado, adiantamentos.
- Férias proporcionais (período aquisitivo incompleto) e férias em dobro
  (art. 137).
- Tributação do 13º quando ele for efetivamente pago — o adiantamento entra
  aqui como receita, mas o imposto dele é apurado na 2ª parcela, em dezembro.
  **Explique isso na UI:** o valor recebido nas férias é bruto de 13º, e a
  mordida vem depois.

---

## 10. Arredondamento e formatação

- **Não arredonde etapas.** Arredonde só na exibição.
- Moeda: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Entrada: aceite `.` e `,` — use `parseMoeda()` de `ferias.ts`.

---

## 11. Conferência — `S = 13.500,00` (fictício), com adiantamento do 13º, 0 dependentes

Bruto total idêntico em todas: **R$ 24.750,00** (= S + S/3 + S/2).

| Modalidade | Descontos | Líquido | vs. 30 dias |
|---|---|---|---|
| `15/5` (com abono) | 2.531,20 | **22.218,80** | +2.226,42 |
| `20` (com abono) | 3.107,62 | 21.642,38 | +1.650,00 |
| `20/10` | 4.134,23 | 20.615,77 | +623,39 |
| `10/20` | 4.134,23 | 20.615,77 | +623,39 |
| `15/15` | 4.565,24 | 20.184,76 | +192,38 |
| `30` | 4.757,62 | 19.992,38 | — |

`20/10` e `10/20` empatam **sempre**: o adiantamento do 13º é isento nas bases,
então a ordem dos períodos muda **quando** o dinheiro cai, não quanto.

### Detalhe — `10/20`, período 1 (10 dias)

| Item | Valor |
|---|---|
| Férias (10 d) | 4.500,00 |
| 1/3 proporcional | 1.500,00 |
| Adiantamento 13º | 6.750,00 |
| **Receitas brutas** | **12.750,00** |
| Rendimentos tributáveis | 6.000,00 |
| INSS (progressivo) | 641,50 |
| Dedução aplicada | legais — 641,50 |
| Base IRRF | 5.358,50 |
| Imposto pela tabela | 564,86 |
| Redução Lei 15.270 | 179,75 |
| **IRRF** | **385,11** |
| **Descontos** | **1.026,61** |
| **Líquido** | **11.723,39** |

### Detalhe — `10/20`, período 2 (20 dias)

| Item | Valor |
|---|---|
| Férias (20 d) | 9.000,00 |
| 1/3 proporcional | 3.000,00 |
| Adiantamento 13º | 0,00 |
| **Receitas brutas** | **12.000,00** |
| INSS (no teto) | 988,07 |
| Base IRRF | 11.011,93 |
| **IRRF** (sem redução: > 7.350) | **2.119,55** |
| **Descontos** | **3.107,62** |
| **Líquido** | **8.892,38** |

O mesmo cálculo, feito com o salário real, bateu no centavo com o líquido do
recibo de férias correspondente.

### Caso de salário baixo — `S = 3.000,00`, modalidade `30`

| Item | Valor |
|---|---|
| Férias + 1/3 (tributáveis) | 4.000,00 |
| Adiantamento 13º | 1.500,00 |
| **Receitas brutas** | **5.500,00** |
| INSS | 368,58 |
| Dedução aplicada | **simplificado — 607,20** (maior que o INSS) |
| Base IRRF | 3.392,80 |
| Imposto pela tabela | 114,76 |
| Redução (tributáveis ≤ 5.000) | 114,76 → **zera** |
| **IRRF** | **0,00** |
| **Líquido** | **5.131,42** |

Este caso é o melhor teste de regressão do app: exercita o desconto
simplificado **e** a redução da Lei 15.270/2025 ao mesmo tempo. Com as tabelas
antigas da planilha, ele daria imposto — e estaria errado.

---

## 12. Contrato de dados

Ver as interfaces exportadas em `ferias.ts`: `Entrada`, `Periodo`,
`DetalheIRRF`, `Resultado`. Ponto de entrada:

```ts
const r = await calcularFerias({
  salarioBase: 13500,
  modalidade: '15/5',
  adiantamento13: true,
  dependentes: 2,
});
// r.periodos[0].irrfDetalhe.criterioAplicado -> 'legais' | 'simplificado'
// r.avisos -> string[]  (renderizar SEMPRE)

const ranking = await compararModalidades({
  salarioBase: 13500,
  adiantamento13: true,
});
// ranking[0].modalidade -> a mais vantajosa
```

---

## 13. PPR — Programa de Participação nos Resultados

Módulo independente das férias. Implementado em `ppr.ts`, testado em
`ppr.test.ts`, tabela em `parametros.json` sob a chave `plr`.

**Nunca misture as tabelas.** Férias usam a tabela mensal do IRRF; PPR usa a
tabela **anual exclusiva de PLR** (Lei 10.101/2000). Aplicar uma no lugar da
outra é o erro mais fácil e mais caro deste projeto.

### 13.1 Cálculo do bruto

Etapas na ordem exata do folheto oficial do RH — mantenha essa ordem no código
e exponha as etapas intermediárias (`resultado.etapas`), porque é assim que o
funcionário confere contra o material da empresa:

```
salarioXTarget     = salarioBase * target
divididoPor12      = salarioXTarget / 12
xMesesTrabalhados  = divididoPor12 * mesesTrabalhados
xResultadoEmpresa  = xMesesTrabalhados * (resultadoEmpresa / 100)
menosSancao        = xResultadoEmpresa * (1 - reducaoSancao / 100)
bruto              = menosSancao
```

### 13.2 Entradas do PPR

| Campo | Tipo | Default | Observação |
|---|---|---|---|
| `salarioBase` | número | — | Bruto mensal. O target é expresso em salários, então é obrigatório |
| `target` | número | — | Multiplicador de salário (ex.: 1,5 / 2,3) |
| `mesesTrabalhados` | inteiro 1–12 | — | Meses trabalhados no ano anterior |
| `resultadoEmpresa` | número (%) | — | Divulgado pelo RH poucos dias antes do pagamento. **Muda todo ano — é INPUT, nunca parâmetro fixo** |
| `reducaoSancao` | número (%) | `0` | Redução por sanção disciplinar ou faltas injustificadas. Consta do folheto do RH como última etapa |

### 13.3 Tributação do PPR

- **INSS: não incide.** A participação nos lucros não integra a remuneração
  (Lei 10.101/2000, art. 3º). O campo existe no resultado e vale sempre 0,
  para a UI poder manter os mesmos quatro campos das férias.
- **IRRF: tabela anual exclusiva na fonte**, sem desconto simplificado, sem
  dedução por dependente e **sem** a redução da Lei 15.270/2025.

Tabela vigente (a partir de maio de 2025, publicada na página de tabelas de
2026 da Receita Federal):

| PLR anual | Alíquota | Dedução |
|---|---|---|
| de R$ 0,00 a R$ 8.214,40 | isento | — |
| de R$ 8.214,41 a R$ 9.922,28 | 7,5% | R$ 616,08 |
| de R$ 9.922,29 a R$ 13.167,00 | 15,0% | R$ 1.360,25 |
| de R$ 13.167,01 a R$ 16.380,38 | 22,5% | R$ 2.347,78 |
| acima de R$ 16.380,38 | 27,5% | R$ 3.166,80 |

```
irrf    = max(0, bruto * aliquota - deducao)
liquido = bruto - irrf        // INSS é sempre 0
```

> ⚠️ **A planilha original usava a tabela de PLR de janeiro a abril de 2025**
> (isenção até R$ 7.640,80, dedução final R$ 3.123,78), já substituída em maio
> de 2025. Além disso aplicava a alíquota de 27,5% fixa, sem verificar faixa.

### 13.4 Conferência

| Caso | Entradas | Bruto | IRRF | Líquido |
|---|---|---|---|---|
| Folheto do RH | 2.000,00 · 1,5 · 12 m · 106,5% · 0% | 3.195,00 | 0,00 (isento) | 3.195,00 |
| Salário alto (fictício) | 13.500,00 · 2,3 · 12 m · 106,5% · 0% | 33.068,25 | 5.926,97 | 27.141,28 |
| Proporcional | 2.000,00 · 1,5 · 6 m · 106,5% · 0% | 1.597,50 | 0,00 | 1.597,50 |
| Com sanção | 2.000,00 · 1,5 · 12 m · 106,5% · 10% | 2.875,50 | 0,00 | 2.875,50 |

O primeiro caso é o mais importante: reproduz dígito a dígito o exemplo do
folheto que a empresa distribui. Se ele quebrar, a fórmula foi alterada.

---

## 14. Decisões de escopo (não são omissões)

### 14.1 Médias de horas extras, adicionais e comissões — fora do escopo

Pela CLT art. 142, as médias de variáveis integram a base das férias. **Mesmo
assim, o app não pede esse dado, e isso é deliberado:** o funcionário não tem
como saber a média que o RH aplica — esse número só existe na folha de
pagamento. Pedir um valor que o usuário vai chutar produziria um resultado
pior do que não pedir, com aparência de precisão.

Consequência a comunicar na UI: **para quem recebe variáveis, o valor real das
férias será MAIOR que o simulado.** O erro é conservador, o que é o lado certo
de errar numa calculadora de planejamento. Deixe isso explícito junto aos
resultados, não escondido num rodapé.

Não implemente um campo `mediaVariaveis` sem antes decidir, com o RH, se essa
média compõe também a base do adiantamento do 13º.

### 14.2 Outras deduções do PLR

Pensão alimentícia judicial pode ser deduzida da base do PLR. Não está
implementado por falta de fonte oficial confirmada. Se for necessário,
levante a norma antes de codar.

### 14.3 O resultado da empresa não é parâmetro fiscal

`resultadoEmpresa` muda todo ano e é divulgado poucos dias antes do pagamento.
Ele é **input do usuário** e não deve entrar no `parametros.json` nem ser
buscado remotamente. Só as tabelas de INSS, IRRF e PLR são parâmetros.
