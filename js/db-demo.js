// Banco de dados do MODO DEMONSTRAÇÃO: tudo fica no localStorage deste navegador.
// Tem exatamente as mesmas funções do db-firebase.js, então as telas não percebem a diferença.
import { gerarDadosExemplo } from './dados-exemplo.js';
import { arred, gerarId, erroCom } from './util.js';

const CHAVE = 'concept-vidros-demo-v2';
const CHAVE_SESSAO = 'concept-vidros-demo-sessao';
const INC = '__incrementar';
const UNIR = '__unir';

let banco = carregar();

function carregar() {
  try {
    const t = localStorage.getItem(CHAVE);
    if (t) return JSON.parse(t);
  } catch (e) { console.warn('Não deu para ler o localStorage', e); }
  const b = gerarDadosExemplo();
  gravarLocal(b);
  return b;
}

function gravarLocal(b = banco) {
  try { localStorage.setItem(CHAVE, JSON.stringify(b)); }
  catch (e) { console.warn('Não deu para salvar no localStorage', e); }
}

const copia = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const colecao = c => banco[c] || (banco[c] = {});

function listar(c, op = {}) {
  let arr = Object.entries(colecao(c)).map(([id, d]) => ({ ...copia(d), id }));
  if (op.ordem) {
    const k = op.ordem;
    arr.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (op.desc ? -1 : 1));
  }
  if (op.limite) arr = arr.slice(0, op.limite);
  return arr;
}

// Aplica alterações, entendendo "incrementar" e "unir à lista"
function aplicar(atual, dados) {
  const r = { ...(atual || {}) };
  for (const [k, v] of Object.entries(dados)) {
    if (k === 'id' || v === undefined) continue;
    if (v && typeof v === 'object' && INC in v) r[k] = arred((Number(r[k]) || 0) + v[INC], 4);
    else if (v && typeof v === 'object' && UNIR in v) r[k] = [...(Array.isArray(r[k]) ? r[k] : []), ...copia(v[UNIR])];
    else r[k] = copia(v);
  }
  return r;
}

// ------------------------------------------------ ouvintes (tempo real)

const ouvintes = {};     // colecao -> Set({ cb, op })
const ouvintesDoc = {};  // colecao -> Set({ id, cb })

function emitir(colecoes) {
  setTimeout(() => {
    for (const c of colecoes) {
      ouvintes[c]?.forEach(o => o.cb(listar(c, o.op)));
      ouvintesDoc[c]?.forEach(o => {
        const d = colecao(c)[o.id];
        o.cb(d ? { ...copia(d), id: o.id } : null);
      });
    }
  }, 0);
}

// Outra aba do mesmo navegador mexeu nos dados
window.addEventListener('storage', e => {
  if (e.key === CHAVE && e.newValue) {
    try { banco = JSON.parse(e.newValue); } catch { return; }
    emitir(Object.keys(banco));
  }
  if (e.key === CHAVE_SESSAO) aoMudarCb?.(sessaoAtual());
});

// ------------------------------------------------ sessão

let aoMudarCb = null;

function sessaoAtual() {
  let uid = null;
  try { uid = localStorage.getItem(CHAVE_SESSAO); } catch {}
  const u = uid && colecao('usuarios')[uid];
  return u ? { uid, email: u.email } : null;
}

function definirSessao(uid) {
  try {
    if (uid) localStorage.setItem(CHAVE_SESSAO, uid);
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch {}
  setTimeout(() => aoMudarCb?.(sessaoAtual()), 0);
}

const espera = (ms = 120) => new Promise(r => setTimeout(r, ms));

export const db = {
  demo: true,
  aoErro: null,

  // ---------- acesso
  aoMudarSessao(cb) {
    aoMudarCb = cb;
    setTimeout(() => cb(sessaoAtual()), 0);
    return () => { aoMudarCb = null; };
  },

  async entrar(email, senha) {
    await espera(250);
    const achado = Object.entries(colecao('usuarios')).find(([, u]) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!achado || achado[1].senha !== senha) throw erroCom('auth/invalid-credential');
    definirSessao(achado[0]);
  },

  async entrarComo(uid) {
    definirSessao(uid);
  },

  async sair() {
    definirSessao(null);
  },

  async criarLogin(email, senha) {
    await espera();
    if (!senha || senha.length < 6) throw erroCom('auth/weak-password');
    const existe = Object.values(colecao('usuarios')).some(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (existe) throw erroCom('auth/email-already-in-use');
    const uid = gerarId(28);
    colecao('usuarios')[uid] = { email, senha };
    gravarLocal();
    return uid;
  },

  async enviarRedefinicao() {
    throw erroCom('demo/indisponivel');
  },

  async trocarSenha(atual, nova) {
    await espera();
    const s = sessaoAtual();
    const u = s && colecao('usuarios')[s.uid];
    if (!u || u.senha !== atual) throw erroCom('auth/invalid-credential', 'Senha atual incorreta.');
    if (!nova || nova.length < 6) throw erroCom('auth/weak-password');
    u.senha = nova;
    gravarLocal();
  },

  async sistemaInstalado() { return true; },
  async instalar() { throw erroCom('demo/indisponivel'); },

  // ---------- dados
  novoId() { return gerarId(); },
  inc(n) { return { [INC]: n }; },
  unir(...itens) { return { [UNIR]: itens }; },

  ouvir(c, cb, op = {}) {
    const o = { cb, op };
    (ouvintes[c] ||= new Set()).add(o);
    setTimeout(() => cb(listar(c, op)), 0);
    return () => ouvintes[c]?.delete(o);
  },

  ouvirDoc(c, id, cb) {
    const o = { id, cb };
    (ouvintesDoc[c] ||= new Set()).add(o);
    setTimeout(() => {
      const d = colecao(c)[id];
      cb(d ? { ...copia(d), id } : null);
    }, 0);
    return () => ouvintesDoc[c]?.delete(o);
  },

  async obter(c, id) {
    const d = colecao(c)[id];
    return d ? { ...copia(d), id } : null;
  },

  async adicionar(c, dados) {
    const id = gerarId();
    colecao(c)[id] = aplicar({}, dados);
    gravarLocal();
    emitir([c]);
    return id;
  },

  async definir(c, id, dados, { mesclar = false } = {}) {
    const atual = mesclar ? colecao(c)[id] : {};
    colecao(c)[id] = aplicar(atual, dados);
    gravarLocal();
    emitir([c]);
  },

  async atualizar(c, id, dados) {
    if (!colecao(c)[id]) throw erroCom('not-found', 'Registro não encontrado.');
    colecao(c)[id] = aplicar(colecao(c)[id], dados);
    gravarLocal();
    emitir([c]);
  },

  async remover(c, id) {
    delete colecao(c)[id];
    gravarLocal();
    emitir([c]);
  },

  // ops: [{ tipo: 'set' | 'update' | 'delete', col, id, dados, mesclar }]
  async lote(ops) {
    const mexidas = new Set();
    for (const op of ops) {
      const col = colecao(op.col);
      if (op.tipo === 'delete') delete col[op.id];
      else if (op.tipo === 'update') {
        if (!col[op.id]) throw erroCom('not-found', 'Registro não encontrado.');
        col[op.id] = aplicar(col[op.id], op.dados);
      } else col[op.id] = aplicar(op.mesclar ? col[op.id] : {}, op.dados);
      mexidas.add(op.col);
    }
    gravarLocal();
    emitir([...mexidas]);
  },

  async proximoNumero(chave) {
    const s = colecao('sistema');
    s.contador = s.contador || {};
    s.contador[chave] = (s.contador[chave] || 0) + 1;
    gravarLocal();
    return s.contador[chave];
  },

  // ---------- só no modo demonstração
  async restaurarExemplo() {
    banco = gerarDadosExemplo();
    gravarLocal();
    emitir(Object.keys(banco));
  },

  usuariosDemo() {
    return Object.entries(colecao('usuarios'))
      .filter(([, u]) => u.ativo !== false && u.papel)
      .map(([id, u]) => ({ id, nome: u.nome, papel: u.papel, email: u.email }));
  },
};
