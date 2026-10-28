// Tela inicial. Administrador: visão geral do negócio. Funcionário: o dia dele.
import { estado, ehAdmin, carregou } from '../estado.js';
import { STATUS_EM_ANDAMENTO } from '../constantes.js';
import { $, esc, icone, moeda, dataCurta, hoje, mesAtual, nomeMes, saudacao, dataPorExtenso, primeiroNome, num, vazio, carregandoHtml, lerNumero } from '../util.js';
import { atrasado, ordenarFila, estoqueBaixo, estoqueZerado } from '../regras.js';
import { fichaServico, ligarFichas, abrirFormServico } from './servicos.js';
import { totaisGerais } from './financeiro.js';
import { graficoMensal, resumoMensal, ligarDicas } from '../graficos.js';
import { abrirProduto } from './estoque.js';

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
    ligarDicas(raiz);
    $('#btn-novo-inicio', el).addEventListener('click', () => abrirFormServico());
    raiz.addEventListener('click', e => {
      const p = e.target.closest('[data-abrir-produto]');
      if (p) abrirProduto(p.dataset.abrirProduto);
    });
    this.atualizar();
  },

  atualizar() {
    if (!raiz || !document.contains(raiz)) return;
    $('#saudacao').textContent = `${saudacao()}, ${primeiroNome(estado.usuario?.nome)}`;
    if (!carregou('servicos')) { raiz.innerHTML = carregandoHtml(); return; }
    raiz.innerHTML = ehAdmin() ? painelAdmin() : painelFuncionario();
  },
};

function blocoEstoqueBaixo(limite = 6, comQuantidade = true) {
  const baixos = estado.produtos.filter(p => estoqueBaixo(p) || (estoqueZerado(p) && lerNumero(p.estoqueMinimo) > 0))
    .sort((a, b) => lerNumero(a.quantidade) / (lerNumero(a.estoqueMinimo) || 1) - lerNumero(b.quantidade) / (lerNumero(b.estoqueMinimo) || 1));
  return `<section class="painel">
      <div class="painel-cab"><h2>Estoque baixo</h2>${baixos.length ? '<a href="#estoque?baixo=1" class="link">Ver estoque</a>' : ''}</div>
      ${baixos.length ? `<ul class="lista-compacta">${baixos.slice(0, limite).map(p => `<li>
          <button type="button" class="link-linha" data-abrir-produto="${p.id}">
            <span>${esc(p.nome)}</span>
            ${comQuantidade ? `<span class="${estoqueZerado(p) ? 'texto-perigo' : 'texto-alerta'}"><strong>${num(p.quantidade, 3)}</strong> / mín. ${num(p.estoqueMinimo, 3)} ${esc(p.unidade)}</span>` : ''}
          </button></li>`).join('')}</ul>
          ${baixos.length > limite ? `<p class="texto-suave">e mais ${baixos.length - limite}</p>` : ''}`
        : '<p class="texto-ok">Tudo acima do mínimo.</p>'}
    </section>`;
}

function painelAdmin() {
  const servs = estado.servicos;
  const andamento = servs.filter(s => STATUS_EM_ANDAMENTO.includes(s.status));
  const atrasados = servs.filter(atrasado);
  const orcamentos = servs.filter(s => s.status === 'orcamento');
  const prontos = servs.filter(s => s.status === 'pronto');
  const semResp = andamento.filter(s => !s.responsavelId);
  const mes = mesAtual();
  const doMes = estado.lancamentos.filter(l => String(l.data || '').startsWith(mes) && l.status === 'pago');
  const entrou = doMes.filter(l => l.tipo === 'receita').reduce((t, l) => t + lerNumero(l.valor), 0);
  const saiu = doMes.filter(l => l.tipo === 'despesa').reduce((t, l) => t + lerNumero(l.valor), 0);
  const g = totaisGerais();
  const fila = [...andamento].sort(ordenarFila).slice(0, 8);
  const contas = [...g.vencidas, ...g.proximas].sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const avisos = [];
  if (atrasados.length) avisos.push(`<a class="aviso aviso-perigo" href="#servicos?filtro=atrasados">${icone('alerta')}<span><strong>${atrasados.length} ${atrasados.length === 1 ? 'serviço atrasado' : 'serviços atrasados'}</strong>, a data prevista já passou.</span></a>`);
  if (g.vencidas.length) avisos.push(`<a class="aviso aviso-alerta" href="#financeiro?aba=pagar">${icone('alerta')}<span><strong>${g.vencidas.length} ${g.vencidas.length === 1 ? 'conta vencida' : 'contas vencidas'}</strong> somando ${moeda(g.vencidas.reduce((t, l) => t + lerNumero(l.valor), 0))}.</span></a>`);
  if (semResp.length) avisos.push(`<a class="aviso" href="#servicos?filtro=aprovado">${icone('pegar')}<span>${semResp.length} ${semResp.length === 1 ? 'serviço aprovado está' : 'serviços aprovados estão'} sem responsável.</span></a>`);

  return `
    ${avisos.length ? `<div class="avisos">${avisos.join('')}</div>` : ''}
    <div class="grade-kpi">
      <a class="kpi" href="#servicos?filtro=fila"><span class="kpi-rotulo">Em andamento</span><strong class="kpi-valor">${andamento.length}</strong><span class="kpi-sub">${prontos.length} ${prontos.length === 1 ? 'pronto' : 'prontos'} para entregar</span></a>
      <a class="kpi" href="#servicos?filtro=orcamento"><span class="kpi-rotulo">Orçamentos abertos</span><strong class="kpi-valor">${orcamentos.length}</strong><span class="kpi-sub">${moeda(orcamentos.reduce((t, s) => t + lerNumero(s.valorTotal), 0))} em negociação</span></a>
      <a class="kpi" href="#financeiro"><span class="kpi-rotulo">Entrou em ${esc(nomeMes(mes, false))}</span><strong class="kpi-valor texto-ok">${moeda(entrou)}</strong><span class="kpi-sub">Saiu ${moeda(saiu)}</span></a>
      <a class="kpi" href="#financeiro?aba=receber"><span class="kpi-rotulo">A receber</span><strong class="kpi-valor">${moeda(g.aReceber)}</strong><span class="kpi-sub">A pagar ${moeda(g.aPagar)}</span></a>
    </div>

    <div class="grade-inicio">
      <section class="painel painel-fila">
        <div class="painel-cab"><h2>Próximos da fila</h2><a href="#servicos" class="link">Ver todos</a></div>
        ${fila.length ? `<div class="grade-fichas grade-compacta">${fila.map(s => fichaServico(s)).join('')}</div>`
          : vazio('Nenhum serviço em andamento.', `<button type="button" class="btn btn-primario" data-novo-servico>${icone('novo')} Novo serviço</button>`)}
      </section>
      <div class="coluna-lateral">
        <section class="painel">
          <div class="painel-cab"><h2>Contas para pagar</h2><a href="#financeiro?aba=pagar" class="link">Ver todas</a></div>
          ${contas.length ? `<ul class="lista-compacta">${contas.slice(0, 6).map(l => `<li>
              <span><span class="${l.data < hoje() ? 'texto-perigo' : ''}">${dataCurta(l.data)}</span> ${esc(l.descricao)}</span>
              <strong>${moeda(l.valor)}</strong></li>`).join('')}</ul>`
            : '<p class="texto-ok">Nada vencendo nos próximos 7 dias.</p>'}
        </section>
        ${blocoEstoqueBaixo()}
      </div>
    </div>

    <section class="painel">
      <div class="painel-cab"><h2>Receitas e despesas</h2><a href="#financeiro?aba=relatorios" class="link">Relatórios</a></div>
      ${graficoMensal(resumoMensal(mes, 6))}
    </section>`;
}

function painelFuncionario() {
  const eu = estado.usuario?.id;
  const meus = estado.servicos.filter(s => s.responsavelId === eu && STATUS_EM_ANDAMENTO.includes(s.status)).sort(ordenarFila);
  const livres = estado.servicos.filter(s => !s.responsavelId && STATUS_EM_ANDAMENTO.includes(s.status)).sort(ordenarFila);
  const meusAtrasados = meus.filter(atrasado);
  const hojeOuAntes = meus.filter(s => s.dataPrevista && s.dataPrevista <= hoje());
  const prontos = meus.filter(s => s.status === 'pronto');

  return `
    ${meusAtrasados.length ? `<div class="avisos"><a class="aviso aviso-perigo" href="#servicos?filtro=atrasados&meus=1">${icone('alerta')}<span><strong>${meusAtrasados.length} ${meusAtrasados.length === 1 ? 'serviço seu está atrasado' : 'serviços seus estão atrasados'}</strong>.</span></a></div>` : ''}
    <div class="grade-kpi grade-kpi-3">
      <a class="kpi" href="#servicos?meus=1"><span class="kpi-rotulo">Meus serviços</span><strong class="kpi-valor">${meus.length}</strong></a>
      <div class="kpi"><span class="kpi-rotulo">Para hoje ou antes</span><strong class="kpi-valor ${hojeOuAntes.length ? 'texto-alerta' : ''}">${hojeOuAntes.length}</strong></div>
      <div class="kpi"><span class="kpi-rotulo">Prontos para entregar</span><strong class="kpi-valor">${prontos.length}</strong></div>
    </div>
    <section class="painel">
      <div class="painel-cab"><h2>Meus serviços</h2><a href="#servicos?meus=1" class="link">Ver na fila</a></div>
      ${meus.length ? `<div class="grade-fichas">${meus.map(s => fichaServico(s)).join('')}</div>`
        : vazio('Nenhum serviço com você agora. Pegue um da lista abaixo.')}
    </section>
    <section class="painel">
      <div class="painel-cab"><h2>Sem responsável</h2><span class="texto-suave">${livres.length}</span></div>
      ${livres.length ? `<div class="grade-fichas">${livres.map(s => fichaServico(s)).join('')}</div>`
        : '<p class="texto-suave">Todos os serviços aprovados já têm alguém cuidando.</p>'}
    </section>
    ${blocoEstoqueBaixo(8, true)}`;
}
