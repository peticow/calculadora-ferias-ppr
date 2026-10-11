import { useState } from 'react';
import AbaFerias, { ESTADO_FERIAS_INICIAL, type EstadoFerias } from './components/AbaFerias';
import AbaPPR, { ESTADO_PPR_INICIAL, type EstadoPPR } from './components/AbaPPR';
import Cabecalho from './components/Cabecalho';
import { useTema } from './lib/tema';

type Aba = 'ferias' | 'ppr';

const ABAS = [
  { id: 'ferias', texto: 'Calcular Férias' },
  { id: 'ppr', texto: 'Calcular PPR' },
] as const satisfies ReadonlyArray<{ id: Aba; texto: string }>;

export default function App() {
  // O app SEMPRE abre em "Calcular Ferias".
  const [aba, setAba] = useState<Aba>('ferias');
  // Os dois estados vivem aqui: trocar de aba nao apaga o que ja foi digitado.
  const [ferias, setFerias] = useState<EstadoFerias>(ESTADO_FERIAS_INICIAL);
  const [ppr, setPpr] = useState<EstadoPPR>(ESTADO_PPR_INICIAL);
  const { tema, alternar } = useTema();

  return (
    <div className="min-h-screen px-3 py-4 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-[46rem]">
        <Cabecalho
          abas={ABAS}
          ativa={aba}
          onTrocar={setAba}
          tema={tema}
          onTema={alternar}
        />

        {/*
          Sem cantos no topo e sem margem: o painel se emenda à aba ativa, como
          a folha presa embaixo da divisória de um fichário.

          Os dois painéis ficam montados o tempo todo, só escondidos. Trocar de
          aba não pode desmontar nada: os acordeões "Mais Opções" guardam o
          aberto/fechado internamente e reabririam sozinhos a cada troca. O
          fade de entrada é CSS puro (src/index.css), que reinicia quando o
          `hidden` sai — sem remontar componente.
        */}
        <main className="rounded-b-[4px] bg-painel px-3 py-5 shadow-chapa sm:px-6 sm:py-7">
          <div
            role="tabpanel"
            id="painel-ferias"
            aria-labelledby="aba-ferias"
            hidden={aba !== 'ferias'}
          >
            <AbaFerias estado={ferias} setEstado={setFerias} />
          </div>
          <div role="tabpanel" id="painel-ppr" aria-labelledby="aba-ppr" hidden={aba !== 'ppr'}>
            <AbaPPR estado={ppr} setEstado={setPpr} salarioDasFerias={ferias.salario} />
          </div>
        </main>
      </div>
    </div>
  );
}
