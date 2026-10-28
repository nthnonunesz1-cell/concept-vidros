// "Minha conta": dados de quem está logado e troca de senha.
import { estado } from '../estado.js';
import { db } from '../db.js';
import { $, esc, campo, dadosForm, abrirModal, toast, mensagemErro, comCarregando, loginExibicao, avatar } from '../util.js';

export function abrirConta() {
  const u = estado.usuario;
  if (!u) return;
  abrirModal({
    titulo: 'Minha conta',
    classe: 'modal-pequeno',
    corpo: `<div class="conta-topo">${avatar(u.nome, 'avatar-grande')}<div><strong>${esc(u.nome)}</strong>
        <span>Login: <code>${esc(loginExibicao(u.email))}</code></span>
        <span>${u.papel === 'admin' ? 'Administrador' : 'Funcionário'}</span></div></div>
      <form id="form-senha" class="form-grade" novalidate>
        <h3 class="inteiro">Trocar senha</h3>
        ${campo({ rotulo: 'Senha atual', nome: 'atual', tipo: 'password', classe: 'inteiro', attrs: 'autocomplete="current-password"' })}
        ${campo({ rotulo: 'Nova senha', nome: 'nova', tipo: 'password', classe: 'inteiro', attrs: 'autocomplete="new-password" minlength="6"', dica: 'Pelo menos 6 caracteres.' })}
        ${campo({ rotulo: 'Repita a nova senha', nome: 'repetir', tipo: 'password', classe: 'inteiro', attrs: 'autocomplete="new-password"' })}
      </form>`,
    rodape: `<button type="button" class="btn" data-fechar>Fechar</button>
             <button type="submit" form="form-senha" class="btn btn-primario">Trocar senha</button>`,
    aoMontar(m) {
      const form = $('#form-senha', m.el);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = dadosForm(form);
        if (!d.atual) { toast('Digite a senha atual.', 'erro'); form.atual.focus(); return; }
        if ((d.nova || '').length < 6) { toast('A nova senha precisa ter pelo menos 6 caracteres.', 'erro'); form.nova.focus(); return; }
        if (d.nova !== d.repetir) { toast('As duas senhas novas não são iguais.', 'erro'); form.repetir.focus(); return; }
        await comCarregando($('[type=submit]', m.el), async () => {
          try { await db.trocarSenha(d.atual, d.nova); toast('Senha trocada'); m.fechar(); }
          catch (err) { toast(err.message === 'Senha atual incorreta.' ? err.message : mensagemErro(err), 'erro'); }
        });
      });
    },
  });
}
