// Ponto de partida: login, montagem da tela, menu e navegação entre as seções.
import { db, erroCarga } from './db.js';
import { MODO_DEMO } from './config.js';
import { estado, ehAdmin, aoMudarDados, notificar, limparEstado } from './estado.js';
import {
  $, $$, esc, icone, toast, abrirModal, modaisAbertos, fecharTodosModais, mensagemErro, emailDoLogin,
  loginExibicao, avatar, primeiroNome, comCarregando, dadosForm, campo, emailReal,
} from './util.js';
import { atrasado, estoqueBaixo } from './regras.js';
import telaPainel from './telas/painel.js';
import telaServicos from './telas/servicos.js';
import telaClientes from './telas/clientes.js';
import telaEstoque from './telas/estoque.js';
import telaFinanceiro from './telas/financeiro.js';
import telaEquipe from './telas/equipe.js';
import telaConfiguracoes from './telas/configuracoes.js';
import { abrirConta } from './telas/conta.js';

const ROTAS = {
  inicio:        { tela: telaPainel,        nome: 'Início',        icone: 'inicio' },
  servicos:      { tela: telaServicos,      nome: 'Serviços',      icone: 'servicos' },
  clientes:      { tela: telaClientes,      nome: 'Clientes',      icone: 'clientes' },
  estoque:       { tela: telaEstoque,       nome: 'Estoque',       icone: 'estoque' },
  financeiro:    { tela: telaFinanceiro,    nome: 'Financeiro',    icone: 'financeiro', admin: true },
  equipe:        { tela: telaEquipe,        nome: 'Equipe',        icone: 'equipe', admin: true },
  configuracoes: { tela: telaConfiguracoes, nome: 'Configurações', icone: 'configuracoes', admin: true },
};
const ROTAS_BARRA = ['inicio', 'servicos', 'clientes', 'estoque'];

const app = document.getElementById('app');
let ouvinteSessao = null;
let ouvintePerfil = null;
let ouvintesDados = [];
let telaAtual = null;
let rotaAtual = '';
let instalando = false;
let mensagemSaida = '';

// ================================================================ inicialização

function iniciar() {
  if (erroCarga || !db) {
    app.innerHTML = `<div class="tela-entrada"><div class="cartao-entrada">
        ${marcaHtml()}
        <h2>Não foi possível abrir o sistema</h2>
        <p>Confira a conexão com a internet e recarregue a página. Se o problema continuar, veja os dados do Firebase no arquivo <code>js/config.js</code>.</p>
        <p class="texto-suave"><small>${esc(erroCarga?.message || '')}</small></p>
        <button type="button" class="btn btn-primario" onclick="location.reload()">Recarregar</button>
      </div></div>`;
    return;
  }

  db.aoErro = e => toast(mensagemErro(e), 'erro');
  aoMudarDados(aoMudar);
  window.addEventListener('hashchange', () => { if (estado.usuario) irPara(); });

  ouvinteSessao = db.aoMudarSessao(async sessao => {
    if (instalando) return;
    pararTudo();
    if (!sessao) {
      limparEstado();
      if (!MODO_DEMO) {
        carregando();
        if (!(await db.sistemaInstalado())) { mostrarInstalacao(); return; }
      }
      mostrarEntrada(mensagemSaida);
      return;
    }
    iniciarSessao(sessao);
  });

  registrarServiceWorker();
}

function pararDados() {
  ouvintesDados.forEach(f => { try { f(); } catch {} });
  ouvintesDados = [];
}

function pararTudo() {
  pararDados();
  if (ouvintePerfil) { try { ouvintePerfil(); } catch {} ouvintePerfil = null; }
  fecharTodosModais();
}

function carregando(texto = 'Abrindo…') {
  app.innerHTML = `<div class="tela-entrada"><div class="cartao-entrada cartao-carregando">${marcaHtml()}<span class="giro" aria-hidden="true"></span><p>${esc(texto)}</p></div></div>`;
}

function iniciarSessao(sessao) {
  estado.sessao = sessao;
  carregando('Carregando seus dados…');
  let primeiraVez = true;
  ouvintePerfil = db.ouvirDoc('usuarios', sessao.uid, perfil => {
    if (!perfil || perfil.ativo === false || !perfil.papel) {
      const msg = perfil?.ativo === false
        ? 'Seu acesso foi desativado. Fale com o administrador.'
        : 'Seu usuário ainda não foi liberado no sistema. Fale com o administrador.';
      pararTudo();
      limparEstado();
      mensagemSaida = msg;
      mostrarEntrada(msg);
      db.sair();
      return;
    }
    mensagemSaida = '';
    const papelMudou = estado.usuario && estado.usuario.papel !== perfil.papel;
    estado.usuario = perfil;
    if (primeiraVez || papelMudou) {
      primeiraVez = false;
      iniciarDados();
      montarLayout();
      irPara();
    } else {
      atualizarCasca();
    }
  }, e => {
    pararTudo();
    mensagemSaida = mensagemErro(e);
    mostrarEntrada(mensagemSaida);
    db.sair();
  });
}

function iniciarDados() {
  pararDados();
  estado.carregado.clear();
  const colecoes = [
    ['clientes', {}],
    ['produtos', {}],
    ['servicos', {}],
    ['usuarios', {}],
    ['movimentos', { ordem: 'data', desc: true, limite: 300 }],
  ];
  if (ehAdmin()) colecoes.push(['lancamentos', {}]);
  else { estado.lancamentos = []; estado.carregado.add('lancamentos'); }

  for (const [c, op] of colecoes) {
    ouvintesDados.push(db.ouvir(c, docs => {
      estado[c] = docs;
      estado.carregado.add(c);
      notificar();
    }, { ...op, erro: e => toast(`Erro ao carregar ${c}: ${mensagemErro(e)}`, 'erro') }));
  }
  ouvintesDados.push(db.ouvirDoc('sistema', 'empresa', d => {
    estado.empresa = d || {};
    notificar();
  }));
}

// Quando qualquer dado muda: atualiza a tela atual, as janelas abertas e os contadores do menu
function aoMudar() {
  if (!estado.usuario) return;
  try { telaAtual?.atualizar?.(); } catch (e) { console.error(e); }
  for (const m of modaisAbertos()) {
    try { m.atualizar?.(); } catch (e) { console.error(e); }
  }
  atualizarCasca();
}

// ================================================================ layout

// Logo da Concept Vidros. "negativo" é a versão branca, para fundo azul-marinho.
function marcaHtml(negativo = false) {
  return `<div class="marca"><img class="marca-logo" src="img/${negativo ? 'logo-negativo' : 'logo'}.svg" alt="Concept Vidros"></div>`;
}

function rotasPermitidas() {
  return Object.entries(ROTAS).filter(([, r]) => !r.admin || ehAdmin());
}

function montarLayout() {
  const u = estado.usuario;
  const links = rotasPermitidas().map(([id, r]) =>
    `<a href="#${id}" class="nav-item" data-rota="${id}">${icone(r.icone)}<span>${r.nome}</span><span class="nav-n" data-n="${id}" hidden></span></a>`).join('');
  const barra = ROTAS_BARRA.map(id => {
    const r = ROTAS[id];
    return `<a href="#${id}" class="barra-item" data-rota="${id}">${icone(r.icone)}<span>${r.nome}</span><span class="nav-n" data-n="${id}" hidden></span></a>`;
  }).join('');

  app.innerHTML = `
    ${db.demo ? `<div class="faixa-demo" role="note">${icone('alerta')}<span>Modo demonstração: os dados ficam só neste navegador.<span class="so-grande"> Configure o Firebase em <code>js/config.js</code> para usar de verdade.</span></span></div>` : ''}
    <div class="casca">
      <aside class="lateral" aria-label="Menu principal">
        <div class="lateral-topo" id="marca-lateral">${marcaHtml(true)}</div>
        <nav class="nav-lateral">${links}</nav>
        <div class="lateral-rodape">
          <button type="button" class="usuario-botao" id="btn-conta">${avatar(u.nome)}<span><strong>${esc(u.nome)}</strong><small>${u.papel === 'admin' ? 'Administrador' : 'Funcionário'}</small></span></button>
          <button type="button" class="btn-icone" id="btn-sair" aria-label="Sair" title="Sair">${icone('sair')}</button>
        </div>
      </aside>
      <div class="principal">
        <header class="topo-movel">
          <div id="marca-movel">${marcaHtml(true)}</div>
          <button type="button" class="usuario-mini" id="btn-conta-movel" aria-label="Minha conta">${avatar(u.nome)}</button>
        </header>
        <main id="conteudo" tabindex="-1"></main>
      </div>
    </div>
    <nav class="barra-inferior" aria-label="Menu">
      ${barra}
      <button type="button" class="barra-item" id="btn-mais">${icone('mais')}<span>Mais</span></button>
    </nav>`;

  $('#btn-sair').addEventListener('click', sair);
  $('#btn-conta').addEventListener('click', abrirConta);
  $('#btn-conta-movel').addEventListener('click', abrirConta);
  $('#btn-mais').addEventListener('click', abrirMenuMais);
  atualizarCasca();
}

function atualizarCasca() {
  if (!$('.casca')) return;
  const nome = estado.empresa?.nome || 'Concept Vidros';

  const contadores = {
    servicos: estado.servicos.filter(atrasado).length,
    estoque: estado.produtos.filter(estoqueBaixo).length,
  };
  $$('[data-n]').forEach(el => {
    const n = contadores[el.dataset.n] || 0;
    el.hidden = !n;
    el.textContent = n;
    el.title = el.dataset.n === 'servicos' ? `${n} atrasado(s)` : `${n} com estoque baixo`;
  });
  if (rotaAtual) document.title = `${ROTAS[rotaAtual].nome} | ${nome}`;
}

function abrirMenuMais() {
  const extras = rotasPermitidas().filter(([id]) => !ROTAS_BARRA.includes(id));
  abrirModal({
    titulo: 'Mais opções',
    classe: 'modal-pequeno folha-mais',
    corpo: `<nav class="menu-mais">
        ${extras.map(([id, r]) => `<a href="#${id}" data-fechar>${icone(r.icone)}<span>${r.nome}</span></a>`).join('')}
        <button type="button" data-conta>${icone('chave')}<span>Minha conta</span></button>
        <button type="button" data-sair>${icone('sair')}<span>Sair</span></button>
      </nav>`,
    aoMontar(m) {
      $('[data-conta]', m.el).addEventListener('click', () => { m.fechar(); abrirConta(); });
      $('[data-sair]', m.el).addEventListener('click', () => { m.fechar(); sair(); });
    },
  });
}

async function sair() {
  mensagemSaida = '';
  pararTudo();
  limparEstado();
  telaAtual = null;
  rotaAtual = '';
  try { await db.sair(); } catch (e) { toast(mensagemErro(e), 'erro'); }
}

// ================================================================ navegação

function lerHash() {
  const [rota, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { rota, params };
}

function irPara() {
  const { rota, params } = lerHash();
  let id = ROTAS[rota] ? rota : 'inicio';
  if (ROTAS[id].admin && !ehAdmin()) id = 'inicio';
  const conteudo = $('#conteudo');
  if (!conteudo) return;

  fecharTodosModais();
  rotaAtual = id;
  telaAtual = ROTAS[id].tela;
  conteudo.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    telaAtual.montar(conteudo, params);
  } catch (e) {
    console.error(e);
    conteudo.innerHTML = `<div class="vazio"><p>Erro ao abrir esta tela: ${esc(e.message)}</p></div>`;
  }

  $$('[data-rota]').forEach(a => {
    const ativo = a.dataset.rota === id;
    a.classList.toggle('ativo', ativo);
    if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#btn-mais')?.classList.toggle('ativo', !ROTAS_BARRA.includes(id));
  atualizarCasca();
}

// ================================================================ login

function mostrarEntrada(mensagem = '') {
  telaAtual = null;
  rotaAtual = '';
  const usuariosDemo = db.demo ? db.usuariosDemo() : [];
  app.innerHTML = `
    <div class="tela-entrada">
      <div class="cartao-entrada">
        ${marcaHtml()}
        <h1>Entrar</h1>
        ${mensagem ? `<p class="aviso aviso-alerta">${icone('alerta')}<span>${esc(mensagem)}</span></p>` : ''}
        <form id="form-entrar" class="form-grade" novalidate>
          ${campo({ rotulo: 'Usuário ou e-mail', nome: 'login', classe: 'inteiro', obrigatorio: true, attrs: 'autocomplete="username" autocapitalize="none" spellcheck="false" autofocus' })}
          <div class="campo inteiro">
            <label for="f-senha">Senha</label>
            <div class="campo-senha">
              <input id="f-senha" name="senha" type="password" autocomplete="current-password" required>
              <button type="button" class="btn-icone" id="ver-senha" aria-label="Mostrar senha">${icone('olho')}</button>
            </div>
          </div>
          <button type="submit" class="btn btn-primario btn-largo inteiro">Entrar</button>
        </form>
        ${!db.demo ? '<button type="button" class="link" id="esqueci">Esqueci minha senha</button>' : ''}
        ${db.demo ? `<div class="demo-acessos">
            <h2>Modo demonstração</h2>
            <p>Entre com um dos usuários de exemplo para conhecer o sistema. Senha de todos: <code>123456</code></p>
            <div class="demo-botoes">
              ${usuariosDemo.map(u => `<button type="button" class="btn" data-demo="${u.id}">${avatar(u.nome)}<span><strong>${esc(primeiroNome(u.nome))}</strong><small>${u.papel === 'admin' ? 'Administrador' : 'Funcionário'} (${esc(loginExibicao(u.email))})</small></span></button>`).join('')}
            </div>
          </div>` : ''}
      </div>
    </div>`;

  const form = $('#form-entrar');
  $('#ver-senha').addEventListener('click', () => {
    const s = form.senha;
    s.type = s.type === 'password' ? 'text' : 'password';
    $('#ver-senha').setAttribute('aria-label', s.type === 'password' ? 'Mostrar senha' : 'Esconder senha');
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = dadosForm(form);
    const email = emailDoLogin(d.login);
    if (!email) { toast('Digite seu usuário.', 'erro'); form.login.focus(); return; }
    if (!form.senha.value) { toast('Digite a senha.', 'erro'); form.senha.focus(); return; }
    await comCarregando($('[type=submit]', form), async () => {
      try { await db.entrar(email, form.senha.value); }
      catch (err) { toast(mensagemErro(err), 'erro'); }
    });
  });
  $('#esqueci')?.addEventListener('click', async () => {
    const email = emailDoLogin(form.login.value);
    if (!email || !emailReal(email)) {
      toast('Digite seu e-mail no campo acima. Se você entra com usuário (sem e-mail), peça ao administrador um novo acesso.', 'erro');
      form.login.focus();
      return;
    }
    try { await db.enviarRedefinicao(email); toast('Se esse e-mail estiver cadastrado, você vai receber um link para criar nova senha.'); }
    catch (err) { toast(mensagemErro(err), 'erro'); }
  });
  $$('[data-demo]').forEach(b => b.addEventListener('click', () => db.entrarComo(b.dataset.demo)));
}

// ================================================================ primeiro acesso (Firebase)

function mostrarInstalacao() {
  app.innerHTML = `
    <div class="tela-entrada">
      <div class="cartao-entrada cartao-largo">
        ${marcaHtml()}
        <h1>Primeiro acesso</h1>
        <p>O sistema ainda não tem ninguém cadastrado. Crie a conta do administrador: quem fizer isso primeiro vira o dono do sistema, e depois cadastra os funcionários.</p>
        <form id="form-instalar" class="form-grade" novalidate autocomplete="off">
          ${campo({ rotulo: 'Nome da vidraçaria', nome: 'empresa', valor: 'Concept Vidros', obrigatorio: true, classe: 'inteiro', attrs: 'autofocus' })}
          ${campo({ rotulo: 'Seu nome', nome: 'nome', obrigatorio: true, classe: 'inteiro' })}
          ${campo({ rotulo: 'Seu e-mail', nome: 'email', tipo: 'email', obrigatorio: true, classe: 'inteiro', attrs: 'autocomplete="email" autocapitalize="none"', dica: 'Use um e-mail de verdade: é por ele que você recupera a senha.' })}
          ${campo({ rotulo: 'Senha', nome: 'senha', tipo: 'password', obrigatorio: true, attrs: 'autocomplete="new-password" minlength="6"' })}
          ${campo({ rotulo: 'Repita a senha', nome: 'repetir', tipo: 'password', obrigatorio: true, attrs: 'autocomplete="new-password"' })}
          <button type="submit" class="btn btn-primario btn-largo inteiro">Criar conta de administrador</button>
        </form>
      </div>
    </div>`;
  const form = $('#form-instalar');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = dadosForm(form);
    if (!d.empresa || !d.nome) { toast('Preencha o nome da vidraçaria e o seu nome.', 'erro'); return; }
    if (!d.email || !d.email.includes('@')) { toast('Digite um e-mail válido.', 'erro'); form.email.focus(); return; }
    if ((d.senha || '').length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.', 'erro'); form.senha.focus(); return; }
    if (d.senha !== d.repetir) { toast('As senhas não são iguais.', 'erro'); form.repetir.focus(); return; }
    await comCarregando($('[type=submit]', form), async () => {
      instalando = true;
      try {
        const sessao = await db.instalar({ nome: d.nome, email: d.email.toLowerCase(), senha: d.senha, empresa: d.empresa });
        instalando = false;
        toast('Tudo pronto! Agora cadastre sua equipe em Equipe.');
        iniciarSessao(sessao);
      } catch (err) {
        instalando = false;
        toast(mensagemErro(err), 'erro');
        if (err.code === 'permission-denied') {
          toast('Outra pessoa já fez o primeiro acesso, ou as regras do Firestore não foram publicadas.', 'erro');
        }
      }
    });
  });
}

// ================================================================ app instalável

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname) || location.hostname.startsWith('192.168.');
  if (local) return; // no Live Server fica desligado, para não guardar arquivos velhos
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker não registrado', e));
}

iniciar();
