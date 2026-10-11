import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatarBR, mascaraData, textoBRParaISO } from '../lib/datas';
import {
  digitosParaTexto,
  mascaraDecimal,
  somenteDigitos,
} from '../lib/moeda';

interface CampoProps {
  id: string;
  rotulo: string;
  dica?: ReactNode;
  children: ReactNode;
}

export function Campo({ id, rotulo, dica, children }: CampoProps) {
  return (
    <div>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <div className="mt-1.5">{children}</div>
      {dica ? <p className="dica">{dica}</p> : null}
    </div>
  );
}

interface CampoMoedaProps {
  id: string;
  /** Dígitos já digitados, interpretados como centavos. */
  digitos: string;
  onChange: (digitos: string) => void;
  pendente?: boolean;
  placeholder?: string;
}

/**
 * Campo monetário com prefixo "R$" fora da área digitável e teclado numérico
 * no celular. O usuário digita apenas números; a máscara cuida do resto.
 */
export function CampoMoeda({
  id,
  digitos,
  onChange,
  pendente,
  placeholder = '0,00',
}: CampoMoedaProps) {
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-[3px] border bg-campo
        transition-[border-color,box-shadow] duration-200
        focus-within:border-latao-linha focus-within:outline focus-within:outline-2
        focus-within:outline-offset-2 focus-within:outline-latao-linha
        ${pendente ? 'border-alerta-borda' : 'border-filete hover:border-tinta-3/60'}`}
    >
      <span
        aria-hidden="true"
        className="flex select-none items-center border-r border-filete bg-recuo px-3
          text-sm font-medium text-tinta-3"
      >
        R$
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={digitosParaTexto(digitos)}
        onChange={(e) => onChange(somenteDigitos(e.target.value))}
        className="valor w-full bg-transparent px-3 py-2.5 text-base text-tinta outline-none
          placeholder:text-tinta-3/70"
      />
    </div>
  );
}

interface CampoDecimalProps {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  inteiros: number;
  decimais: number;
  sufixo?: string;
  pendente?: boolean;
  placeholder?: string;
}

/** Campo numérico com N casas decimais e sufixo fixo opcional ("Salários", "%"). */
export function CampoDecimal({
  id,
  valor,
  onChange,
  inteiros,
  decimais,
  sufixo,
  pendente,
  placeholder,
}: CampoDecimalProps) {
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-[3px] border bg-campo
        transition-[border-color,box-shadow] duration-200
        focus-within:border-latao-linha focus-within:outline focus-within:outline-2
        focus-within:outline-offset-2 focus-within:outline-latao-linha
        ${pendente ? 'border-alerta-borda' : 'border-filete hover:border-tinta-3/60'}`}
    >
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={valor}
        onChange={(e) => onChange(mascaraDecimal(e.target.value, { inteiros, decimais }))}
        className="valor w-full bg-transparent px-3 py-2.5 text-base text-tinta outline-none
          placeholder:text-tinta-3/70"
      />
      {sufixo ? (
        <span
          aria-hidden="true"
          className="flex select-none items-center border-l border-filete bg-recuo px-3
            text-sm font-medium text-tinta-3"
        >
          {sufixo}
        </span>
      ) : null}
    </div>
  );
}

interface CampoDataProps {
  id: string;
  /** "aaaa-mm-dd" — o formato nativo do input. A exibição é local. */
  valor: string;
  onChange: (v: string) => void;
  pendente?: boolean;
}

/**
 * Data de início de um período de férias.
 *
 * Duas entradas para a mesma data:
 * - o texto, com máscara dd/mm/aaaa e teclado numérico no celular;
 * - o botão de calendário à direita, que abre o seletor nativo do sistema.
 *
 * Antes era só um `<input type="date">`. No Chrome do Android, tocar no texto
 * dele apenas seleciona dia, mês ou ano — não abre teclado nem calendário; só
 * o ícone minúsculo da direita abria. Aqui o `type="date"` continua existindo,
 * escondido, só para emprestar o calendário via `showPicker()`.
 */
export function CampoData({ id, valor, onChange, pendente }: CampoDataProps) {
  const [texto, setTexto] = useState(() => (valor ? formatarBR(valor) : ''));
  const seletor = useRef<HTMLInputElement>(null);
  // O último valor que ESTE campo mandou para cima. Se `valor` chegar diferente
  // dele, a mudança veio de fora (calendário, botão Limpar) e o texto acompanha;
  // senão é eco da própria digitação e o texto pela metade fica como está.
  const emitido = useRef(valor);

  useEffect(() => {
    if (valor === emitido.current) return;
    emitido.current = valor;
    setTexto(valor ? formatarBR(valor) : '');
  }, [valor]);

  const emitir = (iso: string) => {
    emitido.current = iso;
    onChange(iso);
  };

  const digitar = (bruto: string) => {
    const mascarado = mascaraData(bruto);
    setTexto(mascarado);
    emitir(textoBRParaISO(mascarado) ?? '');
  };

  const abrirCalendario = () => {
    const el = seletor.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      // Navegador sem showPicker(): o foco no campo nativo é o melhor que dá.
      el.focus();
    }
  };

  const invalida = texto.length === 10 && !textoBRParaISO(texto);
  const idErro = `${id}-erro`;

  return (
    <>
      <div
        className={`relative flex items-stretch rounded-[3px] border bg-campo
          transition-[border-color,box-shadow] duration-200
          focus-within:border-latao-linha
          ${
            pendente || invalida
              ? 'border-alerta-borda border-l-[3px]'
              : 'border-filete hover:border-tinta-3/60'
          }`}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          value={texto}
          onChange={(e) => digitar(e.target.value)}
          aria-invalid={invalida || undefined}
          aria-describedby={invalida ? idErro : undefined}
          className="valor w-full min-w-0 rounded-l-[3px] bg-transparent px-3 py-2.5 text-base
            text-tinta placeholder:text-tinta-3/70"
        />
        <button
          type="button"
          onClick={abrirCalendario}
          aria-label="Escolher a data no calendário"
          title="Escolher no calendário"
          className="flex min-w-[52px] items-center justify-center rounded-r-[3px] bg-destaque
            px-3 text-white transition-[filter] duration-200 hover:brightness-125"
        >
          {/* Branco sobre o verde da tarja do total: legível nos dois temas. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" strokeWidth={2.25} />
          </svg>
        </button>
        {/*
          Só fornece o calendário. Fica sob o botão, e não com display:none,
          porque no desktop o Chrome ancora o calendário na posição do campo.
        */}
        <input
          ref={seletor}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={valor}
          onChange={(e) => {
            emitir(e.target.value);
            setTexto(e.target.value ? formatarBR(e.target.value) : '');
          }}
          className="pointer-events-none absolute bottom-0 right-0 h-full w-[52px] opacity-0"
        />
      </div>
      {invalida ? (
        <p id={idErro} role="alert" className="mt-1.5 text-sm font-medium text-alerta-texto">
          Essa data não existe. Confira o dia e o mês.
        </p>
      ) : null}
    </>
  );
}

interface SimNaoProps {
  nome: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}

/** Par de botões Sim/Não. Menos cliques que um select e ótimo no celular. */
export function SimNao({ nome, valor, onChange }: SimNaoProps) {
  const base =
    'flex-1 rounded-[3px] border px-4 py-2.5 text-sm font-semibold transition-colors duration-200';
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={nome}>
      {[
        { texto: 'Sim', v: true },
        { texto: 'Não', v: false },
      ].map((o) => (
        <button
          key={o.texto}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          onClick={() => onChange(o.v)}
          className={`${base} ${
            valor === o.v
              ? 'border-latao-linha bg-recuo font-semibold text-tinta shadow-[inset_0_1px_3px_rgb(var(--sombra)/0.13)]'
              : 'border-filete bg-campo text-tinta-3 hover:border-tinta-3/60 hover:text-tinta-2'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

interface SelectProps {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: Array<{ valor: string; texto: string }>;
  vazio?: string;
  pendente?: boolean;
}

export function Select({ id, valor, onChange, opcoes, vazio, pendente }: SelectProps) {
  return (
    /*
     * A seta e mascara, nao imagem de fundo: assim ela herda a cor do texto e
     * acompanha o tema sozinha. Como imagem de fundo era um cinza fixo, que
     * sumia no escuro.
     */
    <select
      id={id}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={`campo seta appearance-none pr-9 ${pendente ? 'campo-pendente' : ''}`}
    >
      {vazio !== undefined ? <option value="">{vazio}</option> : null}
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}
