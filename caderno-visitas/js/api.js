// Cliente da API PHP.

export class ApiErro extends Error {
  constructor(msg, status = 0, dados = null) {
    super(msg);
    this.status = status; // 0 = sem conexão
    this.dados = dados;
  }
}

let aoDeslogar = () => {};
export const definirAoDeslogar = (fn) => (aoDeslogar = fn);

export async function api(rota, { metodo = 'GET', corpo, form } = {}) {
  const opts = { method: metodo, headers: { 'X-CV': '1' }, credentials: 'same-origin' };
  if (corpo !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(corpo);
  }
  if (form) opts.body = form;
  let res;
  try {
    res = await fetch('api.php?r=' + rota, opts);
  } catch {
    throw new ApiErro('Sem conexão com o servidor.', 0);
  }
  let dados = null;
  try {
    dados = await res.json();
  } catch {
    /* resposta sem JSON */
  }
  if (res.status === 401 && rota !== 'login') {
    aoDeslogar();
  }
  if (!res.ok) throw new ApiErro(dados?.erro || `Erro ${res.status} no servidor.`, res.status, dados);
  return dados;
}
