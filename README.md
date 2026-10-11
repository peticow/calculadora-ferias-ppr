# Calculadora Férias & PPR

Aplicativo de página única (React + Vite + Tailwind) que simula o líquido das
férias e do PPR com as tabelas vigentes de INSS, IRRF e PLR.

100% client-side: não há backend, banco, analytics nem script de terceiros.
Nenhum dado digitado sai do navegador — e dá para conferir, ver
[Privacidade: como conferir](#privacidade-como-conferir).

- **Aba 1 — Calcular Férias:** 6 modalidades de divisão (lista fechada por
  política da empresa), venda de 10 dias, adiantamento do 13º, dependentes e
  outros descontos.
- **Datas dos períodos (opcional):** uma caixa de calendário por período da
  modalidade escolhida. Elas **não alteram os valores** — a remuneração das
  férias depende do salário e dos dias, não de quando eles caem. O que elas
  dizem é *quando*: em que mês o dinheiro cai (**final do mês anterior ao do
  início** — sair em 23/05 é receber no final de abril), fim do período,
  volta ao trabalho, e avisos de início em sexta/fim de semana
  (CLT art. 134, §3º) e de períodos sobrepostos. Feriados não são conferidos.
- **Rateio do pagamento:** cada período mostra o líquido dividido em 13º
  (gastar), Salário (guardar para as contas do mês da volta) e 1/3
  proporcional (gastar), conforme o §8 do documento de regras.
- **Caixas separadas:** dados, total e cada período de férias vivem em caixas
  próprias, em vez de um bloco contínuo.
- **"Como ficam meus pagamentos na época das férias?"** — menu retrátil em cada
  período que projeta a sequência inteira: recibo, salário do mês anterior,
  adiantamento e fechamento de cada mês tocado pelas férias, e a volta ao
  normal. Regras e cálculo em `src/calc/mensal.ts`, conferidos contra
  contracheques reais.
- **Modo claro e escuro:** botão no topo. Sem escolha salva, segue o sistema
  operacional; o clique fixa a preferência em `localStorage`.
- **Aba 2 — Calcular PPR:** fórmula do folheto oficial do RH, com as etapas
  intermediárias visíveis, e a tabela **anual exclusiva de PLR**.

As regras estão em [`docs/REGRAS_CALCULO_FERIAS.md`](docs/REGRAS_CALCULO_FERIAS.md)
— é a fonte de verdade. Onde este README e o documento divergirem, o documento
vence.

## Aparência

O visual é o de um documento financeiro impresso: tinta calcográfica sobre
papel de segurança (o verde-pálido do talão de cheque) no tema claro, e a
matriz de gravação — metal escuro com linha em latão — no escuro.

- **Guilhoché.** A renda do cabeçalho é um hipotrocoide de verdade, a mesma
  curva que impressoras de segurança usam em papel-moeda, gerada em
  `src/components/guilloche.svg` (3 curvas-base repetidas com `<use>` girado;
  18 KB, 6 KB gzipados). Uma máscara radial apaga o miolo: a curva deixa um
  disco vazio de raio `|(R−r)−d|` no centro e a densidade se acumula na borda
  dele, o que aparecia como um buraco escuro com anel brilhante.
- **Tipografia.** Bodoni Moda só no título e no valor do total — didone de
  alto contraste quebra abaixo de ~28 px, então não deve escapar desses dois
  lugares. IBM Plex Sans em todo o resto, pelos algarismos tabulares que fazem
  a coluna de valores fechar no ponto.
- **Filete duplo** (`border-style: double`) marcando limite de seção e
  fechamento de bloco, no lugar dos rótulos em CAIXA ALTA que havia antes: é a
  convenção de documento contábil para "aqui somou", e informa em vez de
  decorar.
- **Tokens.** As cores saem de variáveis CSS (`src/index.css`), não de valores
  fixos no Tailwind. O tema escuro é UM bloco de variáveis em vez de um
  `dark:` em cada elemento.
- **Movimento.** Uma sequência na abertura (guilhoché, título, filete) e a
  contagem do total quando ele muda. Nada mais se mexe sozinho, e
  `prefers-reduced-motion` para tudo.

### Fontes hospedadas aqui

Os `.woff2` ficam em `public/fontes/`, **não** no Google Fonts: um `<link>`
para `fonts.googleapis.com` entregaria o IP e o user-agent de cada visitante,
contra a promessa de que o app não carrega script de terceiros. Vieram de
`@fontsource-variable/{bodoni-moda,ibm-plex-sans}` (devDependencies, mantidas
só como procedência), apenas os subconjuntos latinos — 116 KB no total, dos
quais ~72 KB são baixados de fato. Licença SIL OFL em
`public/fontes/LICENCA.txt`.

### Acessibilidade

Auditado com o DOM renderizado nos dois temas: **0 falhas de contraste** em 88
elementos de texto (mínimo 4,5:1, ou 3:1 em texto grande) e anel de foco
visível em todos os controles. As abas seguem o padrão WAI-ARIA de `tablist`,
com `tabIndex` móvel e navegação por setas, Home e End.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
```

## Testar

```bash
npm run test       # 217 testes
npm run test:watch
```

A suíte cobre os testes-âncora originais (`ferias.test.ts`, `ppr.test.ts`),
a cobertura de combinações (`cobertura.test.ts`), a camada de interface
(`ui.test.ts`: máscaras e dropdowns) e as datas dos períodos
(`datas.test.ts`: aritmética de dias, fuso horário e avisos).

Os casos-âncora não podem falhar:

| Caso | Entradas | Esperado |
|---|---|---|
| Férias | 13.500,00 · `10/20` · com 13º | líquido total **20.615,77** |
| PPR (folheto oficial do RH) | 2.000,00 · target 1,5 · 12 meses · 106,5% · 0% | bruto **3.195,00**, isento, líquido **3.195,00** |

O salário de 13.500,00 é **fictício**. As regras foram conferidas, centavo a
centavo, contra recibos de férias e contracheques reais; esses documentos são
pessoais e ficam fora deste repositório, junto com os testes que usam os
valores deles (arquivos `*.privado.test.ts`, no `.gitignore`).

## Privacidade: como conferir

A promessa é: **nada do que você digita sai do navegador nem fica salvo.**
Não precisa acreditar — dá para verificar de dois jeitos.

**No código.** Tudo o que o app faz com a rede e com o armazenamento do
navegador está nestes pontos:

| Onde | O que faz |
|---|---|
| `src/calc/parametros.ts` — `fetch(URL_PARAMETROS)` | Baixa `/parametros.json`, as tabelas de INSS, IRRF e PLR. É um GET sem nenhum dado seu. |
| `src/calc/parametros.ts` — `localStorage` | Guarda uma cópia dessas tabelas, para funcionar offline. |
| `src/lib/tema.ts` — `localStorage` | Guarda a escolha de tema claro ou escuro. |

Não existe outro `fetch`, formulário enviado, cookie, analytics ou script de
terceiros. As fontes são servidas pelo próprio site, não pelo Google Fonts.
Para procurar você mesmo:

```bash
grep -rnE "fetch|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|cookie" src index.html
```

**No navegador.** Abra o app no computador, aperte F12, vá na aba **Rede**
(Network) e preencha a calculadora. A única requisição que aparece é a de
`parametros.json` (e, no primeiro acesso, os arquivos do próprio site). Nenhuma
leva salário ou qualquer valor digitado.

## Buildar

```bash
npm run build      # tsc -b && vite build  ->  dist/
npm run preview    # serve o dist/ localmente
```

O build é estático. `vite.config.ts` usa `base: '/'` porque o app fica na raiz
do subdomínio, não em subpasta.

## Atualizar o `parametros.json` — rotina de janeiro

O governo reajusta INSS e IRRF em janeiro, junto com o salário mínimo. O
arquivo existe em **dois lugares, de propósito**:

| Arquivo | Papel |
|---|---|
| `public/parametros.json` | servido por URL e buscado por `fetch` a cada simulação (TTL 12 h). **É este que se atualiza sem recompilar.** |
| `src/calc/parametros.json` | cópia embutida no bundle, usada como último fallback |

`src/calc/parametros.ts` mantém as três camadas — remoto → cache em
`localStorage` → embutido — e a **guarda de vigência**: fora do período de
`vigencia`, o cálculo continua mas `resultado.avisos` traz um alerta que a
interface exibe em destaque.

O checklist completo está no rodapé de `src/calc/parametros.ts`. Em resumo:

1. **INSS** — abrir a [tabela de contribuição mensal](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal)
   e copiar as 4 faixas e o teto do salário de contribuição da nova Portaria
   Interministerial.
2. **IRRF** — abrir as [tabelas da Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026)
   e copiar a tabela mensal (faixas, alíquotas, parcela a deduzir), a dedução
   por dependente, o limite do desconto simplificado e a tabela de redução
   mensal. Confira também a tabela **anual de PLR** (chave `plr`).
3. Atualizar `salarioMinimo`, `versao`, `vigencia` e `verificadoEm`.
4. **Copiar o arquivo para os dois lugares.** Há um teste que reprova se as
   duas cópias divergirem.
5. `npm run test` — os testes-âncora vão falhar **de propósito**. Confira cada
   número novo à mão antes de tocar nos valores esperados.
6. Republicar (abaixo). Quem já usou o app pega a atualização em até 12 h.

Se só o `parametros.json` mudou, dá para trocar apenas esse arquivo no
servidor, sem rebuildar — foi para isso que ele existe fora do bundle. Mesmo
assim, atualize as duas cópias no repositório para o fallback não envelhecer.

## Publicar

```bash
cp .env.deploy.example .env.deploy   # preencha; NÃO versione
npm run deploy
```

`scripts/deploy.sh`, nesta ordem:

1. `npm run test` — aborta se qualquer teste falhar;
2. `npm run build`;
3. confere que `dist/index.html`, `dist/.htaccess` e `dist/parametros.json`
   existem e que o JSON é válido e traz as tabelas;
4. envia `dist/` por FTP com `lftp mirror -R --delete`, preservando
   `.well-known/` (senão o AutoSSL quebra na renovação);
5. imprime a URL final.

Requer **lftp** instalado. As credenciais ficam em `.env.deploy`, que está no
`.gitignore` — nenhuma senha em código, script versionado ou README.

O `.htaccess` (em `public/`, copiado para `dist/` a cada build) força HTTPS,
deixa `/parametros.json` e `index.html` sem cache, dá cache de 1 ano
`immutable` aos assets com hash e liga a compressão.

## O que o cálculo não considera

Médias de horas extras, adicionais e comissões (CLT art. 142), faltas,
vale-transporte, plano de saúde e consignados. Para quem recebe variáveis, o
valor real das férias será **maior** que o simulado — o app avisa isso junto
do resultado. A tributação do 13º sai depois, na 2ª parcela, em dezembro.
