// Fila de serviços: quadro por etapa, lista com filtros, cadastro, detalhes e pagamentos.
import { estado, ehAdmin, buscar, carregou, aguardar } from '../estado.js';
import {
  STATUS, STATUS_FILA, STATUS_EM_ANDAMENTO, PROXIMO_STATUS, ROTULO_AVANCAR,
  TIPOS_SERVICO, FORMAS_PAGAMENTO, statusInfo,
} from '../constantes.js';
import {
  $, $$, esc, icone, moeda, num, numCampo, lerNumero, dataBR, dataRelativa, dataHoraBR, hoje,
  contem, soDigitos, campo, ATTR_DECIMAL, dadosForm, abrirModal, confirmar, toast, mensagemErro,
  comCarregando, linkWhatsApp, linkTelefone, vazio, carregandoHtml, telaPequena, primeiroNome, arred,
} from '../util.js';
import {
  calcularItem, totaisServico, numeroOS, totalPago, saldoServico, atrasado, ordenarFila,
  modoDaUnidade, medidaTexto, quantTexto, materiaisDoServico, ROTULO_MEDIDA, UNIDADE_DO_MODO,
} from '../regras.js';
import * as acoes from '../acoes.js';
import { abrirFormCliente, abrirCliente } from './clientes.js';
import { abrirMovimento } from './estoque.js';
import { abrirDocumento, textoOrcamento } from '../documento.js';

// ------------------------------------------------------------------ preferências da tela

// filtro: 'fila' (tudo em aberto), 'meus', 'atrasados', 'concluido' ou 'cancelado'
const filtros = { status: 'fila', busca: '' };
const FILTROS = [['fila', 'Na fila'], ['meus', 'Meus'], ['atrasados', 'Atrasados'], ['concluido', 'Concluídos'], ['cancelado', 'Cancelados']];

function lerPref(chave, padrao) {
  try { return localStorage.getItem(`vid-${chave}`) || padrao; } catch { return padrao; }
}
function gravarPref(chave, valor) {
  try { localStorage.setItem(`vid-${chave}`, valor); } catch {}
}

let visao = lerPref('visao-servicos', telaPequena() ? 'lista' : 'quadro');
let raiz = null;

// ------------------------------------------------------------------ tela

export default {
  titulo: 'Serviços',

  montar(el, params = {}) {
    if (params.filtro) filtros.status = FILTROS.some(([id]) => id === params.filtro) ? params.filtro : 'fila';
    if (params.meus === '1') filtros.status = 'meus';

    el.innerHTML = `
      <div class="cab-tela">
        <h1>Serviços</h1>
        <div class="cab-acoes">
          <button type="button" class="btn btn-primario" id="btn-novo-servico">${icone('novo')} Novo serviço</button>
        </div>
      </div>
      <div class="barra-ferramentas">
        <label class="busca">
          ${icone('busca')}
          <span class="sr">Buscar serviço</span>
          <input id="busca-servicos" type="search" placeholder="Cliente, número, descrição…" value="${esc(filtros.busca)}" autocomplete="off">
        </label>
        <div class="segmentado" role="group" aria-label="Como mostrar">
          <button type="button" data-visao="quadro" aria-pressed="${visao === 'quadro'}">${icone('quadro')} Quadro</button>
          <button type="button" data-visao="lista" aria-pressed="${visao === 'lista'}">${icone('lista')} Lista</button>
        </div>
      </div>
      <div class="chips" id="chips-servicos" role="group" aria-label="Filtrar serviços"></div>
      <div id="area-servicos"></div>`;

    raiz = $('#area-servicos', el);
    ligarFichas(raiz);
    ligarArrastar(raiz);

    $('#btn-novo-servico', el).addEventListener('click', () => abrirFormServico());
    $('#busca-servicos', el).addEventListener('input', e => { filtros.busca = e.target.value; this.atualizar(); });
    $$('[data-visao]', el).forEach(b => b.addEventListener('click', () => {
      visao = b.dataset.visao;
      gravarPref('visao-servicos', visao);
      $$('[data-visao]', el).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.visao === visao)));
      this.atualizar();
    }));
    $('#chips-servicos', el).addEventListener('click', e => {
      const c = e.target.closest('[data-filtro]');
      if (!c) return;
      filtros.status = c.dataset.filtro;
      this.atualizar();
    });

    this.atualizar();
    if (params.novo) abrirFormServico(null, { clienteId: params.cliente || '' });
    if (params.id) abrirServico(params.id);
  },

  atualizar() {
    if (!raiz || !document.contains(raiz)) return;
    const chips = $('#chips-servicos');
    if (!carregou('servicos')) {
      raiz.innerHTML = carregandoHtml('Carregando serviços…');
      return;
    }
    const base = filtrarBase();
    chips.innerHTML = FILTROS.map(([id, nome]) => {
      const n = porStatus(base, id).length;
      const alerta = id === 'atrasados' && n > 0 ? ' chip-alerta' : '';
      return `<button type="button" class="chip${alerta}" data-filtro="${id}" aria-pressed="${filtros.status === id}">${esc(nome)} <span class="chip-n">${n}</span></button>`;
    }).join('');

    let lista = porStatus(base, filtros.status);
    const encerrados = ['concluido', 'cancelado'].includes(filtros.status);
    // concluídos e cancelados não têm coluna no quadro: aparecem em lista
    if (visao === 'quadro' && !encerrados) {
      raiz.innerHTML = quadroHtml(lista);
      return;
    }
    if (encerrados) {
      lista = [...lista].sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
    } else {
      lista = [...lista].sort(ordenarFila);
    }
    if (!lista.length) {
      raiz.innerHTML = vazio(
        filtros.busca ? 'Nenhum serviço encontrado com essa busca.' : 'Nenhum serviço aqui.',
        `<button type="button" class="btn btn-primario" data-novo-servico>${icone('novo')} Novo serviço</button>`,
      );
      return;
    }
    raiz.innerHTML = `<div class="grade-fichas">${lista.map(s => fichaServico(s)).join('')}</div>`;
  },
};

function filtrarBase() {
  let lista = estado.servicos;
  const t = filtros.busca.trim();
  if (t) {
    const dig = soDigitos(t);
    lista = lista.filter(s =>
      contem(`${s.numero} ${numeroOS(s.numero)} ${s.clienteNome} ${s.descricao} ${s.tipo} ${s.endereco} ${s.responsavelNome}`, t)
      || (dig.length >= 4 && soDigitos(s.clienteTelefone).includes(dig)));
  }
  return lista;
}

function porStatus(lista, f) {
  if (f === 'fila') return lista.filter(s => STATUS_FILA.includes(s.status));
  if (f === 'meus') return lista.filter(s => STATUS_FILA.includes(s.status) && s.responsavelId === estado.usuario?.id);
  if (f === 'atrasados') return lista.filter(atrasado);
  return lista.filter(s => s.status === f);
}

function quadroHtml(lista) {
  const colunas = STATUS_FILA.map(st => {
    const doStatus = lista.filter(s => s.status === st).sort(ordenarFila);
    const soma = doStatus.reduce((t, s) => t + lerNumero(s.valorTotal), 0);
    return `<section class="coluna st-${st}" data-status="${st}" aria-label="${esc(statusInfo(st).nome)}">
        <header class="coluna-cab">
          <h2>${esc(statusInfo(st).nome)}</h2>
          <span class="coluna-n">${doStatus.length}</span>
        </header>
        ${doStatus.length ? `<p class="coluna-soma">${moeda(soma)}</p>` : ''}
        <div class="coluna-corpo">
          ${doStatus.map(s => fichaServico(s, { mostrarStatus: false, arrastavel: true })).join('') || '<p class="coluna-vazia">Nada por aqui</p>'}
        </div>
      </section>`;
  }).join('');
  return `<div class="quadro">${colunas}</div>`;
}

// ------------------------------------------------------------------ ficha (cartão da OS)

export function fichaServico(s, { mostrarStatus = true, arrastavel = false, comAcoes = true, pegar = false } = {}) {
  const st = statusInfo(s.status);
  const late = atrasado(s);
  const prox = PROXIMO_STATUS[s.status];
  const saldo = saldoServico(s);
  const semResp = !s.responsavelId && STATUS_EM_ANDAMENTO.includes(s.status);
  return `<article class="ficha st-${s.status}${late ? ' atrasada' : ''}" data-abrir-servico="${s.id}" tabindex="0" ${arrastavel ? 'draggable="true"' : ''}
      aria-label="OS ${numeroOS(s.numero)}, ${esc(s.clienteNome)}, ${esc(st.nome)}">
      <div class="ficha-topo">
        <span class="os-num">OS ${numeroOS(s.numero)}</span>
        <span class="ficha-etiquetas">
          ${s.prioridade === 'urgente' ? '<span class="etiqueta et-urgente">Urgente</span>' : ''}
          ${late ? '<span class="etiqueta et-perigo">Atrasado</span>' : ''}
          ${mostrarStatus ? `<span class="etiqueta et-st st-${s.status}">${esc(st.curto)}</span>` : ''}
        </span>
      </div>
      <h3 class="ficha-cliente">${esc(s.clienteNome || 'Sem cliente')}</h3>
      <p class="ficha-desc">${s.tipo ? `<span class="ficha-tipo">${esc(s.tipo)}</span> ` : ''}${esc(s.descricao || '')}</p>
      <div class="ficha-meta">
        ${s.dataPrevista ? `<span class="${late ? 'texto-perigo' : ''}">${icone('calendario')}${esc(dataRelativa(s.dataPrevista))}</span>` : ''}
        ${s.responsavelNome ? `<span>${icone('usuario')}${esc(primeiroNome(s.responsavelNome))}</span>` : ''}
        <span class="ficha-valor">${moeda(s.valorTotal)}${saldo > 0 ? ` <small>falta ${moeda(saldo)}</small>` : ''}</span>
      </div>
      ${comAcoes && (prox || (pegar && semResp)) ? `<div class="ficha-acoes">
        ${pegar && semResp ? `<button type="button" class="btn btn-pequeno" data-pegar="${s.id}">${icone('pegar')}<span>Pegar para mim</span></button>`
          : `<button type="button" class="btn btn-pequeno btn-avancar" data-avancar="${s.id}">${esc(ROTULO_AVANCAR[prox])}</button>`}
      </div>` : ''}
    </article>`;
}

// Cliques nas fichas (abrir, avançar, pegar). Use em qualquer área que mostre fichas.
export function ligarFichas(area) {
  area.addEventListener('click', e => {
    const av = e.target.closest('[data-avancar]');
    if (av) {
      e.stopPropagation();
      const s = buscar('servicos', av.dataset.avancar);
      if (s && PROXIMO_STATUS[s.status]) alterarStatus(s, PROXIMO_STATUS[s.status]);
      return;
    }
    const pg = e.target.closest('[data-pegar]');
    if (pg) {
      e.stopPropagation();
      const s = buscar('servicos', pg.dataset.pegar);
      if (s) pegarServico(s);
      return;
    }
    if (e.target.closest('[data-novo-servico]')) { abrirFormServico(); return; }
    const ab = e.target.closest('[data-abrir-servico]');
    if (ab) abrirServico(ab.dataset.abrirServico);
  });
  area.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-abrir-servico]')) {
      e.preventDefault();
      abrirServico(e.target.dataset.abrirServico);
    }
  });
}

// Arrastar fichas entre colunas (só com mouse)
function ligarArrastar(area) {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  area.addEventListener('dragstart', e => {
    const f = e.target.closest('.ficha');
    if (!f) return;
    e.dataTransfer.setData('text/plain', f.dataset.abrirServico);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => f.classList.add('arrastando'));
  });
  area.addEventListener('dragend', () => {
    $$('.arrastando', area).forEach(x => x.classList.remove('arrastando'));
    $$('.coluna.alvo', area).forEach(x => x.classList.remove('alvo'));
  });
  area.addEventListener('dragover', e => {
    const col = e.target.closest('.coluna');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.coluna.alvo', area).forEach(x => x !== col && x.classList.remove('alvo'));
    col.classList.add('alvo');
  });
  area.addEventListener('dragleave', e => {
    const col = e.target.closest('.coluna');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('alvo');
  });
  area.addEventListener('drop', e => {
    const col = e.target.closest('.coluna');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('alvo');
    const s = buscar('servicos', e.dataTransfer.getData('text/plain'));
    if (s && s.status !== col.dataset.status) alterarStatus(s, col.dataset.status);
  });
}

// ------------------------------------------------------------------ ações rápidas

export async function pegarServico(s) {
  try {
    await acoes.definirResponsavel(s, estado.usuario.id);
    toast(`OS ${numeroOS(s.numero)} agora é sua`);
  } catch (e) { toast(mensagemErro(e), 'erro'); }
}

export async function alterarStatus(s, novo) {
  if (s.status === novo) return;
  try {
    await acoes.mudarStatus(s, novo);
    toast(`OS ${numeroOS(s.numero)}: ${statusInfo(novo).nome}`);
  } catch (e) {
    toast(mensagemErro(e), 'erro');
    return;
  }

  const mats = materiaisDoServico(s).filter(m => buscar('produtos', m.produtoId));
  if (['producao', 'pronto', 'concluido'].includes(novo) && mats.length && !s.estoqueBaixado) {
    const lista = `<ul class="lista-simples">${mats.map(m => {
      const p = buscar('produtos', m.produtoId);
      return `<li>${esc(p.nome)} <strong>${num(m.quant, 3)} ${esc(p.unidade)}</strong></li>`;
    }).join('')}</ul>`;
    const ok = await confirmar('Dar baixa no estoque dos materiais deste serviço?', {
      titulo: 'Baixa no estoque', sim: 'Dar baixa', nao: 'Agora não', detalhe: lista,
    });
    if (ok) {
      try { await acoes.baixarMateriais(buscar('servicos', s.id) || s); toast('Baixa no estoque feita'); }
      catch (e) { toast(mensagemErro(e), 'erro'); }
    }
  }

  if (novo === 'concluido') {
    const saldo = saldoServico({ ...s, status: 'concluido' });
    if (saldo > 0) {
      const ok = await confirmar(`Ainda falta receber ${moeda(saldo)} deste serviço. Registrar o pagamento agora?`, {
        titulo: 'Falta receber', sim: 'Registrar pagamento', nao: 'Depois',
      });
      if (ok) abrirPagamento(s.id);
    }
  }
}

function mensagemWhats(s) {
  const emp = estado.empresa?.nome || 'vidraçaria';
  const nome = primeiroNome(s.clienteNome);
  const n = numeroOS(s.numero);
  const servico = s.tipo ? s.tipo.toLowerCase() : 'serviço';
  switch (s.status) {
    case 'orcamento':
      return textoOrcamento(s);
    case 'aguardando':
      return `Olá, ${nome}! Aqui é da ${emp}. Seu pedido nº ${n} (${servico}) está aguardando a chegada do material. Assim que chegar, avisamos.`;
    case 'producao':
      return `Olá, ${nome}! Aqui é da ${emp}. Seu pedido nº ${n} (${servico}) já está em produção.`;
    case 'pronto':
      return `Olá, ${nome}! Aqui é da ${emp}. Seu pedido nº ${n} (${servico}) está pronto. Podemos combinar a entrega ou instalação?`;
    case 'concluido':
      return `Olá, ${nome}! Aqui é da ${emp}. Obrigado pela preferência! Qualquer coisa sobre o pedido nº ${n}, é só chamar.`;
    default:
      return `Olá, ${nome}! Aqui é da ${emp}, sobre o pedido nº ${n} (${servico}).`;
  }
}

// ------------------------------------------------------------------ detalhes da OS

export function abrirServico(id) {
  const inicial = buscar('servicos', id);
  if (!inicial) { toast('Serviço não encontrado.', 'erro'); return; }

  abrirModal({
    titulo: `OS ${numeroOS(inicial.numero)}`,
    classe: 'modal-largo modal-servico',
    corpo: `<div class="det-conteudo"></div>
      <details class="det-historico">
        <summary>Histórico e anotações</summary>
        <form class="nota-form" autocomplete="off">
          <label class="sr" for="nota-${id}">Nova anotação</label>
          <input id="nota-${id}" name="nota" placeholder="Escrever uma anotação" maxlength="500">
          <button type="submit" class="btn">${icone('nota')} Anotar</button>
        </form>
        <ol class="linha-tempo"></ol>
      </details>
      <div class="det-mais"></div>`,
    rodape: '<span></span>',
    aoMontar(m) {
      const conteudo = $('.det-conteudo', m.el);
      const mais = $('.det-mais', m.el);
      const tempo = $('.linha-tempo', m.el);
      const resumoHist = $('.det-historico summary', m.el);

      const desenhar = () => {
        const s = buscar('servicos', id);
        if (!s) { m.fechar(); return; }
        conteudo.innerHTML = detalheHtml(s);
        tempo.innerHTML = historicoHtml(s);
        resumoHist.textContent = `Histórico e anotações (${(s.historico || []).length})`;
        mais.innerHTML = maisAcoesHtml(s);
        m.rodape.innerHTML = rodapeHtml(s);
      };
      m.atualizar = desenhar;
      desenhar();

      $('.nota-form', m.el).addEventListener('submit', async e => {
        e.preventDefault();
        const inp = e.target.nota;
        const texto = inp.value.trim();
        if (!texto) return;
        const s = buscar('servicos', id);
        try { await acoes.adicionarNota(s, texto); inp.value = ''; toast('Anotação salva'); }
        catch (err) { toast(mensagemErro(err), 'erro'); }
      });

      m.el.addEventListener('change', async e => {
        if (!e.target.matches('[data-responsavel]')) return;
        const s = buscar('servicos', id);
        try { await acoes.definirResponsavel(s, e.target.value); toast('Responsável alterado'); }
        catch (err) { toast(mensagemErro(err), 'erro'); }
      });

      m.el.addEventListener('click', async e => {
        const s = buscar('servicos', id);
        if (!s) return;
        const b = e.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'status') alterarStatus(s, b.dataset.status);
        else if (acao === 'avancar') alterarStatus(s, PROXIMO_STATUS[s.status]);
        else if (acao === 'editar') abrirFormServico(s.id);
        else if (acao === 'pagamento') abrirPagamento(s.id);
        else if (acao === 'remover-pagamento') removerPagamento(s, b.dataset.id);
        else if (acao === 'baixar') baixar(s);
        else if (acao === 'material') abrirMovimento({ tipo: 'saida', servicoId: s.id });
        else if (acao === 'pdf') abrirDocumento(s.id);
        else if (acao === 'orcamento') abrirDocumento(s.id, 'orcamento');
        else if (acao === 'recibo') abrirDocumento(s.id, 'recibo');
        else if (acao === 'os') abrirDocumento(s.id, 'os');
        else if (acao === 'cancelar') cancelar(s);
        else if (acao === 'reabrir') reabrir(s);
        else if (acao === 'excluir') excluir(s, m);
        else if (acao === 'cliente') abrirCliente(s.clienteId);
        else if (acao === 'pegar') pegarServico(s);
      });
    },
  });
}

function detalheHtml(s) {
  const st = statusInfo(s.status);
  const late = atrasado(s);
  const { itens, somaItens, maoDeObra, desconto, total } = totaisServico(s);
  const pago = totalPago(s);
  const saldo = arred(Math.max(0, total - pago));
  const cliente = buscar('clientes', s.clienteId);
  const tel = cliente?.telefone || s.clienteTelefone;
  const whats = linkWhatsApp(tel, mensagemWhats(s));
  const mats = materiaisDoServico(s);
  const ordemFluxo = ['orcamento', 'aprovado', 'aguardando', 'producao', 'pronto', 'concluido'];
  const posAtual = ordemFluxo.indexOf(s.status);
  const usuariosAtivos = estado.usuarios.filter(u => u.ativo !== false && u.nome);

  const passos = s.status === 'cancelado'
    ? `<div class="aviso aviso-perigo">${icone('alerta')}<span>Serviço cancelado.</span><button type="button" class="btn btn-pequeno" data-acao="reabrir">${icone('reabrir')} Reabrir</button></div>`
    : `<ol class="passos" aria-label="Etapas do serviço">${ordemFluxo.map((id, i) => {
        const cls = i < posAtual ? 'feito' : i === posAtual ? 'atual' : '';
        return `<li class="${cls} st-${id}"><button type="button" data-acao="status" data-status="${id}" ${i === posAtual ? 'aria-current="step"' : ''}>${esc(statusInfo(id).curto)}</button></li>`;
      }).join('')}</ol>`;

  const linhasItens = itens.map(it => `<tr>
      <td>${esc(it.descricao)}${it.produtoId ? ` <span class="marcador" title="Ligado ao estoque">${icone('estoque')}</span>` : ''}
        <small class="item-meta">${esc([medidaTexto(it), `qtd ${num(it.qtd, 3)}`].filter(Boolean).join(', '))}: ${esc(quantTexto(it))} × ${moeda(it.preco)}</small></td>
      <td>${esc(medidaTexto(it))}</td>
      <td class="num">${num(it.qtd, 3)}</td>
      <td class="num">${esc(quantTexto(it))}</td>
      <td class="num">${moeda(it.preco)}</td>
      <td class="num"><strong>${moeda(it.subtotal)}</strong></td>
    </tr>`).join('');

  const pagamentos = (s.pagamentos || []).map(p => `<li>
      <span>${dataBR(p.data)}</span>
      <span>${esc(p.forma || '')}${p.obs ? `, ${esc(p.obs)}` : ''}<small>${esc(p.usuarioNome || '')}</small></span>
      <strong>${moeda(p.valor)}</strong>
      ${ehAdmin() ? `<button type="button" class="btn-icone btn-pequeno" data-acao="remover-pagamento" data-id="${p.id}" aria-label="Remover pagamento">${icone('lixeira')}</button>` : ''}
    </li>`).join('');

  return `
    <div class="det-topo">
      <span class="etiqueta et-st st-${s.status}">${esc(st.nome)}</span>
      ${s.prioridade === 'urgente' ? '<span class="etiqueta et-urgente">Urgente</span>' : ''}
      ${late ? '<span class="etiqueta et-perigo">Atrasado</span>' : ''}
    </div>
    ${passos}

    <div class="det-colunas">
      <section class="det-bloco">
        <h3>Cliente</h3>
        <p class="det-cliente"><button type="button" class="link" data-acao="cliente" ${cliente ? '' : 'disabled'}>${esc(s.clienteNome || 'Sem cliente')}</button></p>
        ${tel ? `<p class="det-contato">${esc(tel)}
          ${whats ? `<a class="btn btn-pequeno" href="${whats}" target="_blank" rel="noopener">${icone('conversa')} WhatsApp</a>` : ''}
          <a class="btn btn-pequeno" href="${linkTelefone(tel)}">${icone('telefone')} Ligar</a></p>` : ''}
        ${s.endereco ? `<p class="det-endereco">${esc(s.endereco)}</p>` : ''}
      </section>

      <section class="det-bloco">
        <dl class="det-dados">
          <div><dt>Entrega</dt><dd class="${late ? 'texto-perigo' : ''}">${s.dataPrevista ? `${dataBR(s.dataPrevista)} (${esc(dataRelativa(s.dataPrevista))})` : 'A combinar'}</dd></div>
          <div><dt><label for="resp-${s.id}">Responsável</label></dt><dd>
            <select id="resp-${s.id}" data-responsavel>
              <option value="">Sem responsável</option>
              ${usuariosAtivos.map(u => `<option value="${u.id}" ${u.id === s.responsavelId ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}
            </select>
            ${!s.responsavelId ? `<button type="button" class="btn btn-pequeno" data-acao="pegar">${icone('pegar')} Pegar para mim</button>` : ''}
          </dd></div>
          ${s.formaCombinada ? `<div><dt>Pagamento combinado</dt><dd>${esc(s.formaCombinada)}</dd></div>` : ''}
        </dl>
      </section>
    </div>

    <section class="det-bloco">
      <h3>${esc(s.tipo || 'O que fazer')}</h3>
      <p class="det-desc">${esc(s.descricao || '')}</p>
      ${s.obs ? `<p class="det-obs">${icone('nota')}<span>${esc(s.obs)}</span></p>` : ''}
    </section>

    <section class="det-bloco">
      <h3>Itens e medidas</h3>
      ${itens.length ? `<div class="rolagem-x"><table class="tabela-itens">
        <thead><tr><th>Descrição</th><th>Medidas</th><th class="num">Qtd.</th><th class="num">Total</th><th class="num">Preço</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${linhasItens}</tbody>
      </table></div>` : '<p class="texto-suave">Nenhum item lançado.</p>'}
      <dl class="totais">
        ${itens.length ? `<div><dt>Itens</dt><dd>${moeda(somaItens)}</dd></div>` : ''}
        ${maoDeObra ? `<div><dt>Mão de obra / instalação</dt><dd>${moeda(maoDeObra)}</dd></div>` : ''}
        ${desconto ? `<div><dt>Desconto</dt><dd>− ${moeda(desconto)}</dd></div>` : ''}
        <div class="total"><dt>Total</dt><dd>${moeda(total)}</dd></div>
      </dl>
      ${s.status !== 'cancelado' ? `<p class="det-estoque">
        ${mats.length && s.estoqueBaixado ? `<span class="texto-ok">${icone('check')} Baixa no estoque feita</span>` : ''}
        ${mats.length && !s.estoqueBaixado ? `<button type="button" class="btn btn-pequeno" data-acao="baixar">${icone('saida')} Dar baixa no estoque</button>` : ''}
        <button type="button" class="link" data-acao="material">Usar outro material do estoque</button>
      </p>` : ''}
    </section>

    <section class="det-bloco">
      <div class="bloco-cab">
        <h3>Pagamentos</h3>
        ${s.status !== 'cancelado' && saldo > 0 ? `<button type="button" class="btn btn-pequeno" data-acao="pagamento">${icone('receber')} Registrar pagamento</button>` : ''}
      </div>
      <div class="medidor-pago" aria-hidden="true"><span style="width:${total ? Math.min(100, (pago / total) * 100) : 0}%"></span></div>
      <p class="resumo-pago">Pago <strong>${moeda(pago)}</strong> de ${moeda(total)}${saldo > 0 ? `. Falta <strong class="texto-alerta">${moeda(saldo)}</strong>` : pago ? '. Tudo pago.' : ''}</p>
      ${pagamentos ? `<ul class="lista-pagamentos">${pagamentos}</ul>` : ''}
    </section>`;
}

function historicoHtml(s) {
  return [...(s.historico || [])].reverse().map(h => `<li class="${h.nota ? 'h-nota' : `h-status st-${h.status}`}">
      <span class="h-quando">${dataHoraBR(h.data)}</span>
      <span class="h-texto">${h.nota ? esc(h.obs) : `<strong>${esc(statusInfo(h.status).nome)}</strong>${h.obs ? `: ${esc(h.obs)}` : ''}`}</span>
      <span class="h-quem">${esc(h.usuarioNome || '')}</span>
    </li>`).join('');
}

// Ações menos usadas ficam discretas no fim da janela.
// Orçamento, recibo e OS da produção ficam todos no botão "Enviar PDF".
function maisAcoesHtml(s) {
  return `<div class="det-acoes-extra">
      ${s.status !== 'cancelado' && s.status !== 'concluido' ? `<button type="button" class="link link-suave" data-acao="cancelar">Cancelar serviço</button>` : ''}
      ${s.status === 'concluido' ? `<button type="button" class="link link-suave" data-acao="reabrir">Reabrir serviço</button>` : ''}
      ${ehAdmin() ? `<button type="button" class="link link-perigo" data-acao="excluir">Excluir</button>` : ''}
    </div>`;
}

function rodapeHtml(s) {
  const prox = PROXIMO_STATUS[s.status];
  return `
    <button type="button" class="btn" data-acao="pdf">${icone('compartilhar')}<span>Enviar PDF</span></button>
    <button type="button" class="btn" data-acao="editar">${icone('editar')}<span>Editar</span></button>
    ${prox ? `<button type="button" class="btn btn-primario" data-acao="avancar">${esc(ROTULO_AVANCAR[prox])}</button>` : ''}`;
}

async function baixar(s) {
  try {
    const n = await acoes.baixarMateriais(s);
    toast(n ? 'Baixa no estoque feita' : 'Nenhum material para baixar');
  } catch (e) { toast(mensagemErro(e), 'erro'); }
}

async function removerPagamento(s, pagId) {
  const p = (s.pagamentos || []).find(x => x.id === pagId);
  if (!p) return;
  const ok = await confirmar(`Remover o pagamento de ${moeda(p.valor)} do dia ${dataBR(p.data)}? Ele também sai do financeiro.`, { titulo: 'Remover pagamento', sim: 'Remover', perigo: true });
  if (!ok) return;
  try { await acoes.removerPagamento(s, pagId); toast('Pagamento removido'); }
  catch (e) { toast(mensagemErro(e), 'erro'); }
}

function cancelar(s) {
  abrirModal({
    titulo: `Cancelar OS ${numeroOS(s.numero)}`,
    classe: 'modal-pequeno',
    corpo: `<form id="form-cancelar">${campo({ rotulo: 'Motivo (opcional)', nome: 'motivo', tipo: 'textarea', linhas: 2, placeholder: 'Ex.: cliente desistiu' })}</form>`,
    rodape: `<button type="button" class="btn" data-fechar>Voltar</button>
             <button type="submit" form="form-cancelar" class="btn btn-perigo">Cancelar serviço</button>`,
    aoMontar(m) {
      $('#form-cancelar', m.el).addEventListener('submit', async e => {
        e.preventDefault();
        try {
          await acoes.mudarStatus(s, 'cancelado', e.target.motivo.value.trim());
          toast(`OS ${numeroOS(s.numero)} cancelada`);
          m.fechar();
        } catch (err) { toast(mensagemErro(err), 'erro'); }
      });
    },
  });
}

async function reabrir(s) {
  const anteriores = (s.historico || []).filter(h => !h.nota && !['cancelado', 'concluido'].includes(h.status));
  const voltarPara = anteriores.length ? anteriores[anteriores.length - 1].status : 'orcamento';
  try {
    await acoes.mudarStatus(s, voltarPara, 'Reaberto');
    toast(`OS ${numeroOS(s.numero)} voltou para "${statusInfo(voltarPara).nome}"`);
  } catch (e) { toast(mensagemErro(e), 'erro'); }
}

async function excluir(s, modal) {
  const pags = (s.pagamentos || []).length;
  const ok = await confirmar(
    `Excluir a OS ${numeroOS(s.numero)} de ${s.clienteNome}? ${pags ? `Os ${pags} pagamento(s) dela também serão apagados do financeiro. ` : ''}Não dá para desfazer.`,
    { titulo: 'Excluir serviço', sim: 'Excluir', perigo: true },
  );
  if (!ok) return;
  try {
    await acoes.excluirServico(s);
    modal.fechar();
    toast('Serviço excluído');
  } catch (e) { toast(mensagemErro(e), 'erro'); }
}

// ------------------------------------------------------------------ pagamento

export function abrirPagamento(id) {
  const s = buscar('servicos', id);
  if (!s) return;
  const pago = totalPago(s);
  const falta = arred(Math.max(0, lerNumero(s.valorTotal) - pago));
  abrirModal({
    titulo: `Pagamento da OS ${numeroOS(s.numero)}`,
    classe: 'modal-pequeno',
    fecharFora: false,
    corpo: `<form id="form-pagamento" class="form-grade" novalidate>
        <dl class="resumo-mini inteiro">
          <div><dt>Total</dt><dd>${moeda(s.valorTotal)}</dd></div>
          <div><dt>Já pago</dt><dd>${moeda(pago)}</dd></div>
          <div><dt>Falta</dt><dd><strong>${moeda(falta)}</strong></dd></div>
        </dl>
        ${campo({ rotulo: 'Valor recebido (R$)', nome: 'valor', valor: numCampo(falta), obrigatorio: true, attrs: `${ATTR_DECIMAL} autofocus` })}
        ${campo({ rotulo: 'Data', nome: 'data', tipo: 'date', valor: hoje(), obrigatorio: true })}
        ${campo({ rotulo: 'Forma de pagamento', nome: 'forma', tipo: 'select', opcoes: FORMAS_PAGAMENTO, classe: 'inteiro' })}
        ${campo({ rotulo: 'Observação', nome: 'obs', placeholder: 'Ex.: entrada, 2ª parcela…', classe: 'inteiro' })}
      </form>`,
    rodape: `<button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-pagamento" class="btn btn-primario">Registrar pagamento</button>`,
    aoMontar(m) {
      const form = $('#form-pagamento', m.el);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        const valor = lerNumero(d.valor);
        if (!(valor > 0)) { toast('Digite o valor recebido.', 'erro'); form.valor.focus(); return; }
        if (valor > falta + 0.009 && falta > 0) {
          const ok = await confirmar(`O valor é maior que o que falta (${moeda(falta)}). Registrar mesmo assim?`, { sim: 'Registrar' });
          if (!ok) return;
        }
        await comCarregando($('[type=submit]', m.el), async () => {
          try {
            await acoes.registrarPagamento(buscar('servicos', id) || s, { ...d, valor });
            toast(`Pagamento de ${moeda(valor)} registrado`);
            m.fechar();
          } catch (err) { toast(mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}

// ------------------------------------------------------------------ formulário do serviço

const itemVazio = () => ({ produtoId: '', descricao: '', modo: 'm2', larg: '', alt: '', qtd: 1, preco: '' });

function opcoesProdutos(sel) {
  const grupos = {};
  for (const p of [...estado.produtos].sort((a, b) => a.nome.localeCompare(b.nome))) (grupos[p.categoria || 'Outros'] ||= []).push(p);
  const ops = Object.entries(grupos).map(([cat, lista]) => `<optgroup label="${esc(cat)}">${lista.map(p =>
    `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</optgroup>`).join('');
  return `<option value="">Outro (digitar)</option>${ops}`;
}

// Com produto do estoque escolhido, a descrição e a forma de cobrar vêm do produto
// e somem da tela. Item avulso mostra os dois campos.
function linhaItem(it, i) {
  const calc = calcularItem(it);
  const prod = it.produtoId ? buscar('produtos', it.produtoId) : null;
  const ligado = !!prod;
  const id = k => `it-${i}-${k}`;
  const rotMed = it.modo === 'm' ? `Compr. (${ROTULO_MEDIDA})` : `Larg. (${ROTULO_MEDIDA})`;
  return `<div class="item-servico${ligado ? ' ligado' : ''} modo-${it.modo || 'un'}" data-i="${i}">
      <span class="item-n">${i + 1}</span>
      <div class="campo is-produto">
        <label for="${id('p')}">Material</label>
        <select id="${id('p')}" data-k="produtoId">${opcoesProdutos(it.produtoId)}</select>
        ${prod ? `<small class="dica">Em estoque: ${num(prod.quantidade, 3)} ${esc(prod.unidade)}</small>` : ''}
      </div>
      ${ligado ? '' : `<div class="campo is-desc">
        <label for="${id('d')}">Descrição</label>
        <input id="${id('d')}" data-k="descricao" value="${esc(it.descricao)}" placeholder="Ex.: vidro 8mm incolor">
      </div>
      <div class="campo is-modo">
        <label for="${id('m')}">Cobrar por</label>
        <select id="${id('m')}" data-k="modo">
          ${[['m2', 'm²'], ['m', 'metro'], ['un', 'unidade']].map(([v, t]) => `<option value="${v}" ${it.modo === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>`}
      ${it.modo !== 'un' ? `<div class="campo is-med is-larg"><label for="${id('l')}">${rotMed}</label><input id="${id('l')}" data-k="larg" value="${esc(numCampo(it.larg, 1))}" ${ATTR_DECIMAL}></div>` : ''}
      ${it.modo === 'm2' ? `<div class="campo is-med is-alt"><label for="${id('a')}">Alt. (${ROTULO_MEDIDA})</label><input id="${id('a')}" data-k="alt" value="${esc(numCampo(it.alt, 1))}" ${ATTR_DECIMAL}></div>` : ''}
      <div class="campo is-qtd"><label for="${id('q')}">Qtd.</label><input id="${id('q')}" data-k="qtd" value="${esc(numCampo(it.qtd, 3))}" ${ATTR_DECIMAL}></div>
      <div class="campo is-preco"><label for="${id('v')}">R$ por ${UNIDADE_DO_MODO[it.modo]}</label><input id="${id('v')}" data-k="preco" value="${esc(numCampo(it.preco))}" ${ATTR_DECIMAL}></div>
      <div class="is-sub" aria-live="polite"><span class="is-quant">${esc(quantTexto(calc))}</span><strong>${moeda(calc.subtotal)}</strong></div>
      <button type="button" class="btn-icone is-remover" data-remover="${i}" aria-label="Remover item ${i + 1}">${icone('lixeira')}</button>
    </div>`;
}

function seletorClienteHtml() {
  return `<div class="campo inteiro seletor-cliente">
      <label for="sc-busca">Cliente<span class="obrig" aria-hidden="true"> *</span></label>
      <div class="sc-escolhido" hidden></div>
      <div class="sc-busca-area">
        <input id="sc-busca" type="search" placeholder="Busque pelo nome ou telefone" autocomplete="off"
          role="combobox" aria-expanded="false" aria-controls="sc-sugestoes" aria-autocomplete="list">
        <div class="sugestoes" id="sc-sugestoes" role="listbox" hidden></div>
      </div>
    </div>`;
}

function ligarSeletorCliente(m, inicial, aoEscolher) {
  const caixa = $('.seletor-cliente', m.el);
  const escolhido = $('.sc-escolhido', caixa);
  const area = $('.sc-busca-area', caixa);
  const inp = $('#sc-busca', caixa);
  const sug = $('#sc-sugestoes', caixa);

  const esconder = () => { sug.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
  const mostrarEscolhido = c => {
    escolhido.innerHTML = `<div><strong>${esc(c.nome)}</strong><span>${esc([c.telefone, c.bairro].filter(Boolean).join(', '))}</span></div>
      <button type="button" class="btn btn-pequeno" data-trocar>Trocar</button>`;
    escolhido.hidden = false;
    area.hidden = true;
  };
  const escolher = c => { mostrarEscolhido(c); esconder(); aoEscolher(c); };

  const sugerir = () => {
    const t = inp.value.trim();
    const dig = soDigitos(t);
    let lista = estado.clientes;
    if (t) lista = lista.filter(c => contem(c.nome, t) || (dig.length >= 3 && soDigitos(c.telefone).includes(dig)));
    lista = [...lista].sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 7);
    sug.innerHTML = lista.map(c => `<button type="button" role="option" data-cli="${c.id}">
        <strong>${esc(c.nome)}</strong><span>${esc([c.telefone, c.bairro].filter(Boolean).join(', '))}</span>
      </button>`).join('')
      + `<button type="button" class="sug-novo" data-novo-cli>${icone('novo')} ${t ? `Cadastrar “${esc(t)}”` : 'Cadastrar novo cliente'}</button>`;
    sug.hidden = false;
    inp.setAttribute('aria-expanded', 'true');
  };

  inp.addEventListener('input', sugerir);
  inp.addEventListener('focus', sugerir);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('button', sug)?.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); $('button', sug)?.focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); esconder(); }
  });
  sug.addEventListener('keydown', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); (b.nextElementSibling || b).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (b.previousElementSibling || inp).focus(); }
  });
  sug.addEventListener('click', e => {
    const b = e.target.closest('[data-cli]');
    if (b) { escolher(buscar('clientes', b.dataset.cli)); return; }
    if (e.target.closest('[data-novo-cli]')) {
      esconder();
      abrirFormCliente(null, { nome: inp.value.trim(), aoSalvar: (id, dados) => escolher({ ...dados, id }) });
    }
  });
  m.el.addEventListener('click', e => { if (!caixa.contains(e.target)) esconder(); });
  escolhido.addEventListener('click', e => {
    if (!e.target.closest('[data-trocar]')) return;
    escolhido.hidden = true;
    area.hidden = false;
    inp.value = '';
    aoEscolher(null);
    inp.focus();
  });

  if (inicial) mostrarEscolhido(inicial);
}

export function abrirFormServico(id = null, { clienteId = '' } = {}) {
  const s = id ? buscar('servicos', id) : null;
  if (id && !s) { toast('Serviço não encontrado.', 'erro'); return; }

  const itens = (s?.itens || []).map(i => ({ ...i }));
  if (!s) itens.push(itemVazio());
  let clienteSel = s?.clienteId || clienteId || '';
  const clienteIni = clienteSel ? (buscar('clientes', clienteSel) || (s ? { id: clienteSel, nome: s.clienteNome, telefone: s.clienteTelefone } : null)) : null;
  const usuariosAtivos = estado.usuarios.filter(u => u.ativo !== false && u.nome);

  // abre o "Mais opções" quando já tem algo preenchido nele
  const temExtras = !!(s && (s.prioridade === 'urgente' || s.responsavelId || s.formaCombinada || s.desconto || s.obs));

  const corpo = `<form id="form-servico" class="form-grade" novalidate autocomplete="off">
      ${seletorClienteHtml()}
      ${campo({ rotulo: 'Tipo de serviço', nome: 'tipo', tipo: 'select', opcoes: TIPOS_SERVICO, valor: s?.tipo || TIPOS_SERVICO[0] })}
      ${campo({ rotulo: 'Entrega prevista', nome: 'dataPrevista', tipo: 'date', valor: s?.dataPrevista || '' })}
      ${campo({ rotulo: 'O que fazer', nome: 'descricao', tipo: 'textarea', linhas: 2, obrigatorio: true, valor: s?.descricao || '', classe: 'inteiro', placeholder: 'Ex.: box frontal de correr 8mm incolor, banheiro social' })}
      ${campo({ rotulo: 'Endereço da obra', nome: 'endereco', valor: s?.endereco || '', classe: 'inteiro', placeholder: 'Rua, número, bairro' })}

      <fieldset class="inteiro bloco-itens">
        <legend>Itens e medidas</legend>
        <div id="itens-servico"></div>
        <button type="button" class="btn" id="add-item">${icone('novo')} Adicionar item</button>
      </fieldset>

      ${campo({ rotulo: 'Mão de obra / instalação (R$)', nome: 'maoDeObra', valor: numCampo(s?.maoDeObra), attrs: ATTR_DECIMAL })}
      <div class="resumo-total" id="resumo-total" aria-live="polite"></div>

      <details class="inteiro mais-opcoes" ${temExtras ? 'open' : ''}>
        <summary>Mais opções</summary>
        <div class="form-grade">
          ${!s ? campo({ rotulo: 'Começa como', nome: 'status', tipo: 'select', opcoes: [['orcamento', 'Orçamento'], ['aprovado', 'Já aprovado']], valor: 'orcamento' }) : ''}
          ${campo({ rotulo: 'Prioridade', nome: 'prioridade', tipo: 'select', opcoes: [['normal', 'Normal'], ['urgente', 'Urgente']], valor: s?.prioridade || 'normal' })}
          ${campo({ rotulo: 'Responsável', nome: 'responsavelId', tipo: 'select', valor: s?.responsavelId || '', opcoes: [['', 'Sem responsável'], ...usuariosAtivos.map(u => [u.id, u.nome])] })}
          ${campo({ rotulo: 'Desconto (R$)', nome: 'desconto', valor: numCampo(s?.desconto), attrs: ATTR_DECIMAL })}
          ${campo({ rotulo: 'Pagamento combinado', nome: 'formaCombinada', valor: s?.formaCombinada || '', placeholder: 'Ex.: 50% de entrada, resto na instalação', classe: 'inteiro' })}
          ${campo({ rotulo: 'Observações internas', nome: 'obs', tipo: 'textarea', linhas: 2, valor: s?.obs || '', classe: 'inteiro', placeholder: 'Só a equipe vê. Ex.: levar escada grande' })}
        </div>
      </details>
    </form>`;

  abrirModal({
    titulo: s ? `Editar OS ${numeroOS(s.numero)}` : 'Novo serviço',
    classe: 'modal-largo',
    fecharFora: false,
    corpo,
    rodape: `<button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-servico" class="btn btn-primario">${s ? 'Salvar alterações' : 'Criar serviço'}</button>`,
    aoMontar(m) {
      const form = $('#form-servico', m.el);
      const caixaItens = $('#itens-servico', m.el);
      const resumo = $('#resumo-total', m.el);

      const desenharItens = () => { caixaItens.innerHTML = itens.map(linhaItem).join(''); recalcular(); };
      const recalcular = () => {
        const t = totaisServico({ itens, maoDeObra: form.maoDeObra.value, desconto: form.desconto.value });
        resumo.innerHTML = `
          ${t.desconto ? `<span>Desconto <strong>− ${moeda(t.desconto)}</strong></span>` : ''}
          <span class="resumo-final">Total <strong>${moeda(t.total)}</strong></span>`;
      };
      const atualizarLinha = i => {
        const atual = $(`.item-servico[data-i="${i}"]`, caixaItens);
        if (!atual) return;
        const novo = document.createElement('div');
        novo.innerHTML = linhaItem(itens[i], i);
        atual.replaceWith(novo.firstElementChild);
        recalcular();
      };

      ligarSeletorCliente(m, clienteIni, c => {
        clienteSel = c?.id || '';
        if (c && !form.endereco.value.trim()) form.endereco.value = [c.endereco, c.bairro].filter(Boolean).join(', ');
      });

      caixaItens.addEventListener('input', e => {
        const k = e.target.dataset.k;
        const linha = e.target.closest('.item-servico');
        if (!k || !linha || k === 'produtoId' || k === 'modo') return;
        const i = Number(linha.dataset.i);
        itens[i][k] = e.target.value;
        const calc = calcularItem(itens[i]);
        $('.is-quant', linha).textContent = quantTexto(calc);
        $('.is-sub strong', linha).textContent = moeda(calc.subtotal);
        recalcular();
      });
      caixaItens.addEventListener('change', e => {
        const k = e.target.dataset.k;
        const linha = e.target.closest('.item-servico');
        if (!linha || (k !== 'produtoId' && k !== 'modo')) return;
        const i = Number(linha.dataset.i);
        const it = itens[i];
        if (k === 'produtoId') {
          const anterior = buscar('produtos', it.produtoId);
          const p = buscar('produtos', e.target.value);
          it.produtoId = e.target.value;
          if (p) {
            it.descricao = p.nome;
            it.preco = p.preco || '';
            it.modo = modoDaUnidade(p.unidade);
          } else if (anterior && it.descricao === anterior.nome) {
            it.descricao = '';
          }
        } else {
          it.modo = e.target.value;
        }
        atualizarLinha(i);
        const proximo = k === 'produtoId' ? (it.produtoId ? (it.modo === 'un' ? 'qtd' : 'larg') : 'descricao') : k;
        $(`.item-servico[data-i="${i}"] [data-k="${proximo}"]`, caixaItens)?.focus();
      });
      caixaItens.addEventListener('click', e => {
        const b = e.target.closest('[data-remover]');
        if (!b) return;
        itens.splice(Number(b.dataset.remover), 1);
        desenharItens();
      });
      $('#add-item', m.el).addEventListener('click', () => {
        const ultimo = itens[itens.length - 1];
        itens.push({ ...itemVazio(), modo: ultimo?.modo && !ultimo.produtoId ? ultimo.modo : 'm2' });
        desenharItens();
        $(`.item-servico[data-i="${itens.length - 1}"] select`, caixaItens)?.focus();
      });
      form.maoDeObra.addEventListener('input', recalcular);
      form.desconto.addEventListener('input', recalcular);

      desenharItens();

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        d.clienteId = clienteSel;
        d.itens = itens;
        if (!d.clienteId) { toast('Escolha ou cadastre o cliente.', 'erro'); $('#sc-busca', m.el)?.focus(); return; }
        if (!d.descricao) { toast('Descreva o que deve ser feito.', 'erro'); form.descricao.focus(); return; }
        await comCarregando($('[type=submit]', m.el), async () => {
          try {
            const novoId = await acoes.salvarServico(d, id);
            m.fechar();
            if (id) { toast('Serviço atualizado'); return; }
            const criado = await aguardar('servicos', novoId);
            toast(criado ? `OS ${numeroOS(criado.numero)} criada` : 'Serviço criado');
            if (criado) abrirServico(novoId);
          } catch (err) { toast(mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}
