// Tela inicial. Administrador: o que precisa de atenção e as próximas entregas.
// Funcionário: os serviços dele e os que estão sem ninguém.
import { estado, ehAdmin, carregou } from '../estado.js';
import { STATUS_EM_ANDAMENTO, statusInfo } from '../constantes.js';
import { $, esc, icone, moeda, hoje, mesAtual, nomeMes, saudacao, dataPorExtenso, primeiroNome, vazio, carregandoHtml, lerNumero, dataRelativa } from '../util.js';
import { atrasado, ordenarFila, estoqueBaixo, numeroOS } from '../regras.js';
import { fichaServico, ligarFichas, abrirFormServico } from './servicos.js';
import { totaisGerais } from './financeiro.js';

let raiz = null;

export default {
  titulo: 'Início',

  montar(el) {
    el.innerHTML = `
      <div class="cab-tela cab-inicio">
        <div>
          <h1 id="saudacao"></h1>
          <p class="texto-suave">${esc(dataPorExtenso())}</p>
        </div>
        <div class="cab-acoes">
          <button type="button" class="btn btn-primario" id="btn-novo-inicio">${icone('novo')} Novo serviço</button>
        </div>
      </div>
      <div id="area-inicio"></div>`;
    raiz = $('#area-inicio', el);
    ligarFichas(raiz);
    $('#btn-novo-inicio', el).addEventListener('click', () => abrirFormServico());
    this.atualizar();
  },

  atualizar() {
    if (!raiz || !document.contains(raiz)) return;
    $('#saudacao').textContent = `${saudacao()}, ${primeiroNome(estado.usuario?.nome)}`;
    if (!carregou('servicos')) { raiz.innerHTML = carregandoHtml(); return; }
    raiz.innerHTML = ehAdmin() ? painelAdmin() : painelFuncionario();
  },
};

// Avisos curtos em uma linha só; cada um leva para onde resolver
function avisos(lista) {
  const itens = lista.filter(a => a.n > 0);
  if (!itens.length) return `<p class="tudo-certo">${icone('check')} Nada atrasado nem vencido.</p>`;
  return `<div class="pilulas">${itens.map(a =>
    `<a class="pilula ${a.tipo || ''}" href="${a.href}">${a.tipo ? icone('alerta') : ''}<strong>${a.n}</strong> ${esc(a.n === 1 ? a.um : a.varios)}</a>`).join('')}</div>`;
}

// Lista compacta: quando, cliente, tipo e etapa
function listaEntregas(servs) {
  return `<ul class="lista-entregas">${servs.map(s => {
    const late = atrasado(s);
    return `<li><button type="button" class="entrega" data-abrir-servico="${s.id}">
        <span class="entrega-quando ${late ? 'texto-perigo' : ''}">${s.dataPrevista ? esc(dataRelativa(s.dataPrevista)) : 'sem data'}</span>
        <span class="entrega-quem"><strong>${esc(s.clienteNome)}</strong><small>OS ${numeroOS(s.numero)}${s.tipo ? `, ${esc(s.tipo)}` : ''}${s.prioridade === 'urgente' ? ', urgente' : ''}</small></span>
        <span class="etiqueta et-st st-${s.status}">${esc(statusInfo(s.status).curto)}</span>
      </button></li>`;
  }).join('')}</ul>`;
}

function painelAdmin() {
  const servs = estado.servicos;
  const andamento = servs.filter(s => STATUS_EM_ANDAMENTO.includes(s.status));
  const mes = mesAtual();
  const entrou = estado.lancamentos
    .filter(l => l.tipo === 'receita' && l.status === 'pago' && String(l.data || '').startsWith(mes))
    .reduce((t, l) => t + lerNumero(l.valor), 0);
  const g = totaisGerais();
  const fila = [...andamento].sort(ordenarFila).slice(0, 6);

  return `
    ${avisos([
      { n: servs.filter(atrasado).length, um: 'serviço atrasado', varios: 'serviços atrasados', href: '#servicos?filtro=atrasados', tipo: 'pilula-perigo' },
      { n: g.vencidas.length, um: 'conta vencida', varios: 'contas vencidas', href: '#financeiro?aba=pagar', tipo: 'pilula-alerta' },
      { n: andamento.filter(s => !s.responsavelId).length, um: 'sem responsável', varios: 'sem responsável', href: '#servicos' },
      { n: estado.produtos.filter(estoqueBaixo).length, um: 'material acabando', varios: 'materiais acabando', href: '#estoque?baixo=1' },
    ])}

    <div class="grade-kpi grade-kpi-3">
      <a class="kpi" href="#servicos"><span class="kpi-rotulo">Em andamento</span><strong class="kpi-valor">${andamento.length}</strong></a>
      <a class="kpi" href="#financeiro"><span class="kpi-rotulo">Entrou em ${esc(nomeMes(mes, false))}</span><strong class="kpi-valor texto-ok">${moeda(entrou)}</strong></a>
      <a class="kpi" href="#financeiro?aba=receber"><span class="kpi-rotulo">A receber</span><strong class="kpi-valor">${moeda(g.aReceber)}</strong></a>
    </div>

    <section class="painel">
      <div class="painel-cab"><h2>Próximas entregas</h2><a href="#servicos" class="link">Ver a fila</a></div>
      ${fila.length ? listaEntregas(fila)
        : vazio('Nenhum serviço em andamento.', `<button type="button" class="btn btn-primario" data-novo-servico>${icone('novo')} Novo serviço</button>`)}
    </section>`;
}

function painelFuncionario() {
  const eu = estado.usuario?.id;
  const meus = estado.servicos.filter(s => s.responsavelId === eu && STATUS_EM_ANDAMENTO.includes(s.status)).sort(ordenarFila);
  const livres = estado.servicos.filter(s => !s.responsavelId && STATUS_EM_ANDAMENTO.includes(s.status)).sort(ordenarFila);

  return `
    ${avisos([
      { n: meus.filter(atrasado).length, um: 'serviço seu atrasado', varios: 'serviços seus atrasados', href: '#servicos?filtro=meus', tipo: 'pilula-perigo' },
      { n: estado.produtos.filter(estoqueBaixo).length, um: 'material acabando', varios: 'materiais acabando', href: '#estoque?baixo=1' },
    ])}
    <section class="painel">
      <div class="painel-cab"><h2>Meus serviços</h2><span class="texto-suave">${meus.length}</span></div>
      ${meus.length ? `<div class="grade-fichas">${meus.map(s => fichaServico(s)).join('')}</div>`
        : vazio('Nenhum serviço com você agora. Pegue um da lista abaixo.')}
    </section>
    <section class="painel">
      <div class="painel-cab"><h2>Para pegar</h2><span class="texto-suave">${livres.length}</span></div>
      ${livres.length ? `<div class="grade-fichas">${livres.map(s => fichaServico(s, { pegar: true })).join('')}</div>`
        : '<p class="texto-suave">Todos os serviços aprovados já têm alguém cuidando.</p>'}
    </section>`;
}
