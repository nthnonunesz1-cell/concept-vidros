// Controle de estoque: produtos, entradas, saídas, ajustes e histórico de movimentações.
import { estado, ehAdmin, buscar, carregou } from '../estado.js';
import { CATEGORIAS_PRODUTO, UNIDADES, MOTIVOS_ENTRADA, MOTIVOS_SAIDA, FORMAS_PAGAMENTO, STATUS_FILA, statusInfo } from '../constantes.js';
import {
  $, $$, esc, icone, moeda, num, numCampo, lerNumero, dataBR, dataHoraBR, contem, campo, ATTR_DECIMAL,
  dadosForm, abrirModal, confirmar, toast, mensagemErro, comCarregando, vazio, carregandoHtml, arred,
} from '../util.js';
import { estoqueBaixo, estoqueZerado, numeroOS } from '../regras.js';
import * as acoes from '../acoes.js';
import { abrirServico } from './servicos.js';

const filtros = { busca: '', categoria: '', baixo: false, tipoMov: '' };
let aba = 'produtos';
let raiz = null;

const ROTULO_MOV = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' };

export default {
  titulo: 'Estoque',

  montar(el, params = {}) {
    if (params.baixo) { filtros.baixo = true; aba = 'produtos'; }
    if (params.aba) aba = params.aba;
    el.innerHTML = `
      <div class="cab-tela">
        <h1>Estoque</h1>
        <div class="cab-acoes">
          <button type="button" class="btn" id="btn-entrada">${icone('entrada')} Entrada</button>
          <button type="button" class="btn" id="btn-saida">${icone('saida')} Saída</button>
          ${ehAdmin() ? `<button type="button" class="btn btn-primario" id="btn-novo-produto">${icone('novo')} Novo produto</button>` : ''}
        </div>
      </div>
      <div class="segmentado abas" role="tablist" aria-label="Seções do estoque">
        <button type="button" role="tab" data-aba="produtos" aria-selected="${aba === 'produtos'}">Produtos</button>
        <button type="button" role="tab" data-aba="movimentos" aria-selected="${aba === 'movimentos'}">Movimentações</button>
      </div>
      <div id="ferramentas-estoque"></div>
      <div id="area-estoque"></div>`;

    raiz = $('#area-estoque', el);
    $('#btn-entrada', el).addEventListener('click', () => abrirMovimento({ tipo: 'entrada' }));
    $('#btn-saida', el).addEventListener('click', () => abrirMovimento({ tipo: 'saida' }));
    $('#btn-novo-produto', el)?.addEventListener('click', () => abrirFormProduto());
    $$('[data-aba]', el).forEach(b => b.addEventListener('click', () => {
      aba = b.dataset.aba;
      $$('[data-aba]', el).forEach(x => x.setAttribute('aria-selected', String(x.dataset.aba === aba)));
      this.desenharFerramentas();
      this.atualizar();
    }));

    raiz.addEventListener('click', e => {
      const mov = e.target.closest('[data-mov]');
      if (mov) { e.stopPropagation(); abrirMovimento({ tipo: mov.dataset.mov, produtoId: mov.dataset.id }); return; }
      const os = e.target.closest('[data-abrir-os]');
      if (os) { e.stopPropagation(); abrirServico(os.dataset.abrirOs); return; }
      if (e.target.closest('[data-novo-produto]')) { abrirFormProduto(); return; }
      const p = e.target.closest('[data-abrir-produto]');
      if (p) abrirProduto(p.dataset.abrirProduto);
    });
    raiz.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('[data-abrir-produto]')) abrirProduto(e.target.dataset.abrirProduto);
    });

    this.desenharFerramentas();
    this.atualizar();
  },

  desenharFerramentas() {
    const caixa = $('#ferramentas-estoque');
    if (!caixa) return;
    if (aba === 'produtos') {
      const cats = [...new Set([...CATEGORIAS_PRODUTO, ...estado.produtos.map(p => p.categoria).filter(Boolean)])];
      caixa.innerHTML = `<div class="barra-ferramentas">
          <label class="busca">${icone('busca')}<span class="sr">Buscar produto</span>
            <input id="busca-produtos" type="search" placeholder="Buscar produto ou fornecedor" value="${esc(filtros.busca)}" autocomplete="off"></label>
          <label class="seletor-inline"><span>Categoria</span>
            <select id="cat-produtos"><option value="">Todas</option>${cats.map(c => `<option ${c === filtros.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="alternar"><input type="checkbox" id="so-baixo" ${filtros.baixo ? 'checked' : ''}> <span>Só estoque baixo</span></label>
        </div>`;
      $('#busca-produtos').addEventListener('input', e => { filtros.busca = e.target.value; this.atualizar(); });
      $('#cat-produtos').addEventListener('change', e => { filtros.categoria = e.target.value; this.atualizar(); });
      $('#so-baixo').addEventListener('change', e => { filtros.baixo = e.target.checked; this.atualizar(); });
    } else {
      caixa.innerHTML = `<div class="barra-ferramentas">
          <label class="busca">${icone('busca')}<span class="sr">Buscar movimentação</span>
            <input id="busca-movs" type="search" placeholder="Produto, motivo ou pessoa" value="${esc(filtros.busca)}" autocomplete="off"></label>
          <label class="seletor-inline"><span>Tipo</span>
            <select id="tipo-movs">
              <option value="">Todos</option>
              ${Object.entries(ROTULO_MOV).map(([v, t]) => `<option value="${v}" ${filtros.tipoMov === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select></label>
        </div>`;
      $('#busca-movs').addEventListener('input', e => { filtros.busca = e.target.value; this.atualizar(); });
      $('#tipo-movs').addEventListener('change', e => { filtros.tipoMov = e.target.value; this.atualizar(); });
    }
  },

  atualizar() {
    if (!raiz || !document.contains(raiz)) return;
    if (aba === 'movimentos') { raiz.innerHTML = listaMovimentos(); return; }
    if (!carregou('produtos')) { raiz.innerHTML = carregandoHtml('Carregando estoque…'); return; }

    const t = filtros.busca.trim();
    let lista = estado.produtos;
    if (t) lista = lista.filter(p => contem(`${p.nome} ${p.fornecedor} ${p.categoria}`, t));
    if (filtros.categoria) lista = lista.filter(p => p.categoria === filtros.categoria);
    const baixos = estado.produtos.filter(estoqueBaixo).length;
    if (filtros.baixo) lista = lista.filter(p => estoqueBaixo(p) || estoqueZerado(p));
    lista = [...lista].sort((a, b) => {
      const pa = estoqueZerado(a) || estoqueBaixo(a) ? 0 : 1;
      const pb = estoqueZerado(b) || estoqueBaixo(b) ? 0 : 1;
      return pa - pb || a.nome.localeCompare(b.nome, 'pt-BR');
    });

    const admin = ehAdmin();
    const valorCusto = estado.produtos.reduce((s, p) => s + Math.max(0, lerNumero(p.quantidade)) * lerNumero(p.custo), 0);

    const resumo = `<div class="resumo-linha">
        <span><strong>${estado.produtos.length}</strong> produtos</span>
        ${baixos ? `<button type="button" class="link texto-alerta" id="ver-baixos">${icone('alerta')} ${baixos} com estoque baixo</button>` : '<span class="texto-ok">Nenhum produto abaixo do mínimo</span>'}
        ${admin ? `<span>Valor em estoque (custo) <strong>${moeda(valorCusto)}</strong></span>` : ''}
      </div>`;

    if (!lista.length) {
      raiz.innerHTML = resumo + vazio(estado.produtos.length ? 'Nenhum produto com esses filtros.' : 'Nenhum produto cadastrado ainda.',
        admin && !estado.produtos.length ? `<button type="button" class="btn btn-primario" data-novo-produto>${icone('novo')} Cadastrar produto</button>` : '');
    } else {
      raiz.innerHTML = resumo + `<div class="tabela-linhas t-produtos${admin ? ' com-precos' : ''}">
          <div class="linha cabecalho" aria-hidden="true">
            <span>Produto</span><span>Em estoque</span><span>Mínimo</span>${admin ? '<span>Custo</span><span>Venda</span>' : ''}<span></span>
          </div>
          ${lista.map(p => linhaProduto(p, admin)).join('')}
        </div>`;
    }
    $('#ver-baixos', raiz)?.addEventListener('click', () => {
      filtros.baixo = true;
      const cb = $('#so-baixo');
      if (cb) cb.checked = true;
      this.atualizar();
    });
  },
};

function nivel(p) {
  const q = lerNumero(p.quantidade);
  const min = lerNumero(p.estoqueMinimo);
  const ref = Math.max(min * 2, q, 1);
  return Math.max(0, Math.min(100, (q / ref) * 100));
}

function etiquetaEstoque(p) {
  if (estoqueZerado(p)) return '<span class="etiqueta et-perigo">Zerado</span>';
  if (estoqueBaixo(p)) return '<span class="etiqueta et-alerta">Baixo</span>';
  return '';
}

function linhaProduto(p, admin) {
  const classe = estoqueZerado(p) ? 'zerado' : estoqueBaixo(p) ? 'baixo' : '';
  return `<div class="linha ${classe}" data-abrir-produto="${p.id}" tabindex="0">
      <div class="c-principal"><div><strong>${esc(p.nome)}</strong><span>${esc(p.categoria || '')}${p.fornecedor ? `, ${esc(p.fornecedor)}` : ''}</span></div></div>
      <div class="c-qtd" data-rotulo="Em estoque">
        <span class="qtd"><strong>${num(p.quantidade, 3)}</strong> ${esc(p.unidade)}</span>
        <span class="nivel" aria-hidden="true"><span style="width:${nivel(p)}%"></span></span>
        ${etiquetaEstoque(p)}
      </div>
      <div class="c-info texto-suave" data-rotulo="Mínimo">${lerNumero(p.estoqueMinimo) ? `${num(p.estoqueMinimo, 3)} ${esc(p.unidade)}` : '–'}</div>
      ${admin ? `<div class="c-info" data-rotulo="Custo">${moeda(p.custo)}</div><div class="c-info" data-rotulo="Venda">${moeda(p.preco)}</div>` : ''}
      <div class="c-acoes">
        <button type="button" class="btn btn-pequeno" data-mov="entrada" data-id="${p.id}" aria-label="Entrada de ${esc(p.nome)}">${icone('entrada')}<span>Entrada</span></button>
        <button type="button" class="btn btn-pequeno" data-mov="saida" data-id="${p.id}" aria-label="Saída de ${esc(p.nome)}">${icone('saida')}<span>Saída</span></button>
      </div>
    </div>`;
}

function linhaMovimento(mv) {
  const sinal = mv.tipo === 'entrada' ? '+' : mv.tipo === 'saida' ? '−' : (mv.delta >= 0 ? '+' : '−');
  const classe = mv.tipo === 'entrada' ? 'texto-ok' : mv.tipo === 'saida' ? 'texto-perigo' : '';
  return `<div class="linha">
      <div class="c-data">${dataHoraBR(mv.data)}</div>
      <div class="c-principal"><div><strong>${esc(mv.produtoNome)}</strong><span>${esc(mv.motivo || '')}${mv.tipo === 'ajuste' && mv.saldoAjustado != null ? ` (contado: ${num(mv.saldoAjustado, 3)})` : ''}</span></div></div>
      <div class="c-info" data-rotulo="Tipo"><span class="etiqueta et-mov-${mv.tipo}">${ROTULO_MOV[mv.tipo] || mv.tipo}</span></div>
      <div class="c-info ${classe}" data-rotulo="Quantidade"><strong>${sinal}${num(Math.abs(mv.delta ?? mv.quantidade), 3)} ${esc(mv.unidade || '')}</strong></div>
      <div class="c-info" data-rotulo="Serviço">${mv.servicoId && buscar('servicos', mv.servicoId) ? `<button type="button" class="link" data-abrir-os="${mv.servicoId}">OS ${numeroOS(mv.servicoNumero)}</button>` : (mv.servicoNumero ? `OS ${numeroOS(mv.servicoNumero)}` : '–')}</div>
      <div class="c-info texto-suave" data-rotulo="Por">${esc(mv.usuarioNome || '')}</div>
    </div>`;
}

function listaMovimentos(produtoId = null) {
  if (!carregou('movimentos')) return carregandoHtml('Carregando movimentações…');
  let lista = estado.movimentos;
  if (produtoId) lista = lista.filter(m => m.produtoId === produtoId);
  else {
    if (filtros.tipoMov) lista = lista.filter(m => m.tipo === filtros.tipoMov);
    const t = filtros.busca.trim();
    if (t) lista = lista.filter(m => contem(`${m.produtoNome} ${m.motivo} ${m.usuarioNome} ${m.servicoNumero || ''}`, t));
  }
  lista = [...lista].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  if (!lista.length) return vazio(produtoId ? 'Nenhuma movimentação recente deste produto.' : 'Nenhuma movimentação encontrada.');
  return `<div class="tabela-linhas t-movs">
      <div class="linha cabecalho" aria-hidden="true"><span>Quando</span><span>Produto</span><span>Tipo</span><span>Quantidade</span><span>Serviço</span><span>Por</span></div>
      ${lista.map(linhaMovimento).join('')}
    </div>
    ${!produtoId ? '<p class="texto-suave nota-rodape">Mostrando as 300 movimentações mais recentes.</p>' : ''}`;
}

// ------------------------------------------------------------------ detalhes do produto

export function abrirProduto(id) {
  if (!buscar('produtos', id)) { toast('Produto não encontrado.', 'erro'); return; }
  abrirModal({
    titulo: esc(buscar('produtos', id).nome),
    classe: 'modal-largo',
    corpo: '<div class="det-conteudo"></div>',
    rodape: '<span></span>',
    aoMontar(m) {
      const conteudo = $('.det-conteudo', m.el);
      const desenhar = () => {
        const p = buscar('produtos', id);
        if (!p) { m.fechar(); return; }
        const admin = ehAdmin();
        $('h2', m.el).textContent = p.nome;
        const margem = lerNumero(p.custo) > 0 ? Math.round(((lerNumero(p.preco) - lerNumero(p.custo)) / lerNumero(p.custo)) * 100) : null;
        conteudo.innerHTML = `
          <div class="estoque-destaque ${estoqueZerado(p) ? 'zerado' : estoqueBaixo(p) ? 'baixo' : ''}">
            <div><span class="texto-suave">Em estoque</span><strong>${num(p.quantidade, 3)} <small>${esc(p.unidade)}</small></strong></div>
            <span class="nivel nivel-grande" aria-hidden="true"><span style="width:${nivel(p)}%"></span></span>
            <div>${etiquetaEstoque(p)}${lerNumero(p.estoqueMinimo) ? `<span class="texto-suave">Mínimo: ${num(p.estoqueMinimo, 3)} ${esc(p.unidade)}</span>` : ''}</div>
          </div>
          <dl class="det-dados det-dados-grade">
            <div><dt>Categoria</dt><dd>${esc(p.categoria || '–')}</dd></div>
            <div><dt>Unidade</dt><dd>${esc(p.unidade)}</dd></div>
            <div><dt>Fornecedor</dt><dd>${esc(p.fornecedor || '–')}</dd></div>
            ${admin ? `<div><dt>Custo</dt><dd>${moeda(p.custo)}</dd></div>
            <div><dt>Preço de venda</dt><dd>${moeda(p.preco)}${margem !== null ? ` <span class="texto-suave">(margem ${margem}%)</span>` : ''}</dd></div>
            <div><dt>Valor em estoque</dt><dd>${moeda(Math.max(0, lerNumero(p.quantidade)) * lerNumero(p.custo))}</dd></div>` : ''}
          </dl>
          ${p.obs ? `<p class="det-obs">${icone('nota')}<span>${esc(p.obs)}</span></p>` : ''}
          <section class="det-bloco">
            <h3>Movimentações recentes</h3>
            ${listaMovimentos(id)}
          </section>`;
        m.rodape.innerHTML = `
          ${admin ? `<button type="button" class="btn btn-perigo-texto" data-p="excluir">${icone('lixeira')}<span>Excluir</span></button>
          <button type="button" class="btn" data-p="editar">${icone('editar')}<span>Editar</span></button>
          <button type="button" class="btn" data-p="ajuste">${icone('ajuste')}<span>Ajustar</span></button>` : ''}
          <span class="espaco"></span>
          <button type="button" class="btn" data-p="saida">${icone('saida')}<span>Saída</span></button>
          <button type="button" class="btn btn-primario" data-p="entrada">${icone('entrada')}<span>Entrada</span></button>`;
      };
      m.atualizar = desenhar;
      desenhar();

      m.el.addEventListener('click', async e => {
        const os = e.target.closest('[data-abrir-os]');
        if (os) { abrirServico(os.dataset.abrirOs); return; }
        const b = e.target.closest('[data-p]');
        if (!b) return;
        const p = buscar('produtos', id);
        const acao = b.dataset.p;
        if (['entrada', 'saida', 'ajuste'].includes(acao)) abrirMovimento({ tipo: acao, produtoId: id });
        else if (acao === 'editar') abrirFormProduto(id);
        else if (acao === 'excluir') {
          const ok = await confirmar(`Excluir "${p.nome}" do estoque? O histórico de movimentações continua salvo.`, { titulo: 'Excluir produto', sim: 'Excluir', perigo: true });
          if (!ok) return;
          try { await acoes.excluirProduto(id); toast('Produto excluído'); m.fechar(); }
          catch (err) { toast(mensagemErro(err), 'erro'); }
        }
      });
    },
  });
}

// ------------------------------------------------------------------ entrada / saída / ajuste

export function abrirMovimento({ tipo = 'entrada', produtoId = '', servicoId = '' } = {}) {
  if (tipo === 'ajuste' && !ehAdmin()) return;
  if (!estado.produtos.length) {
    toast(ehAdmin() ? 'Cadastre um produto primeiro.' : 'Nenhum produto cadastrado no estoque.', 'erro');
    return;
  }
  const titulos = { entrada: 'Entrada no estoque', saida: 'Saída do estoque', ajuste: 'Ajustar estoque' };
  const motivos = tipo === 'entrada' ? MOTIVOS_ENTRADA : tipo === 'saida' ? MOTIVOS_SAIDA : ['Contagem do estoque'];
  const produtos = [...estado.produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const servicosAbertos = estado.servicos.filter(s => STATUS_FILA.includes(s.status) || s.id === servicoId)
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  const podeLancar = tipo === 'entrada' && ehAdmin();

  abrirModal({
    titulo: titulos[tipo],
    classe: 'modal-pequeno',
    fecharFora: false,
    corpo: `<form id="form-mov" class="form-grade" novalidate autocomplete="off">
        ${campo({
          rotulo: 'Produto', nome: 'produtoId', tipo: 'select', obrigatorio: true, classe: 'inteiro', valor: produtoId,
          opcoes: [['', 'Escolha o produto'], ...produtos.map(p => [p.id, `${p.nome} (${num(p.quantidade, 3)} ${p.unidade})`])],
          attrs: produtoId ? '' : 'autofocus',
        })}
        <p class="inteiro saldo-atual" id="saldo-atual"></p>
        ${campo({
          rotulo: tipo === 'ajuste' ? 'Quantidade contada' : 'Quantidade', nome: 'quantidade', obrigatorio: true,
          attrs: `${ATTR_DECIMAL} ${produtoId ? 'autofocus' : ''}`,
          dica: tipo === 'ajuste' ? 'O estoque passa a ter exatamente essa quantidade.' : '',
        })}
        <div class="campo">
          <label for="f-motivo">Motivo</label>
          <input id="f-motivo" name="motivo" list="lista-motivos" value="${esc(servicoId ? 'Uso em serviço' : motivos[0])}">
          <datalist id="lista-motivos">${motivos.map(mo => `<option value="${esc(mo)}">`).join('')}</datalist>
        </div>
        ${tipo === 'saida' ? campo({
          rotulo: 'Usado no serviço (opcional)', nome: 'servicoId', tipo: 'select', classe: 'inteiro', valor: servicoId,
          opcoes: [['', 'Nenhum'], ...servicosAbertos.map(s => [s.id, `OS ${numeroOS(s.numero)}, ${s.clienteNome} (${statusInfo(s.status).curto})`])],
        }) : ''}
        ${podeLancar ? `<fieldset class="inteiro bloco-financeiro">
          <label class="alternar"><input type="checkbox" name="lancar" id="f-lancar"> <span>Lançar a compra no financeiro</span></label>
          <div class="form-grade" id="campos-compra" hidden>
            ${campo({ rotulo: 'Valor total da compra (R$)', nome: 'valorDespesa', attrs: ATTR_DECIMAL })}
            ${campo({ rotulo: 'Forma de pagamento', nome: 'forma', tipo: 'select', opcoes: FORMAS_PAGAMENTO })}
          </div>
        </fieldset>` : ''}
      </form>`,
    rodape: `<button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-mov" class="btn btn-primario">${tipo === 'entrada' ? 'Registrar entrada' : tipo === 'saida' ? 'Registrar saída' : 'Ajustar estoque'}</button>`,
    aoMontar(m) {
      const form = $('#form-mov', m.el);
      const saldo = $('#saldo-atual', m.el);
      let valorEditado = false;

      const sugerirValor = () => {
        if (!podeLancar || valorEditado) return;
        const p = buscar('produtos', form.produtoId.value);
        const q = lerNumero(form.quantidade.value);
        form.valorDespesa.value = p && q && lerNumero(p.custo) ? numCampo(arred(q * lerNumero(p.custo))) : '';
      };
      const mostrarSaldo = () => {
        const p = buscar('produtos', form.produtoId.value);
        if (!p) { saldo.textContent = ''; return; }
        const q = lerNumero(form.quantidade.value);
        const atual = lerNumero(p.quantidade);
        const depois = tipo === 'entrada' ? atual + q : tipo === 'saida' ? atual - q : q;
        saldo.innerHTML = `Hoje: <strong>${num(atual, 3)} ${esc(p.unidade)}</strong>${q || tipo === 'ajuste' ? ` &nbsp;Depois: <strong class="${depois < 0 ? 'texto-perigo' : ''}">${num(depois, 3)} ${esc(p.unidade)}</strong>` : ''}`;
        $('label[for="f-quantidade"]', m.el).firstChild.textContent = `${tipo === 'ajuste' ? 'Quantidade contada' : 'Quantidade'} (${p.unidade})`;
      };
      form.produtoId.addEventListener('change', () => { mostrarSaldo(); sugerirValor(); });
      form.quantidade.addEventListener('input', () => { mostrarSaldo(); sugerirValor(); });
      if (podeLancar) {
        form.lancar.addEventListener('change', () => { $('#campos-compra', m.el).hidden = !form.lancar.checked; sugerirValor(); });
        form.valorDespesa.addEventListener('input', () => { valorEditado = true; });
      }
      mostrarSaldo();

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        const p = buscar('produtos', d.produtoId);
        if (!p) { toast('Escolha o produto.', 'erro'); form.produtoId.focus(); return; }
        const q = lerNumero(d.quantidade);
        if (tipo === 'ajuste' ? q < 0 || d.quantidade === '' : !(q > 0)) { toast('Digite a quantidade.', 'erro'); form.quantidade.focus(); return; }
        if (tipo === 'saida' && q > lerNumero(p.quantidade)) {
          const ok = await confirmar(`A saída é maior que o estoque (${num(p.quantidade, 3)} ${p.unidade}) e vai deixá-lo negativo. Registrar mesmo assim?`, { titulo: 'Estoque insuficiente', sim: 'Registrar' });
          if (!ok) return;
        }
        await comCarregando($('[type=submit]', m.el), async () => {
          try {
            await acoes.movimentarEstoque(p, {
              tipo, quantidade: q, motivo: d.motivo, servicoId: d.servicoId || '',
              lancarDespesa: podeLancar && form.lancar.checked, valorDespesa: d.valorDespesa, forma: d.forma,
            });
            toast(tipo === 'ajuste' ? `${p.nome}: estoque ajustado` : `${ROTULO_MOV[tipo]} de ${num(q, 3)} ${p.unidade} registrada`);
            m.fechar();
          } catch (err) { toast(mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}

// ------------------------------------------------------------------ cadastro de produto

export function abrirFormProduto(id = null) {
  if (!ehAdmin()) return;
  const p = id ? buscar('produtos', id) : null;
  const v = k => (p ? p[k] ?? '' : '');
  const cats = [...new Set([...CATEGORIAS_PRODUTO, ...estado.produtos.map(x => x.categoria).filter(Boolean)])];
  abrirModal({
    titulo: p ? 'Editar produto' : 'Novo produto',
    fecharFora: false,
    corpo: `<form id="form-produto" class="form-grade" novalidate autocomplete="off">
        ${campo({ rotulo: 'Nome do produto', nome: 'nome', obrigatorio: true, valor: v('nome'), classe: 'inteiro', placeholder: 'Ex.: vidro temperado 8mm incolor', attrs: 'autofocus' })}
        ${campo({ rotulo: 'Categoria', nome: 'categoria', tipo: 'select', opcoes: cats, valor: v('categoria') || 'Vidro' })}
        ${campo({ rotulo: 'Unidade', nome: 'unidade', tipo: 'select', opcoes: UNIDADES, valor: v('unidade') || 'm²', dica: 'Vidros e espelhos em m² são cobrados por área no serviço.' })}
        ${!p ? campo({ rotulo: 'Quantidade em estoque agora', nome: 'quantidade', attrs: ATTR_DECIMAL }) : ''}
        ${campo({ rotulo: 'Estoque mínimo', nome: 'estoqueMinimo', valor: numCampo(v('estoqueMinimo'), 3), attrs: ATTR_DECIMAL, dica: 'Avisa quando chegar nessa quantidade.' })}
        ${campo({ rotulo: 'Custo (R$ por unidade)', nome: 'custo', valor: numCampo(v('custo')), attrs: ATTR_DECIMAL })}
        ${campo({ rotulo: 'Preço de venda (R$ por unidade)', nome: 'preco', valor: numCampo(v('preco')), attrs: ATTR_DECIMAL })}
        <p class="inteiro texto-suave" id="margem"></p>
        ${campo({ rotulo: 'Fornecedor', nome: 'fornecedor', valor: v('fornecedor'), classe: 'inteiro' })}
        ${campo({ rotulo: 'Observações', nome: 'obs', tipo: 'textarea', linhas: 2, valor: v('obs'), classe: 'inteiro' })}
      </form>`,
    rodape: `<button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-produto" class="btn btn-primario">${p ? 'Salvar alterações' : 'Cadastrar produto'}</button>`,
    aoMontar(m) {
      const form = $('#form-produto', m.el);
      const margem = () => {
        const c = lerNumero(form.custo.value);
        const pr = lerNumero(form.preco.value);
        $('#margem', m.el).textContent = c > 0 && pr > 0 ? `Margem sobre o custo: ${Math.round(((pr - c) / c) * 100)}%` : '';
      };
      form.custo.addEventListener('input', margem);
      form.preco.addEventListener('input', margem);
      margem();
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        if (!d.nome) { toast('Digite o nome do produto.', 'erro'); form.nome.focus(); return; }
        await comCarregando($('[type=submit]', m.el), async () => {
          try {
            await acoes.salvarProduto(d, id);
            toast(p ? 'Produto atualizado' : 'Produto cadastrado');
            m.fechar();
          } catch (err) { toast(mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}
