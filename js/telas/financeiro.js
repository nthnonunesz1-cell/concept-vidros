// Financeiro (só administrador): lançamentos do mês, a receber, a pagar e relatórios.
import { estado, buscar, carregou } from '../estado.js';
import { CATEGORIAS_RECEITA, CATEGORIAS_DESPESA, FORMAS_PAGAMENTO, statusInfo } from '../constantes.js';
import {
  $, $$, esc, icone, moeda, numCampo, lerNumero, dataBR, dataCurta, hoje, mesAtual, somarMeses, nomeMes,
  contem, campo, ATTR_DECIMAL, dadosForm, abrirModal, confirmar, toast, mensagemErro, comCarregando,
  vazio, carregandoHtml, baixarArquivo, arred, diasEntre,
} from '../util.js';
import { saldoServico, totalPago, numeroOS } from '../regras.js';
import * as acoes from '../acoes.js';
import { abrirServico, abrirPagamento } from './servicos.js';
import { graficoMensal, resumoMensal, barrasHorizontais, ligarDicas } from '../graficos.js';

let mes = mesAtual();
let aba = 'lancamentos';
// lista: 'todos', 'receita', 'despesa' ou 'pendente'
const filtros = { lista: 'todos', busca: '' };
const FILTROS_LANC = [['todos', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas'], ['pendente', 'Pendentes']];
let raiz = null;

const noMes = (l, m = mes) => String(l.data || '').startsWith(m);
const soma = lista => arred(lista.reduce((t, l) => t + lerNumero(l.valor), 0));

function servicosComSaldo() {
  return estado.servicos.filter(s => saldoServico(s) > 0);
}

export function totaisGerais() {
  const lanc = estado.lancamentos;
  const receitasPendentes = lanc.filter(l => l.tipo === 'receita' && l.status === 'pendente');
  const despesasPendentes = lanc.filter(l => l.tipo === 'despesa' && l.status === 'pendente');
  const saldoServicos = arred(servicosComSaldo().reduce((t, s) => t + saldoServico(s), 0));
  return {
    aReceber: arred(saldoServicos + soma(receitasPendentes)),
    saldoServicos,
    aPagar: soma(despesasPendentes),
    vencidas: despesasPendentes.filter(l => l.data < hoje()),
    proximas: despesasPendentes.filter(l => l.data >= hoje() && diasEntre(hoje(), l.data) <= 7),
  };
}

export default {
  titulo: 'Financeiro',

  montar(el, params = {}) {
    if (params.aba) aba = params.aba;
    el.innerHTML = `
      <div class="cab-tela">
        <h1>Financeiro</h1>
        <div class="cab-acoes">
          <button type="button" class="btn" id="btn-nova-despesa">${icone('saida')} Nova despesa</button>
          <button type="button" class="btn btn-primario" id="btn-nova-receita">${icone('entrada')} Nova receita</button>
        </div>
      </div>
      <div class="navegador-mes">
        <button type="button" class="btn-icone" id="mes-anterior" aria-label="Mês anterior">${icone('voltar')}</button>
        <h2 id="mes-nome" aria-live="polite"></h2>
        <button type="button" class="btn-icone" id="mes-proximo" aria-label="Próximo mês">${icone('avancar')}</button>
        <button type="button" class="btn btn-pequeno" id="mes-hoje">Voltar para este mês</button>
      </div>
      <div class="grade-kpi grade-kpi-3" id="kpis-fin"></div>
      <div class="segmentado abas" role="tablist" aria-label="Seções do financeiro">
        ${[['lancamentos', 'Lançamentos'], ['receber', 'A receber'], ['pagar', 'A pagar'], ['relatorios', 'Relatórios']]
          .map(([id, t]) => `<button type="button" role="tab" data-aba="${id}" aria-selected="${aba === id}">${t}<span class="aba-n" data-aba-n="${id}"></span></button>`).join('')}
      </div>
      <div id="area-fin"></div>`;

    raiz = $('#area-fin', el);
    ligarDicas(raiz);
    $('#btn-nova-receita', el).addEventListener('click', () => abrirFormLancamento(null, 'receita'));
    $('#btn-nova-despesa', el).addEventListener('click', () => abrirFormLancamento(null, 'despesa'));
    $('#mes-anterior', el).addEventListener('click', () => { mes = somarMeses(mes, -1); this.atualizar(); });
    $('#mes-proximo', el).addEventListener('click', () => { mes = somarMeses(mes, 1); this.atualizar(); });
    $('#mes-hoje', el).addEventListener('click', () => { mes = mesAtual(); this.atualizar(); });
    $$('[data-aba]', el).forEach(b => b.addEventListener('click', () => {
      aba = b.dataset.aba;
      $$('[data-aba]', el).forEach(x => x.setAttribute('aria-selected', String(x.dataset.aba === aba)));
      this.atualizar();
    }));

    raiz.addEventListener('input', e => {
      if (e.target.id === 'busca-lanc') { filtros.busca = e.target.value; this.desenharLista(); }
    });
    raiz.addEventListener('click', e => {
      const f = e.target.closest('[data-filtro-lanc]');
      if (f) {
        filtros.lista = f.dataset.filtroLanc;
        $$('[data-filtro-lanc]', raiz).forEach(x => x.setAttribute('aria-pressed', String(x === f)));
        this.desenharLista();
        return;
      }
      const b = e.target.closest('[data-l]');
      if (b) {
        e.stopPropagation();
        const l = buscar('lancamentos', b.dataset.id);
        if (!l) return;
        if (b.dataset.l === 'pagar') abrirMarcarPago(l);
        else if (b.dataset.l === 'editar') abrirFormLancamento(l.id);
        else if (b.dataset.l === 'excluir') excluir(l);
        return;
      }
      const rec = e.target.closest('[data-receber]');
      if (rec) { e.stopPropagation(); abrirPagamento(rec.dataset.receber); return; }
      const os = e.target.closest('[data-abrir-os]');
      if (os) { abrirServico(os.dataset.abrirOs); return; }
      if (e.target.closest('#exportar-csv')) { exportarCsv(); return; }
      const ed = e.target.closest('[data-editar-lanc]');
      if (ed) abrirFormLancamento(ed.dataset.editarLanc);
    });
    raiz.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-abrir-os]')) abrirServico(e.target.dataset.abrirOs);
      else if (e.target.matches('[data-editar-lanc]')) abrirFormLancamento(e.target.dataset.editarLanc);
    });

    this.atualizar();
  },

  atualizar() {
    if (!raiz || !document.contains(raiz)) return;
    $('#mes-nome').textContent = nomeMes(mes);
    $('#mes-proximo').disabled = mes >= somarMeses(mesAtual(), 12);
    $('#mes-hoje').hidden = mes === mesAtual();

    if (!carregou('lancamentos')) { raiz.innerHTML = carregandoHtml('Carregando financeiro…'); return; }

    const doMes = estado.lancamentos.filter(l => noMes(l));
    const entrou = soma(doMes.filter(l => l.tipo === 'receita' && l.status === 'pago'));
    const saiu = soma(doMes.filter(l => l.tipo === 'despesa' && l.status === 'pago'));
    const g = totaisGerais();

    $('#kpis-fin').innerHTML = `
      <div class="kpi"><span class="kpi-rotulo">Entrou em ${esc(nomeMes(mes, false))}</span><strong class="kpi-valor texto-ok">${moeda(entrou)}</strong></div>
      <div class="kpi"><span class="kpi-rotulo">Saiu em ${esc(nomeMes(mes, false))}</span><strong class="kpi-valor texto-perigo">${moeda(saiu)}</strong></div>
      <div class="kpi"><span class="kpi-rotulo">Sobrou no mês</span><strong class="kpi-valor ${entrou - saiu < 0 ? 'texto-perigo' : ''}">${moeda(entrou - saiu)}</strong></div>`;

    // totais "a receber" e "a pagar" aparecem nas próprias abas
    const n = (id, txt, alerta = false) => { const e = $(`[data-aba-n="${id}"]`); if (e) { e.textContent = txt; e.classList.toggle('aba-alerta', alerta); } };
    n('receber', g.aReceber ? ` ${moeda(g.aReceber)}` : '');
    n('pagar', g.aPagar ? ` ${moeda(g.aPagar)}` : '', g.vencidas.length > 0);

    if (aba === 'lancamentos') {
      raiz.innerHTML = `<div class="barra-ferramentas">
          <label class="busca">${icone('busca')}<span class="sr">Buscar lançamento</span>
            <input id="busca-lanc" type="search" placeholder="Descrição, categoria ou cliente" value="${esc(filtros.busca)}" autocomplete="off"></label>
        </div>
        <div class="chips" role="group" aria-label="Filtrar lançamentos">
          ${FILTROS_LANC.map(([id, t]) => `<button type="button" class="chip" data-filtro-lanc="${id}" aria-pressed="${filtros.lista === id}">${t}</button>`).join('')}
        </div>
        <div id="lista-lanc"></div>`;
      this.desenharLista();
    } else if (aba === 'receber') {
      raiz.innerHTML = abaReceber();
    } else if (aba === 'pagar') {
      raiz.innerHTML = abaPagar();
    } else {
      raiz.innerHTML = abaRelatorios();
    }
  },

  desenharLista() {
    const caixa = $('#lista-lanc');
    if (!caixa) return;
    let lista = estado.lancamentos.filter(l => noMes(l));
    if (filtros.lista === 'receita' || filtros.lista === 'despesa') lista = lista.filter(l => l.tipo === filtros.lista);
    if (filtros.lista === 'pendente') lista = lista.filter(l => l.status === 'pendente');
    const t = filtros.busca.trim();
    if (t) lista = lista.filter(l => contem(`${l.descricao} ${l.categoria} ${l.clienteNome} ${l.forma} ${l.obs}`, t));
    lista.sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
    if (!lista.length) {
      caixa.innerHTML = vazio(`Nenhum lançamento em ${nomeMes(mes)}${t || filtros.lista !== 'todos' ? ' com esse filtro' : ''}.`);
      return;
    }
    const rec = soma(lista.filter(l => l.tipo === 'receita'));
    const desp = soma(lista.filter(l => l.tipo === 'despesa'));
    caixa.innerHTML = `<div class="tabela-linhas t-lanc">
        <div class="linha cabecalho" aria-hidden="true"><span>Data</span><span>Descrição</span><span>Forma</span><span>Situação</span><span class="num">Valor</span><span></span></div>
        ${lista.map(linhaLancamento).join('')}
      </div>
      <div class="rodape-lista">
        <span>${lista.length} ${lista.length === 1 ? 'lançamento' : 'lançamentos'}</span>
        <span>Receitas <strong class="texto-ok">${moeda(rec)}</strong></span>
        <span>Despesas <strong class="texto-perigo">${moeda(desp)}</strong></span>
        <button type="button" class="link" id="exportar-csv">${icone('baixar')} Exportar planilha</button>
      </div>`;
  },
};

function etiquetaSituacao(l) {
  if (l.status === 'pago') return `<span class="etiqueta et-ok">${l.tipo === 'receita' ? 'Recebido' : 'Pago'}</span>`;
  if (l.data < hoje()) return '<span class="etiqueta et-perigo">Vencido</span>';
  if (l.data === hoje()) return '<span class="etiqueta et-alerta">Vence hoje</span>';
  return '<span class="etiqueta et-neutra">Pendente</span>';
}

function linhaLancamento(l) {
  const sub = [l.categoria, l.clienteNome].filter(Boolean).join(', ');
  return `<div class="linha ${l.tipo}" data-editar-lanc="${l.id}" tabindex="0">
      <div class="c-data">${dataCurta(l.data)}</div>
      <div class="c-principal"><div><strong>${esc(l.descricao)}</strong><span>${esc(sub)}${l.servicoId && buscar('servicos', l.servicoId) ? ` <button type="button" class="link" data-abrir-os="${l.servicoId}">ver serviço</button>` : ''}</span></div></div>
      <div class="c-info texto-suave" data-rotulo="Forma">${esc(l.forma || '–')}</div>
      <div class="c-info" data-rotulo="Situação">${etiquetaSituacao(l)}</div>
      <div class="c-valor ${l.tipo === 'receita' ? 'texto-ok' : 'texto-perigo'}">${l.tipo === 'receita' ? '+' : '−'} ${moeda(l.valor)}</div>
      <div class="c-acoes">
        ${l.status === 'pendente' ? `<button type="button" class="btn btn-pequeno" data-l="pagar" data-id="${l.id}">${icone('check')}<span>${l.tipo === 'receita' ? 'Recebido' : 'Pago'}</span></button>` : ''}
      </div>
    </div>`;
}

function abaReceber() {
  const servs = servicosComSaldo().sort((a, b) => {
    const ordem = { concluido: 0, pronto: 1, producao: 2, aguardando: 3, aprovado: 4 };
    return (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9) || (a.numero || 0) - (b.numero || 0);
  });
  const pendentes = estado.lancamentos.filter(l => l.tipo === 'receita' && l.status === 'pendente').sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const totalServ = servs.reduce((t, s) => t + saldoServico(s), 0);
  return `
    <section class="painel">
      <div class="painel-cab"><h2>Serviços com saldo a receber</h2><span class="texto-suave">${moeda(totalServ)}</span></div>
      ${servs.length ? `<div class="tabela-linhas t-receber">
        <div class="linha cabecalho" aria-hidden="true"><span>Serviço</span><span>Etapa</span><span class="num">Total</span><span class="num">Pago</span><span class="num">Falta</span><span></span></div>
        ${servs.map(s => `<div class="linha" data-abrir-os="${s.id}" tabindex="0">
            <div class="c-principal"><div><strong>OS ${numeroOS(s.numero)}, ${esc(s.clienteNome)}</strong><span>${esc(s.tipo || '')}</span></div></div>
            <div class="c-info" data-rotulo="Etapa"><span class="etiqueta et-st st-${s.status}">${esc(statusInfo(s.status).curto)}</span></div>
            <div class="c-info num" data-rotulo="Total">${moeda(s.valorTotal)}</div>
            <div class="c-info num texto-suave" data-rotulo="Pago">${moeda(totalPago(s))}</div>
            <div class="c-valor texto-alerta">${moeda(saldoServico(s))}</div>
            <div class="c-acoes"><button type="button" class="btn btn-pequeno" data-receber="${s.id}">${icone('receber')}<span>Receber</span></button></div>
          </div>`).join('')}
      </div>` : vazio('Nenhum serviço com valor pendente.')}
    </section>
    <section class="painel">
      <div class="painel-cab"><h2>Outras receitas pendentes</h2><span class="texto-suave">${moeda(soma(pendentes))}</span></div>
      ${pendentes.length ? `<div class="tabela-linhas t-lanc">${pendentes.map(linhaLancamento).join('')}</div>` : vazio('Nenhuma receita pendente lançada.')}
    </section>`;
}

function abaPagar() {
  const pend = estado.lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'pendente').sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const vencidas = pend.filter(l => l.data < hoje());
  const resto = pend.filter(l => l.data >= hoje());
  return `
    ${vencidas.length ? `<section class="painel painel-alerta">
      <div class="painel-cab"><h2>${icone('alerta')} Vencidas</h2><span>${moeda(soma(vencidas))}</span></div>
      <div class="tabela-linhas t-lanc">${vencidas.map(linhaLancamento).join('')}</div>
    </section>` : ''}
    <section class="painel">
      <div class="painel-cab"><h2>Próximas contas</h2><span class="texto-suave">${moeda(soma(resto))}</span></div>
      ${resto.length ? `<div class="tabela-linhas t-lanc">${resto.map(linhaLancamento).join('')}</div>` : vazio('Nenhuma conta a pagar lançada.', `<button type="button" class="btn" onclick="document.getElementById('btn-nova-despesa').click()">${icone('saida')} Lançar despesa</button>`)}
    </section>`;
}

function abaRelatorios() {
  const doMes = estado.lancamentos.filter(l => noMes(l) && l.status === 'pago');
  const porCampo = (lista, k) => {
    const mapa = {};
    for (const l of lista) mapa[l[k] || 'Sem informação'] = (mapa[l[k] || 'Sem informação'] || 0) + lerNumero(l.valor);
    return Object.entries(mapa).map(([rotulo, valor]) => ({ rotulo, valor: arred(valor) }));
  };
  const despesas = doMes.filter(l => l.tipo === 'despesa');
  const receitas = doMes.filter(l => l.tipo === 'receita');
  const concluidos = estado.servicos.filter(s => s.status === 'concluido' && String(s.concluidoEm || '').slice(0, 7) === mes);
  const fat = concluidos.reduce((t, s) => t + lerNumero(s.valorTotal), 0);
  const aprovadosMes = estado.servicos.filter(s => String(s.aprovadoEm || '').slice(0, 7) === mes);
  const orcadosMes = estado.servicos.filter(s => String(s.criadoEm || '').slice(0, 7) === mes);
  return `
    <section class="painel">
      <div class="painel-cab"><h2>Receitas e despesas, últimos 6 meses</h2></div>
      ${graficoMensal(resumoMensal(mes, 6))}
    </section>
    <div class="grade-2">
      <section class="painel">
        <div class="painel-cab"><h2>Despesas por categoria</h2><span class="texto-suave">${esc(nomeMes(mes))}</span></div>
        ${barrasHorizontais(porCampo(despesas, 'categoria'), { classe: 'bh-desp', vazioTexto: 'Nenhuma despesa paga no mês.' })}
      </section>
      <section class="painel">
        <div class="painel-cab"><h2>Recebimentos por forma de pagamento</h2><span class="texto-suave">${esc(nomeMes(mes))}</span></div>
        ${barrasHorizontais(porCampo(receitas, 'forma'), { classe: 'bh-rec', vazioTexto: 'Nenhum recebimento no mês.' })}
      </section>
    </div>
    <section class="painel">
      <div class="painel-cab"><h2>Serviços em ${esc(nomeMes(mes))}</h2></div>
      <dl class="resumo-mini resumo-4">
        <div><dt>Orçamentos feitos</dt><dd>${orcadosMes.length}</dd></div>
        <div><dt>Aprovados</dt><dd>${aprovadosMes.length}</dd></div>
        <div><dt>Concluídos</dt><dd>${concluidos.length}</dd></div>
        <div><dt>Valor concluído</dt><dd>${moeda(fat)}</dd></div>
        <div><dt>Ticket médio</dt><dd>${concluidos.length ? moeda(fat / concluidos.length) : '–'}</dd></div>
      </dl>
    </section>`;
}

function exportarCsv() {
  const lista = estado.lancamentos.filter(l => noMes(l)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  if (!lista.length) { toast('Nenhum lançamento neste mês para exportar.', 'erro'); return; }
  const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['Data', 'Tipo', 'Categoria', 'Descrição', 'Cliente/Fornecedor', 'Forma', 'Situação', 'Valor']]
    .concat(lista.map(l => [dataBR(l.data), l.tipo === 'receita' ? 'Receita' : 'Despesa', l.categoria, l.descricao, l.clienteNome,
      l.forma, l.status === 'pago' ? 'Pago' : 'Pendente', (l.tipo === 'despesa' ? -1 : 1) * lerNumero(l.valor)]))
    .map(r => r.map((v, i) => (i === 7 ? String(v).replace('.', ',') : cel(v))).join(';'))
    .join('\r\n');
  baixarArquivo(`financeiro-${mes}.csv`, '﻿' + linhas, 'text/csv;charset=utf-8');
  toast('Planilha baixada');
}

async function excluir(l) {
  const ok = await confirmar(`Excluir "${l.descricao}" (${moeda(l.valor)})?${l.servicoId ? ' O pagamento também sai do serviço.' : ''}`, { titulo: 'Excluir lançamento', sim: 'Excluir', perigo: true });
  if (!ok) return false;
  try { await acoes.excluirLancamento(l); toast('Lançamento excluído'); return true; }
  catch (e) { toast(mensagemErro(e), 'erro'); return false; }
}

function abrirMarcarPago(l) {
  abrirModal({
    titulo: l.tipo === 'receita' ? 'Marcar como recebido' : 'Marcar como pago',
    classe: 'modal-pequeno',
    corpo: `<form id="form-pago" class="form-grade">
        <p class="inteiro"><strong>${esc(l.descricao)}</strong><br>${moeda(l.valor)}, vencimento ${dataBR(l.vencimento || l.data)}</p>
        ${campo({ rotulo: 'Data do pagamento', nome: 'data', tipo: 'date', valor: hoje() })}
        ${campo({ rotulo: 'Forma', nome: 'forma', tipo: 'select', opcoes: FORMAS_PAGAMENTO, valor: l.forma || 'PIX' })}
      </form>`,
    rodape: `<button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-pago" class="btn btn-primario">Confirmar</button>`,
    aoMontar(m) {
      $('#form-pago', m.el).addEventListener('submit', async e => {
        e.preventDefault();
        try { await acoes.marcarPago(l, dadosForm(e.target)); toast(l.tipo === 'receita' ? 'Marcado como recebido' : 'Marcado como pago'); m.fechar(); }
        catch (err) { toast(mensagemErro(err), 'erro'); }
      });
    },
  });
}

export function abrirFormLancamento(id = null, tipoInicial = 'receita') {
  const l = id ? buscar('lancamentos', id) : null;
  let tipo = l?.tipo || tipoInicial;
  const v = k => (l ? l[k] ?? '' : '');
  const ligadoServico = !!l?.servicoId;
  const opcoesCat = t => (t === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA);

  abrirModal({
    titulo: l ? 'Editar lançamento' : tipo === 'receita' ? 'Nova receita' : 'Nova despesa',
    fecharFora: false,
    corpo: `<form id="form-lanc" class="form-grade" novalidate autocomplete="off">
        <div class="campo inteiro">
          <span class="rotulo-grupo">Tipo</span>
          <div class="segmentado" role="radiogroup" aria-label="Tipo de lançamento">
            <label><input type="radio" name="tipo" value="receita" ${tipo === 'receita' ? 'checked' : ''} ${ligadoServico ? 'disabled' : ''}> Receita</label>
            <label><input type="radio" name="tipo" value="despesa" ${tipo === 'despesa' ? 'checked' : ''} ${ligadoServico ? 'disabled' : ''}> Despesa</label>
          </div>
        </div>
        ${campo({ rotulo: 'Descrição', nome: 'descricao', obrigatorio: true, valor: v('descricao'), classe: 'inteiro', attrs: 'autofocus', placeholder: tipo === 'receita' ? 'Ex.: venda de espelho no balcão' : 'Ex.: conta de energia' })}
        ${campo({ rotulo: 'Valor (R$)', nome: 'valor', obrigatorio: true, valor: numCampo(v('valor')), attrs: ATTR_DECIMAL })}
        ${campo({ rotulo: 'Categoria', nome: 'categoria', tipo: 'select', opcoes: opcoesCat(tipo), valor: v('categoria') })}
        ${campo({ rotulo: 'Situação', nome: 'status', tipo: 'select', opcoes: [['pago', 'Pago / recebido'], ['pendente', 'Pendente (a vencer)']], valor: v('status') || 'pago' })}
        ${campo({ rotulo: 'Data', nome: 'data', tipo: 'date', valor: v('data') || hoje(), obrigatorio: true, dica: 'Se estiver pendente, use a data do vencimento.' })}
        <details class="inteiro mais-opcoes" ${l && (l.forma || l.clienteNome || l.obs) ? 'open' : ''}>
          <summary>Mais opções</summary>
          <div class="form-grade">
            ${campo({ rotulo: 'Forma de pagamento', nome: 'forma', tipo: 'select', opcoes: [['', 'Não informada'], ...FORMAS_PAGAMENTO], valor: v('forma') })}
            ${campo({ rotulo: 'Cliente / fornecedor', nome: 'clienteNome', valor: v('clienteNome') })}
            ${!l ? campo({ rotulo: 'Repetir todo mês', nome: 'repetir', tipo: 'select', opcoes: [['1', 'Não repetir'], ...[2, 3, 4, 6, 12].map(n => [String(n), `Por ${n} meses`])], classe: 'inteiro', dica: 'Para aluguel, salários e contas fixas. As próximas ficam pendentes.' }) : ''}
            ${campo({ rotulo: 'Observações', nome: 'obs', tipo: 'textarea', linhas: 2, valor: v('obs'), classe: 'inteiro' })}
          </div>
        </details>
      </form>`,
    rodape: `${l ? `<button type="button" class="btn btn-perigo-texto" data-excluir-lanc>${icone('lixeira')}<span>Excluir</span></button><span class="espaco"></span>` : ''}
             <button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-lanc" class="btn btn-primario">${l ? 'Salvar alterações' : 'Lançar'}</button>`,
    aoMontar(m) {
      const form = $('#form-lanc', m.el);
      $('[data-excluir-lanc]', m.el)?.addEventListener('click', async () => {
        if (await excluir(l)) m.fechar();
      });
      form.addEventListener('change', e => {
        if (e.target.name !== 'tipo') return;
        tipo = e.target.value;
        form.categoria.innerHTML = opcoesCat(tipo).map(c => `<option>${esc(c)}</option>`).join('');
        if (!l) $('h2', m.el).textContent = tipo === 'receita' ? 'Nova receita' : 'Nova despesa';
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        d.tipo = tipo;
        if (!d.descricao) { toast('Digite a descrição.', 'erro'); form.descricao.focus(); return; }
        if (!(lerNumero(d.valor) > 0)) { toast('Digite o valor.', 'erro'); form.valor.focus(); return; }
        await comCarregando($('[type=submit]', m.el), async () => {
          try {
            await acoes.salvarLancamento(d, id);
            const n = parseInt(d.repetir, 10) || 1;
            toast(l ? 'Lançamento atualizado' : n > 1 ? `${n} lançamentos criados` : 'Lançamento criado');
            if (!l) mes = d.data.slice(0, 7);
            m.fechar();
          } catch (err) { toast(mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}
