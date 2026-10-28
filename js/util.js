// Funções de apoio: formatação, datas, telas modais, avisos e ícones.
import { DOMINIO_LOGIN } from './config.js';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ---------------------------------------------------------------- texto

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function contem(alvo, termo) {
  return normalizar(alvo).includes(normalizar(termo));
}

export const soDigitos = s => String(s ?? '').replace(/\D/g, '');

export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

export function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

// ---------------------------------------------------------------- números

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const moeda = n => fmtMoeda.format(Number(n) || 0);
export const compacto = n => fmtCompacto.format(Number(n) || 0);

export function num(n, casas = 2) {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

export function arred(n, casas = 2) {
  const f = 10 ** casas;
  return Math.round(((Number(n) || 0) + Number.EPSILON) * f) / f;
}

// Aceita "1.234,56", "1234,56", "1234.56" e números
export function lerNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// Valor para preencher um campo de texto numérico (vírgula como decimal)
export function numCampo(n, casas = 2) {
  if (n === '' || n === null || n === undefined) return '';
  const v = arred(n, casas);
  return v ? String(v).replace('.', ',') : '';
}

// ---------------------------------------------------------------- datas

const pad = n => String(n).padStart(2, '0');

export function dataISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const hoje = () => dataISO();
export const agora = () => new Date().toISOString();
export const mesAtual = () => hoje().slice(0, 7);

function paraData(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1, 12);
}

export function somarDias(iso, dias) {
  const d = paraData(iso);
  d.setDate(d.getDate() + dias);
  return dataISO(d);
}

// Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02)
export function somarMesesData(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1, 12);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  return dataISO(alvo);
}

export function somarMeses(mesIso, n) {
  const [a, m] = mesIso.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function diasEntre(isoA, isoB) {
  return Math.round((paraData(isoB) - paraData(isoA)) / 86400000);
}

// Data de um registro de horário (ISO completo) no fuso local
export function dataLocal(v) {
  const d = new Date(v);
  return isNaN(d) ? '' : dataISO(d);
}

export function dataBR(v) {
  if (!v) return '';
  const s = String(v);
  if (s.length > 10) {
    const d = new Date(s);
    return isNaN(d) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  const [a, m, d] = s.split('-');
  return d ? `${d}/${m}/${a}` : '';
}

export function dataCurta(v) {
  const b = dataBR(v);
  return b ? b.slice(0, 5) : '';
}

export function dataHoraBR(v) {
  const d = new Date(v);
  if (isNaN(d)) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dataRelativa(iso) {
  if (!iso) return '';
  const dif = diasEntre(hoje(), iso);
  if (dif === 0) return 'hoje';
  if (dif === 1) return 'amanhã';
  if (dif === -1) return 'ontem';
  if (dif > 1 && dif <= 6) return `em ${dif} dias`;
  if (dif < -1 && dif >= -30) return `há ${-dif} dias`;
  return dataBR(iso);
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function nomeMes(mesIso, comAno = true) {
  const [a, m] = mesIso.split('-').map(Number);
  return comAno ? `${MESES[m - 1]} de ${a}` : MESES[m - 1];
}

export function mesAbreviado(mesIso) {
  const [, m] = mesIso.split('-').map(Number);
  const n = MESES[m - 1];
  return n.charAt(0).toUpperCase() + n.slice(1, 3);
}

export function dataPorExtenso(d = new Date()) {
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function saudacao(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ---------------------------------------------------------------- telefone, documentos, login

export function formatarTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatarDocumento(v) {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export function linkWhatsApp(tel, msg = '') {
  let d = soDigitos(tel);
  if (d.length < 10) return '';
  if (d.length <= 11) d = '55' + d;
  return `https://wa.me/${d}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
}

export const linkTelefone = tel => `tel:${soDigitos(tel)}`;

// "joao" -> "joao@vidracaria.example.com"; e-mail completo fica como está
export function emailDoLogin(login) {
  const l = normalizar(login);
  if (!l) return '';
  if (l.includes('@')) return l;
  return `${l.replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '')}@${DOMINIO_LOGIN}`;
}

export function loginExibicao(email) {
  const e = String(email || '');
  const fim = '@' + DOMINIO_LOGIN;
  return e.endsWith(fim) ? e.slice(0, -fim.length) : e;
}

export const emailReal = email => !!email && !String(email).endsWith('@' + DOMINIO_LOGIN);

// ---------------------------------------------------------------- erros

export function mensagemErro(e) {
  const codigo = e?.code || '';
  const mapa = {
    'auth/invalid-credential': 'Usuário ou senha incorretos.',
    'auth/invalid-login-credentials': 'Usuário ou senha incorretos.',
    'auth/wrong-password': 'Usuário ou senha incorretos.',
    'auth/user-not-found': 'Usuário ou senha incorretos.',
    'auth/missing-password': 'Digite a senha.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
    'auth/email-already-in-use': 'Já existe um acesso com esse usuário ou e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-email': 'Usuário ou e-mail inválido.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes de fazer isso.',
    'auth/operation-not-allowed': 'O login por e-mail e senha não está ativado no Firebase (Authentication > Método de login).',
    'auth/user-disabled': 'Este acesso foi desativado.',
    'permission-denied': 'Você não tem permissão para fazer isso. Confira as regras do Firestore.',
    'unavailable': 'Sem conexão no momento. Tente de novo quando a internet voltar.',
    'failed-precondition': 'O Firebase não conseguiu completar a operação. Recarregue a página.',
    'demo/indisponivel': 'Essa função só funciona com o Firebase configurado.',
  };
  if (mapa[codigo]) return mapa[codigo];
  return e?.message || 'Algo deu errado. Tente de novo.';
}

export function erroCom(code, message = '') {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---------------------------------------------------------------- diversos

export function gerarId(tam = 20) {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  const arr = crypto.getRandomValues(new Uint8Array(tam));
  for (let i = 0; i < tam; i++) r += c[arr[i] % c.length];
  return r;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function baixarArquivo(nome, conteudo, tipo = 'application/json') {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const telaPequena = () => window.matchMedia('(max-width: 899px)').matches;
const toqueGrosso = () => window.matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- formulários

// Monta um campo de formulário com rótulo
export function campo(o) {
  const {
    rotulo, nome, tipo = 'text', valor = '', opcoes = [], obrigatorio = false,
    dica = '', classe = '', attrs = '', placeholder = '', linhas = 3,
  } = o;
  const id = o.id || `f-${nome}`;
  const req = obrigatorio ? 'required' : '';
  let entrada;
  if (tipo === 'select') {
    const ops = opcoes.map(op => {
      const [v, t] = Array.isArray(op) ? op : [op, op];
      return `<option value="${esc(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('');
    entrada = `<select id="${id}" name="${nome}" ${req} ${attrs}>${ops}</select>`;
  } else if (tipo === 'textarea') {
    entrada = `<textarea id="${id}" name="${nome}" rows="${linhas}" placeholder="${esc(placeholder)}" ${req} ${attrs}>${esc(valor)}</textarea>`;
  } else {
    entrada = `<input id="${id}" name="${nome}" type="${tipo}" value="${esc(valor)}" placeholder="${esc(placeholder)}" ${req} ${attrs}>`;
  }
  return `<div class="campo ${classe}">
    <label for="${id}">${esc(rotulo)}${obrigatorio ? '<span class="obrig" aria-hidden="true"> *</span>' : ''}</label>
    ${entrada}
    ${dica ? `<small class="dica">${esc(dica)}</small>` : ''}
  </div>`;
}

export const ATTR_DECIMAL = 'inputmode="decimal" autocomplete="off"';

export function dadosForm(form) {
  const d = {};
  new FormData(form).forEach((v, k) => { d[k] = typeof v === 'string' ? v.trim() : v; });
  return d;
}

// Aplica máscara de telefone/documento enquanto digita
export function mascarar(input, tipo) {
  if (!input) return;
  const f = tipo === 'telefone' ? formatarTelefone : formatarDocumento;
  input.addEventListener('input', () => { input.value = f(input.value); });
}

// Botão com estado "salvando..."
export async function comCarregando(botao, fn) {
  if (!botao) return fn();
  const texto = botao.innerHTML;
  botao.disabled = true;
  botao.classList.add('carregando');
  try {
    return await fn();
  } finally {
    botao.disabled = false;
    botao.classList.remove('carregando');
    botao.innerHTML = texto;
  }
}

// ---------------------------------------------------------------- avisos (toast)

export function toast(msg, tipo = 'ok') {
  let area = $('#toasts');
  if (!area) {
    area = document.createElement('div');
    area.id = 'toasts';
    area.setAttribute('role', 'status');
    area.setAttribute('aria-live', 'polite');
    document.body.appendChild(area);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.innerHTML = `${icone(tipo === 'erro' ? 'alerta' : 'check')}<span>${esc(msg)}</span>`;
  area.appendChild(t);
  setTimeout(() => {
    t.classList.add('saindo');
    setTimeout(() => t.remove(), 300);
  }, tipo === 'erro' ? 6000 : 3000);
}

// ---------------------------------------------------------------- janelas modais

const pilha = [];

export function modaisAbertos() {
  return pilha;
}

export function fecharTodosModais() {
  [...pilha].reverse().forEach(m => m.fechar());
}

/**
 * Abre uma janela por cima da tela.
 * corpo/rodape: HTML. fecharFora: fecha clicando fora ou com Esc (padrão: true).
 * aoMontar(m): chamado depois de criar; m.el é a janela, m.corpo a área de conteúdo.
 * Defina m.atualizar = () => {...} para a janela se redesenhar quando os dados mudarem.
 */
export function abrirModal({ titulo, corpo = '', rodape = '', classe = '', fecharFora = true, aoMontar, aoFechar }) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal ${classe}" role="dialog" aria-modal="true" aria-labelledby="mt-${pilha.length}" tabindex="-1">
      <header class="modal-topo">
        <h2 id="mt-${pilha.length}">${titulo}</h2>
        <button type="button" class="btn-icone" data-fechar aria-label="Fechar">${icone('x')}</button>
      </header>
      <div class="modal-corpo">${corpo}</div>
      ${rodape ? `<footer class="modal-rodape">${rodape}</footer>` : ''}
    </div>`;
  const anterior = document.activeElement;
  document.body.appendChild(fundo);
  document.body.classList.add('com-modal');

  const m = {
    fundo,
    el: fundo.querySelector('.modal'),
    corpo: fundo.querySelector('.modal-corpo'),
    rodape: fundo.querySelector('.modal-rodape'),
    fecharFora,
    atualizar: null,
    fechado: false,
    fechar() {
      if (m.fechado) return;
      m.fechado = true;
      const i = pilha.indexOf(m);
      if (i >= 0) pilha.splice(i, 1);
      fundo.classList.add('saindo');
      setTimeout(() => fundo.remove(), 160);
      if (!pilha.length) document.body.classList.remove('com-modal');
      try { aoFechar?.(); } catch (e) { console.error(e); }
      if (anterior && document.contains(anterior)) anterior.focus?.({ preventScroll: true });
    },
  };

  fundo.addEventListener('mousedown', e => { m._cliqueFora = e.target === fundo; });
  fundo.addEventListener('click', e => {
    if (e.target.closest('[data-fechar]')) { m.fechar(); return; }
    if (e.target === fundo && m._cliqueFora && m.fecharFora) m.fechar();
  });

  pilha.push(m);
  aoMontar?.(m);

  requestAnimationFrame(() => {
    const alvo = m.el.querySelector('[autofocus]');
    if (alvo && !toqueGrosso()) alvo.focus();
    else m.el.focus({ preventScroll: true });
  });
  return m;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !pilha.length) return;
  const topo = pilha[pilha.length - 1];
  if (topo.fecharFora) topo.fechar();
});

/** Pergunta sim/não. Retorna Promise<boolean>. */
export function confirmar(mensagem, { titulo = 'Confirmar', sim = 'Confirmar', nao = 'Cancelar', perigo = false, detalhe = '' } = {}) {
  return new Promise(resolve => {
    let resposta = false;
    abrirModal({
      titulo: esc(titulo),
      classe: 'modal-pequeno',
      corpo: `<p class="confirmar-texto">${esc(mensagem)}</p>${detalhe}`,
      rodape: `<button type="button" class="btn" data-fechar>${esc(nao)}</button>
               <button type="button" class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" data-sim>${esc(sim)}</button>`,
      aoMontar(m) {
        m.el.querySelector('[data-sim]').addEventListener('click', () => { resposta = true; m.fechar(); });
        requestAnimationFrame(() => m.el.querySelector('[data-sim]').focus());
      },
      aoFechar() { resolve(resposta); },
    });
  });
}

// ---------------------------------------------------------------- pedaços de interface

export function vazio(texto, acao = '') {
  return `<div class="vazio"><p>${esc(texto)}</p>${acao}</div>`;
}

export function carregandoHtml(texto = 'Carregando…') {
  return `<div class="vazio carregando-bloco"><span class="giro" aria-hidden="true"></span><p>${esc(texto)}</p></div>`;
}

export function avatar(nome, classe = '') {
  return `<span class="avatar ${classe}" aria-hidden="true">${esc(iniciais(nome))}</span>`;
}

// ---------------------------------------------------------------- ícones (SVG em linha)

const ICONES = {
  vidro: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 12.5 12.5 8M8 17 16 9"/>',
  inicio: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
  servicos: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.6 6.5-5.6s5.7 2 6.5 5.6"/><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4"/><path d="M18 14.6c1.8.8 3 2.6 3.5 5.4"/>',
  estoque: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  financeiro: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  equipe: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6.5 8-6.5s7 2.5 8 6.5"/>',
  configuracoes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  mais: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  novo: '<path d="M12 5v14M5 12h14"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sair: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9.5 8 5.5 12l4 4M5.5 12H15"/>',
  conversa: '<path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.3-4A8 8 0 1 1 20 11.5z"/>',
  telefone: '<path d="M5 3.5h3.5l1.5 4-2.2 1.4a11 11 0 0 0 5.3 5.3l1.4-2.2 4 1.5V17a2.5 2.5 0 0 1-2.7 2.5A16 16 0 0 1 2.5 6.2 2.5 2.5 0 0 1 5 3.5z"/>',
  imprimir: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  lixeira: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  avancar: '<path d="m9 6 6 6-6 6"/>',
  voltar: '<path d="m15 6-6 6 6 6"/>',
  alerta: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  entrada: '<path d="M12 3.5v11M7.5 10 12 14.5l4.5-4.5"/><path d="M4 14.5V20h16v-5.5"/>',
  saida: '<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8"/><path d="M4 14.5V20h16v-5.5"/>',
  ajuste: '<path d="M5 9h14M5 15h14"/>',
  historico: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 3.5V8H8"/><path d="M12 8v4l3 2"/>',
  baixar: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 20h14"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  quadro: '<rect x="3.5" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="4.5" height="11" rx="1"/><rect x="16" y="4" width="4.5" height="7" rx="1"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  pegar: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.8-3.5 3.4-5.5 6.5-5.5 1.6 0 3 .5 4.2 1.4M18 14v6M15 17h6"/>',
  material: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 12.5 9 5 9-5"/>',
  nota: '<path d="M4 5h16v11H9l-5 4z"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6.5 8-6.5s7 2.5 8 6.5"/>',
  receber: '<path d="M12 3v18M16.5 7.5c-.6-1.5-2.3-2.5-4.5-2.5-2.5 0-4.5 1.4-4.5 3.3 0 4.4 9 2.4 9 6.9 0 1.9-2 3.3-4.5 3.3-2.3 0-4.1-1.1-4.7-2.8"/>',
  olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  reabrir: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  compartilhar: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.7 6.6-3.9M8.7 13.3l6.6 3.9"/>',
  documento: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
};

export function icone(nome, classe = '') {
  return `<svg class="ico ${classe}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nome] || ''}</svg>`;
}
