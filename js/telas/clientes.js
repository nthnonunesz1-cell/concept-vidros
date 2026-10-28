// Cadastro de clientes, com histórico de serviços e quanto falta receber de cada um.
import { estado, ehAdmin, buscar, carregou } from '../estado.js';
import {
  $, esc, icone, moeda, dataBR, contem, soDigitos, campo, dadosForm, abrirModal, confirmar, toast,
  mensagemErro, comCarregando, linkWhatsApp, linkTelefone, vazio, carregandoHtml, mascarar, avatar, primeiroNome,
} from '../util.js';
import { saldoServico } from '../regras.js';
import { STATUS_FILA } from '../constantes.js';
import * as acoes from '../acoes.js';
import { abrirFormServico, fichaServico, ligarFichas } from './servicos.js';

const filtros = { busca: '', ordem: 'nome' };
let raiz = null;

function resumoPorCliente() {
  const mapa = new Map();
  for (const s of estado.servicos) {
    if (!s.clienteId) continue;
    const r = mapa.get(s.clienteId) || { total: 0, abertos: 0, saldo: 0, gasto: 0, ultimo: '' };
    r.total++;
    if (STATUS_FILA.includes(s.status)) r.abertos++;
    r.saldo += saldoServico(s);
    if (s.status !== 'cancelado' && s.status !== 'orcamento') r.gasto += Number(s.valorTotal) || 0;
    if ((s.criadoEm || '') > r.ultimo) r.ultimo = s.criadoEm || '';
    mapa.set(s.clienteId, r);
  }
  return mapa;
}

export default {
  titulo: 'Clientes',

  montar(el) {
    el.innerHTML = `
      <div class="cab-tela">
        <h1>Clientes</h1>
        <div class="cab-acoes">
          <button type="button" class="btn btn-primario" id="btn-novo-cliente">${icone('novo')} Novo cliente</button>
        </div>
      </div>
      <div class="barra-ferramentas">
        <label class="busca">
          ${icone('busca')}
          <span class="sr">Buscar cliente</span>
          <input id="busca-clientes" type="search" placeholder="Nome, telefone, bairro ou CPF/CNPJ" value="${esc(filtros.busca)}" autocomplete="off">
        </label>
        <label class="seletor-inline">
          <span>Ordenar</span>
          <select id="ordem-clientes">
            <option value="nome" ${filtros.ordem === 'nome' ? 'selected' : ''}>Nome</option>
            <option value="recentes" ${filtros.ordem === 'recentes' ? 'selected' : ''}>Serviço mais recente</option>
            <option value="saldo" ${filtros.ordem === 'saldo' ? 'selected' : ''}>Falta receber</option>
          </select>
        </label>
      </div>
      <p class="contagem" id="contagem-clientes"></p>
      <div id="area-clientes"></div>`;

    raiz = $('#area-clientes', el);
    $('#btn-novo-cliente', el).addEventListener('click', () => abrirFormCliente());
    $('#busca-clientes', el).addEventListener('input', e => { filtros.busca = e.target.value; this.atualizar(); });
    $('#ordem-clientes', el).addEventListener('change', e => { filtros.ordem = e.target.value; this.atualizar(); });
    raiz.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      if (e.target.closest('[data-novo-cliente]')) { abrirFormCliente(); return; }
      const l = e.target.closest('[data-abrir-cliente]');
      if (l) abrirCliente(l.dataset.abrirCliente);
    });
    raiz.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('[data-abrir-cliente]')) abrirCliente(e.target.dataset.abrirCliente);
    });
    this.atualizar();
  },

  atualizar() {
    if (!raiz || !document.contains(raiz)) return;
    if (!carregou('clientes')) { raiz.innerHTML = carregandoHtml('Carregando clientes…'); return; }
    const resumo = resumoPorCliente();
    const t = filtros.busca.trim();
    const dig = soDigitos(t);
    let lista = estado.clientes;
    if (t) {
      lista = lista.filter(c => contem(`${c.nome} ${c.bairro} ${c.cidade} ${c.email} ${c.endereco}`, t)
        || (dig.length >= 3 && (soDigitos(c.telefone).includes(dig) || soDigitos(c.documento).includes(dig))));
    }
    lista = [...lista];
    if (filtros.ordem === 'recentes') lista.sort((a, b) => (resumo.get(b.id)?.ultimo || '').localeCompare(resumo.get(a.id)?.ultimo || ''));
    else if (filtros.ordem === 'saldo') lista.sort((a, b) => (resumo.get(b.id)?.saldo || 0) - (resumo.get(a.id)?.saldo || 0));
    else lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    $('#contagem-clientes').textContent = `${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}${t ? ' encontrados' : ''}`;

    if (!lista.length) {
      raiz.innerHTML = vazio(t ? 'Nenhum cliente encontrado com essa busca.' : 'Nenhum cliente cadastrado ainda.',
        `<button type="button" class="btn btn-primario" data-novo-cliente>${icone('novo')} Cadastrar cliente</button>`);
      return;
    }

    raiz.innerHTML = `<div class="tabela-linhas t-clientes">
        <div class="linha cabecalho" aria-hidden="true">
          <span>Cliente</span><span>Telefone</span><span>Serviços</span><span>Falta receber</span><span></span>
        </div>
        ${lista.map(c => {
          const r = resumo.get(c.id) || { total: 0, abertos: 0, saldo: 0 };
          const whats = linkWhatsApp(c.telefone);
          return `<div class="linha" data-abrir-cliente="${c.id}" tabindex="0">
              <div class="c-principal">${avatar(c.nome)}<div><strong>${esc(c.nome)}</strong><span>${esc([c.bairro, c.cidade].filter(Boolean).join(', ') || c.endereco || '')}</span></div></div>
              <div class="c-info" data-rotulo="Telefone">${esc(c.telefone || '–')}</div>
              <div class="c-info" data-rotulo="Serviços">${r.total}${r.abertos ? ` <span class="etiqueta et-neutra">${r.abertos} em aberto</span>` : ''}</div>
              <div class="c-info ${r.saldo > 0 ? 'texto-alerta' : 'texto-suave'}" data-rotulo="Falta receber">${r.saldo > 0 ? moeda(r.saldo) : '–'}</div>
              <div class="c-acoes">
                ${whats ? `<a class="btn-icone" href="${whats}" target="_blank" rel="noopener" aria-label="WhatsApp de ${esc(c.nome)}" title="WhatsApp">${icone('conversa')}</a>` : ''}
                ${c.telefone ? `<a class="btn-icone" href="${linkTelefone(c.telefone)}" aria-label="Ligar para ${esc(c.nome)}" title="Ligar">${icone('telefone')}</a>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  },
};

// ------------------------------------------------------------------ detalhes

export function abrirCliente(id) {
  const c0 = buscar('clientes', id);
  if (!c0) { toast('Cliente não encontrado.', 'erro'); return; }
  abrirModal({
    titulo: esc(c0.nome),
    classe: 'modal-largo',
    corpo: '<div class="det-conteudo"></div>',
    rodape: '<span></span>',
    aoMontar(m) {
      const conteudo = $('.det-conteudo', m.el);
      ligarFichas(conteudo);
      const desenhar = () => {
        const c = buscar('clientes', id);
        if (!c) { m.fechar(); return; }
        $('h2', m.el).textContent = c.nome;
        const servs = estado.servicos.filter(s => s.clienteId === id).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
        const saldo = servs.reduce((t, s) => t + saldoServico(s), 0);
        const gasto = servs.filter(s => !['cancelado', 'orcamento'].includes(s.status)).reduce((t, s) => t + (Number(s.valorTotal) || 0), 0);
        const whats = linkWhatsApp(c.telefone, `Olá, ${primeiroNome(c.nome)}! Aqui é da ${estado.empresa?.nome || 'vidraçaria'}.`);
        conteudo.innerHTML = `
          <div class="det-colunas">
            <section class="det-bloco">
              <h3>Contato</h3>
              ${c.telefone ? `<p class="det-contato">${esc(c.telefone)}
                ${whats ? `<a class="btn btn-pequeno" href="${whats}" target="_blank" rel="noopener">${icone('conversa')} WhatsApp</a>` : ''}
                <a class="btn btn-pequeno" href="${linkTelefone(c.telefone)}">${icone('telefone')} Ligar</a></p>` : '<p class="texto-suave">Sem telefone</p>'}
              ${c.email ? `<p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}
              ${c.endereco || c.bairro ? `<p class="det-endereco">${esc([c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '))}</p>` : ''}
              ${c.documento ? `<p class="texto-suave">CPF/CNPJ ${esc(c.documento)}</p>` : ''}
              ${c.obs ? `<p class="det-obs">${icone('nota')}<span>${esc(c.obs)}</span></p>` : ''}
            </section>
            <section class="det-bloco">
              <dl class="resumo-mini">
                <div><dt>Serviços</dt><dd>${servs.length}</dd></div>
                <div><dt>Total fechado</dt><dd>${moeda(gasto)}</dd></div>
                <div><dt>Falta receber</dt><dd class="${saldo > 0 ? 'texto-alerta' : ''}">${moeda(saldo)}</dd></div>
              </dl>
              <p class="texto-suave">Cliente desde ${dataBR(c.criadoEm)}</p>
            </section>
          </div>
          <section class="det-bloco">
            <div class="bloco-cab">
              <h3>Serviços</h3>
              <button type="button" class="btn btn-pequeno" data-novo-servico-cliente>${icone('novo')} Novo serviço</button>
            </div>
            ${servs.length ? `<div class="grade-fichas grade-compacta">${servs.map(s => fichaServico(s, { comAcoes: false })).join('')}</div>`
              : '<p class="texto-suave">Nenhum serviço para este cliente ainda.</p>'}
          </section>`;
        m.rodape.innerHTML = `
          ${ehAdmin() ? `<button type="button" class="btn btn-perigo-texto" data-excluir-cliente>${icone('lixeira')}<span>Excluir</span></button>` : ''}
          <span class="espaco"></span>
          <button type="button" class="btn" data-editar-cliente>${icone('editar')}<span>Editar</span></button>
          <button type="button" class="btn btn-primario" data-novo-servico-cliente>${icone('novo')}<span>Novo serviço</span></button>`;
      };
      m.atualizar = desenhar;
      desenhar();

      m.el.addEventListener('click', async e => {
        if (e.target.closest('[data-novo-servico-cliente]')) abrirFormServico(null, { clienteId: id });
        else if (e.target.closest('[data-editar-cliente]')) abrirFormCliente(id);
        else if (e.target.closest('[data-excluir-cliente]')) {
          const c = buscar('clientes', id);
          const n = estado.servicos.filter(s => s.clienteId === id).length;
          const ok = await confirmar(`Excluir ${c.nome}?${n ? ` Os ${n} serviço(s) dele continuam salvos com o nome.` : ''}`, { titulo: 'Excluir cliente', sim: 'Excluir', perigo: true });
          if (!ok) return;
          try { await acoes.excluirCliente(id); toast('Cliente excluído'); m.fechar(); }
          catch (err) { toast(mensagemErro(err), 'erro'); }
        }
      });
    },
  });
}

// ------------------------------------------------------------------ formulário

/**
 * aoSalvar(id, dados): chamado depois de salvar (usado pelo cadastro rápido dentro do serviço)
 */
export function abrirFormCliente(id = null, { nome = '', aoSalvar = null } = {}) {
  const c = id ? buscar('clientes', id) : null;
  const v = k => (c ? c[k] || '' : '');
  abrirModal({
    titulo: c ? 'Editar cliente' : 'Novo cliente',
    fecharFora: false,
    corpo: `<form id="form-cliente" class="form-grade" novalidate autocomplete="off">
        ${campo({ rotulo: 'Nome', nome: 'nome', obrigatorio: true, valor: c ? c.nome : nome, classe: 'inteiro', attrs: 'autofocus autocomplete="off"' })}
        ${campo({ rotulo: 'Telefone / WhatsApp', nome: 'telefone', tipo: 'tel', valor: v('telefone'), placeholder: '(00) 00000-0000', attrs: 'inputmode="tel"' })}
        ${campo({ rotulo: 'CPF ou CNPJ', nome: 'documento', valor: v('documento'), attrs: 'inputmode="numeric"' })}
        ${campo({ rotulo: 'Endereço', nome: 'endereco', valor: v('endereco'), classe: 'inteiro', placeholder: 'Rua e número' })}
        ${campo({ rotulo: 'Bairro', nome: 'bairro', valor: v('bairro') })}
        ${campo({ rotulo: 'Cidade', nome: 'cidade', valor: v('cidade') })}
        ${campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', valor: v('email'), classe: 'inteiro' })}
        ${campo({ rotulo: 'Observações', nome: 'obs', tipo: 'textarea', linhas: 2, valor: v('obs'), classe: 'inteiro', placeholder: 'Ex.: ponto de referência, melhor horário' })}
      </form>`,
    rodape: `<button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-cliente" class="btn btn-primario">${c ? 'Salvar alterações' : 'Cadastrar cliente'}</button>`,
    aoMontar(m) {
      const form = $('#form-cliente', m.el);
      mascarar(form.telefone, 'telefone');
      mascarar(form.documento, 'documento');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        if (!d.nome) { toast('Digite o nome do cliente.', 'erro'); form.nome.focus(); return; }
        const dig = soDigitos(d.telefone);
        if (!id && dig.length >= 8) {
          const igual = estado.clientes.find(x => soDigitos(x.telefone) === dig);
          if (igual) {
            const ok = await confirmar(`Já existe um cliente com esse telefone: ${igual.nome}. Cadastrar mesmo assim?`, { titulo: 'Telefone repetido', sim: 'Cadastrar outro', nao: 'Voltar' });
            if (!ok) return;
          }
        }
        await comCarregando($('[type=submit]', m.el), async () => {
          try {
            const novoId = await acoes.salvarCliente(d, id);
            toast(id ? 'Cliente atualizado' : 'Cliente cadastrado');
            m.fechar();
            aoSalvar?.(novoId, d);
          } catch (err) { toast(mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}

