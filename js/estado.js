// Estado central: os dados que chegam do banco ficam aqui e as telas leem daqui.

export const estado = {
  sessao: null,     // { uid, email } de quem está logado
  usuario: null,    // perfil em "usuarios": { id, nome, papel, ativo, email }
  clientes: [],
  produtos: [],
  servicos: [],
  lancamentos: [],
  movimentos: [],
  usuarios: [],
  empresa: {},
  carregado: new Set(),
};

export const ehAdmin = () => estado.usuario?.papel === 'admin';

export const carregou = colecao => estado.carregado.has(colecao);

export function buscar(colecao, id) {
  if (!id) return null;
  return estado[colecao].find(x => x.id === id) || null;
}

// Espera um registro recém-criado aparecer no estado (o banco avisa em seguida)
export function aguardar(colecao, id, ms = 3000) {
  return new Promise(resolve => {
    const inicio = Date.now();
    const olhar = () => {
      const r = buscar(colecao, id);
      if (r) return resolve(r);
      if (Date.now() - inicio > ms) return resolve(null);
      setTimeout(olhar, 60);
    };
    olhar();
  });
}

export function limparEstado() {
  estado.usuario = null;
  estado.sessao = null;
  for (const c of ['clientes', 'produtos', 'servicos', 'lancamentos', 'movimentos', 'usuarios']) estado[c] = [];
  estado.empresa = {};
  estado.carregado.clear();
}

// Avisa as telas quando algo mudou (agrupa várias mudanças seguidas em uma só)
const ouvintes = new Set();
let agendado = false;

export function aoMudarDados(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function notificar() {
  if (agendado) return;
  agendado = true;
  setTimeout(() => {
    agendado = false;
    ouvintes.forEach(fn => {
      try { fn(); } catch (e) { console.error(e); }
    });
  }, 30);
}
