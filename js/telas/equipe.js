// Equipe (só administrador): cria acessos para funcionários, muda papel, desativa.
import { estado, buscar, carregou } from '../estado.js';
import { db } from '../db.js';
import {
  $, esc, icone, campo, dadosForm, abrirModal, confirmar, toast, mensagemErro, comCarregando,
  vazio, carregandoHtml, avatar, emailDoLogin, loginExibicao, emailReal, dataBR,
} from '../util.js';
import { STATUS_EM_ANDAMENTO } from '../constantes.js';
import * as acoes from '../acoes.js';

let raiz = null;

export default {
  titulo: 'Equipe',

  montar(el) {
    el.innerHTML = `
      <div class="cab-tela">
        <h1>Equipe</h1>
        <div class="cab-acoes">
          <button type="button" class="btn btn-primario" id="btn-novo-usuario">${icone('novo')} Novo acesso</button>
        </div>
      </div>
      <p class="texto-suave intro-tela">Funcionários veem a fila de serviços, clientes e estoque. Só administradores veem o financeiro, a equipe e as configurações.</p>
      <div id="area-equipe"></div>`;
    raiz = $('#area-equipe', el);
    $('#btn-novo-usuario', el).addEventListener('click', () => abrirFormUsuario());
    raiz.addEventListener('click', async e => {
      const b = e.target.closest('[data-u]');
      if (!b) return;
      const u = buscar('usuarios', b.dataset.id);
      if (!u) return;
      if (b.dataset.u === 'editar') abrirFormUsuario(u.id);
      else if (b.dataset.u === 'ativo') alternarAtivo(u);
      else if (b.dataset.u === 'senha') redefinirSenha(u);
    });
    this.atualizar();
  },

  atualizar() {
    if (!raiz || !document.contains(raiz)) return;
    if (!carregou('usuarios')) { raiz.innerHTML = carregandoHtml(); return; }
    const lista = estado.usuarios.filter(u => u.nome).sort((a, b) =>
      (a.ativo === false) - (b.ativo === false) || (a.papel === 'admin' ? 0 : 1) - (b.papel === 'admin' ? 0 : 1) || a.nome.localeCompare(b.nome));
    if (!lista.length) { raiz.innerHTML = vazio('Ninguém cadastrado.'); return; }
    raiz.innerHTML = `<div class="tabela-linhas t-equipe">
        <div class="linha cabecalho" aria-hidden="true"><span>Pessoa</span><span>Login</span><span>Papel</span><span>Serviços</span><span></span></div>
        ${lista.map(u => {
          const eu = u.id === estado.usuario?.id;
          const n = estado.servicos.filter(s => s.responsavelId === u.id && STATUS_EM_ANDAMENTO.includes(s.status)).length;
          return `<div class="linha ${u.ativo === false ? 'desativado' : ''}">
              <div class="c-principal">${avatar(u.nome)}<div><strong>${esc(u.nome)}${eu ? ' <span class="texto-suave">(você)</span>' : ''}</strong>
                <span>${u.ativo === false ? 'Acesso desativado' : `Desde ${dataBR(u.criadoEm)}`}</span></div></div>
              <div class="c-info" data-rotulo="Login"><code>${esc(loginExibicao(u.email))}</code></div>
              <div class="c-info" data-rotulo="Papel"><span class="etiqueta ${u.papel === 'admin' ? 'et-admin' : 'et-neutra'}">${u.papel === 'admin' ? 'Administrador' : 'Funcionário'}</span></div>
              <div class="c-info" data-rotulo="Em andamento">${n}</div>
              <div class="c-acoes">
                <button type="button" class="btn btn-pequeno" data-u="editar" data-id="${u.id}">${icone('editar')}<span>Editar</span></button>
                ${emailReal(u.email) && !db.demo ? `<button type="button" class="btn btn-pequeno" data-u="senha" data-id="${u.id}">${icone('chave')}<span>Senha</span></button>` : ''}
                ${!eu ? `<button type="button" class="btn btn-pequeno" data-u="ativo" data-id="${u.id}">${u.ativo === false ? `${icone('check')}<span>Reativar</span>` : `${icone('x')}<span>Desativar</span>`}</button>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
      <div class="caixa-info">
        <h3>${icone('chave')} Como o funcionário entra</h3>
        <p>Crie o acesso com um <strong>usuário simples</strong> (ex.: <code>joao</code>) e uma senha. Ele entra no sistema digitando esse usuário e a senha, no celular ou no computador.</p>
        <p>Se ele esquecer a senha: desative o acesso antigo e crie um novo. Se o acesso for criado com um e-mail de verdade, dá para mandar o link de troca de senha pelo botão "Senha".</p>
      </div>`;
  },
};

async function alternarAtivo(u) {
  const ativar = u.ativo === false;
  if (!ativar) {
    const ok = await confirmar(`Desativar o acesso de ${u.nome}? Ele não consegue mais entrar, mas tudo o que fez continua salvo.`, { titulo: 'Desativar acesso', sim: 'Desativar', perigo: true });
    if (!ok) return;
  }
  try {
    await acoes.atualizarFuncionario(u.id, { ativo: ativar });
    toast(ativar ? `${u.nome} pode entrar de novo` : `Acesso de ${u.nome} desativado`);
  } catch (e) { toast(mensagemErro(e), 'erro'); }
}

async function redefinirSenha(u) {
  const ok = await confirmar(`Enviar para ${u.email} um link para criar uma nova senha?`, { titulo: 'Redefinir senha', sim: 'Enviar link' });
  if (!ok) return;
  try { await db.enviarRedefinicao(u.email); toast('Link enviado. Peça para olhar a caixa de entrada e o spam.'); }
  catch (e) { toast(mensagemErro(e), 'erro'); }
}

function abrirFormUsuario(id = null) {
  const u = id ? buscar('usuarios', id) : null;
  const eu = u && u.id === estado.usuario?.id;
  abrirModal({
    titulo: u ? `Editar ${esc(u.nome)}` : 'Novo acesso',
    classe: 'modal-pequeno',
    fecharFora: false,
    corpo: `<form id="form-usuario" class="form-grade" novalidate autocomplete="off">
        ${campo({ rotulo: 'Nome', nome: 'nome', obrigatorio: true, valor: u?.nome || '', classe: 'inteiro', attrs: 'autofocus' })}
        ${u ? `<p class="inteiro texto-suave">Login: <code>${esc(loginExibicao(u.email))}</code> (não dá para mudar)</p>`
          : campo({ rotulo: 'Usuário ou e-mail para entrar', nome: 'login', obrigatorio: true, classe: 'inteiro', placeholder: 'Ex.: joao', attrs: 'autocapitalize="none" autocomplete="off" spellcheck="false"', dica: 'Sem espaços nem acentos. Pode ser um e-mail de verdade, se preferir.' })}
        ${!u ? campo({ rotulo: 'Senha', nome: 'senha', tipo: 'text', obrigatorio: true, classe: 'inteiro', attrs: 'autocomplete="new-password" minlength="6"', dica: 'Pelo menos 6 caracteres. Anote e passe para o funcionário.' }) : ''}
        ${campo({
          rotulo: 'Papel', nome: 'papel', tipo: 'select', classe: 'inteiro', valor: u?.papel || 'funcionario',
          opcoes: [['funcionario', 'Funcionário (fila, clientes e estoque)'], ['admin', 'Administrador (acesso total)']],
          attrs: eu ? 'disabled' : '', dica: eu ? 'Você não pode tirar o seu próprio acesso de administrador.' : '',
        })}
      </form>`,
    rodape: `<button type="button" class="btn" data-fechar>Cancelar</button>
             <button type="submit" form="form-usuario" class="btn btn-primario">${u ? 'Salvar' : 'Criar acesso'}</button>`,
    aoMontar(m) {
      const form = $('#form-usuario', m.el);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        if (!d.nome) { toast('Digite o nome.', 'erro'); form.nome.focus(); return; }
        await comCarregando($('[type=submit]', m.el), async () => {
          try {
            if (u) {
              const dados = { nome: d.nome };
              if (!eu) dados.papel = d.papel === 'admin' ? 'admin' : 'funcionario';
              await acoes.atualizarFuncionario(u.id, dados);
              toast('Dados atualizados');
            } else {
              const email = emailDoLogin(d.login);
              if (!email || email.startsWith('@')) { toast('Digite um usuário válido.', 'erro'); form.login.focus(); return; }
              if ((d.senha || '').length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.', 'erro'); form.senha.focus(); return; }
              await acoes.criarFuncionario({ nome: d.nome, email, senha: d.senha, papel: d.papel });
              toast(`Acesso criado. Login: ${loginExibicao(email)}`);
            }
            m.fechar();
          } catch (err) { toast(mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}
