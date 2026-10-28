// Configurações (só administrador): dados da empresa para os orçamentos e cópia de segurança.
import { estado } from '../estado.js';
import { db } from '../db.js';
import { VERSAO, MEDIDA } from '../config.js';
import { $, icone, campo, dadosForm, toast, mensagemErro, comCarregando, mascarar, baixarArquivo, confirmar, hoje } from '../util.js';
import * as acoes from '../acoes.js';

let formSujo = false;
let elTela = null;
let empresaUsada = '';

export default {
  titulo: 'Configurações',

  montar(el) {
    formSujo = false;
    elTela = el;
    empresaUsada = JSON.stringify(estado.empresa || {});
    const e = estado.empresa || {};
    el.innerHTML = `
      <div class="cab-tela"><h1>Configurações</h1></div>

      <section class="painel painel-estreito">
        <div class="painel-cab"><h2>Dados da empresa</h2></div>
        <p class="texto-suave">Aparecem no cabeçalho do orçamento e da ordem de serviço impressos.</p>
        <form id="form-empresa" class="form-grade" novalidate autocomplete="off">
          ${campo({ rotulo: 'Nome da vidraçaria', nome: 'nome', valor: e.nome || '', obrigatorio: true, classe: 'inteiro' })}
          ${campo({ rotulo: 'CNPJ ou CPF', nome: 'documento', valor: e.documento || '', attrs: 'inputmode="numeric"' })}
          ${campo({ rotulo: 'Telefone', nome: 'telefone', tipo: 'tel', valor: e.telefone || '', attrs: 'inputmode="tel"' })}
          ${campo({ rotulo: 'WhatsApp', nome: 'whatsapp', tipo: 'tel', valor: e.whatsapp || '', attrs: 'inputmode="tel"' })}
          ${campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', valor: e.email || '' })}
          ${campo({ rotulo: 'Endereço', nome: 'endereco', valor: e.endereco || '', classe: 'inteiro' })}
          ${campo({ rotulo: 'Cidade / UF', nome: 'cidade', valor: e.cidade || '' })}
          ${campo({ rotulo: 'Chave PIX', nome: 'pix', valor: e.pix || '', dica: 'Sai impressa no orçamento.' })}
          ${campo({ rotulo: 'Validade do orçamento (dias)', nome: 'validadeOrcamento', tipo: 'number', valor: e.validadeOrcamento || 7, attrs: 'min="1" max="90" inputmode="numeric"' })}
          ${campo({ rotulo: 'Condições e garantia (rodapé do orçamento)', nome: 'condicoes', tipo: 'textarea', linhas: 3, valor: e.condicoes || '', classe: 'inteiro' })}
          <div class="inteiro acoes-form">
            <button type="submit" class="btn btn-primario">${icone('check')} Salvar dados da empresa</button>
          </div>
        </form>
      </section>

      <section class="painel painel-estreito">
        <div class="painel-cab"><h2>Cópia de segurança</h2></div>
        <p>Baixa um arquivo com todos os clientes, serviços, estoque e lançamentos. Guarde no computador ou no Google Drive de vez em quando.</p>
        <div class="acoes-form">
          <button type="button" class="btn" id="btn-backup">${icone('baixar')} Baixar cópia de segurança</button>
          ${db.demo ? `<button type="button" class="btn btn-perigo-texto" id="btn-restaurar">${icone('reabrir')} Voltar aos dados de exemplo</button>` : ''}
        </div>
      </section>

      <section class="painel painel-estreito">
        <div class="painel-cab"><h2>Sobre o sistema</h2></div>
        <dl class="det-dados det-dados-grade">
          <div><dt>Modo</dt><dd>${db.demo ? 'Demonstração (dados só neste navegador)' : 'Firebase (dados na nuvem)'}</dd></div>
          <div><dt>Medidas dos itens em</dt><dd>${MEDIDA === 'mm' ? 'milímetros' : 'centímetros'}</dd></div>
          <div><dt>Versão</dt><dd>${VERSAO}</dd></div>
        </dl>
      </section>`;

    const form = $('#form-empresa', el);
    mascarar(form.telefone, 'telefone');
    mascarar(form.whatsapp, 'telefone');
    mascarar(form.documento, 'documento');
    form.addEventListener('input', () => { formSujo = true; });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const d = dadosForm(form);
      if (!d.nome) { toast('Digite o nome da vidraçaria.', 'erro'); form.nome.focus(); return; }
      d.validadeOrcamento = Math.max(1, parseInt(d.validadeOrcamento, 10) || 7);
      await comCarregando($('[type=submit]', form), async () => {
        try { await acoes.salvarEmpresa(d); formSujo = false; toast('Dados da empresa salvos'); }
        catch (err) { toast(mensagemErro(err), 'erro'); }
      });
    });

    $('#btn-backup', el).addEventListener('click', () => {
      const limpar = lista => lista.map(({ senha, ...resto }) => resto);
      const dados = {
        geradoEm: new Date().toISOString(),
        versao: VERSAO,
        empresa: estado.empresa,
        clientes: estado.clientes,
        servicos: estado.servicos,
        produtos: estado.produtos,
        movimentos: estado.movimentos,
        lancamentos: estado.lancamentos,
        usuarios: limpar(estado.usuarios),
      };
      baixarArquivo(`backup-vidracaria-${hoje()}.json`, JSON.stringify(dados, null, 2));
      toast('Cópia de segurança baixada');
    });

    $('#btn-restaurar', el)?.addEventListener('click', async () => {
      const ok = await confirmar('Apagar tudo o que foi feito neste navegador e voltar para os dados de exemplo?', { titulo: 'Restaurar exemplo', sim: 'Restaurar', perigo: true });
      if (!ok) return;
      await db.restaurarExemplo();
      toast('Dados de exemplo restaurados');
    });
  },

  // Só redesenha se os dados da empresa mudaram e ninguém está digitando no formulário
  atualizar() {
    if (!elTela || !document.contains(elTela) || formSujo) return;
    if (JSON.stringify(estado.empresa || {}) !== empresaUsada) this.montar(elTela);
  },
};
