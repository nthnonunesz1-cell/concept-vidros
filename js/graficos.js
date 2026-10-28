// Gráficos simples em HTML/CSS (sem biblioteca), com dica ao passar o mouse ou tocar.
import { estado } from './estado.js';
import { esc, moeda, compacto, mesAbreviado, nomeMes, somarMeses, lerNumero, arred } from './util.js';

export function resumoMensal(mesFinal, n = 6) {
  const meses = [];
  for (let i = n - 1; i >= 0; i--) meses.push(somarMeses(mesFinal, -i));
  return meses.map(m => {
    let receitas = 0;
    let despesas = 0;
    for (const l of estado.lancamentos) {
      if (l.status !== 'pago' || !String(l.data || '').startsWith(m)) continue;
      if (l.tipo === 'receita') receitas += lerNumero(l.valor);
      else despesas += lerNumero(l.valor);
    }
    return { mes: m, receitas: arred(receitas), despesas: arred(despesas) };
  });
}

function topoDaEscala(max) {
  if (max <= 0) return 1000;
  const pot = 10 ** Math.floor(Math.log10(max));
  for (const p of [1, 2, 2.5, 5, 10]) if (p * pot >= max) return p * pot;
  return 10 * pot;
}

// Colunas agrupadas: receitas x despesas por mês
export function graficoMensal(dados) {
  const topo = topoDaEscala(Math.max(0, ...dados.map(d => Math.max(d.receitas, d.despesas))));
  const linhas = [1, 0.75, 0.5, 0.25, 0]
    .map(f => `<div class="gm-linha" style="bottom:${f * 100}%"><span>${f ? compacto(topo * f) : '0'}</span></div>`)
    .join('');
  const grupos = dados.map(d => {
    const saldo = arred(d.receitas - d.despesas);
    const dica = `<strong>${esc(nomeMes(d.mes))}</strong><span><i class="sw sw-rec"></i>Receitas ${moeda(d.receitas)}</span><span><i class="sw sw-desp"></i>Despesas ${moeda(d.despesas)}</span><span>Saldo ${moeda(saldo)}</span>`;
    const rotulo = `${nomeMes(d.mes)}: receitas ${moeda(d.receitas)}, despesas ${moeda(d.despesas)}`;
    return `<div class="gm-grupo" tabindex="0" role="img" aria-label="${esc(rotulo)}" data-dica="${esc(dica)}">
        <span class="gm-barra gm-rec" style="height:${(d.receitas / topo) * 100}%"></span>
        <span class="gm-barra gm-desp" style="height:${(d.despesas / topo) * 100}%"></span>
      </div>`;
  }).join('');
  const meses = dados.map(d => `<span>${mesAbreviado(d.mes)}</span>`).join('');
  const tabela = dados.map(d => `<tr><td>${esc(nomeMes(d.mes))}</td><td>${moeda(d.receitas)}</td><td>${moeda(d.despesas)}</td><td>${moeda(d.receitas - d.despesas)}</td></tr>`).join('');

  return `<div class="grafico-mensal">
      <div class="legenda" aria-hidden="true"><span><i class="sw sw-rec"></i>Receitas</span><span><i class="sw sw-desp"></i>Despesas</span></div>
      <div class="gm-corpo">
        <div class="gm-plot">
          <div class="gm-grade">${linhas}</div>
          <div class="gm-area">${grupos}</div>
        </div>
        <div class="gm-meses">${meses}</div>
      </div>
      <details class="tabela-grafico">
        <summary>Ver em tabela</summary>
        <div class="rolagem-x"><table><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th></tr></thead><tbody>${tabela}</tbody></table></div>
      </details>
    </div>`;
}

// Barras horizontais de uma série só (ex.: despesas por categoria)
export function barrasHorizontais(itens, { classe = 'bh-desp', vazioTexto = 'Nada no período.' } = {}) {
  const lista = itens.filter(i => i.valor > 0).sort((a, b) => b.valor - a.valor);
  if (!lista.length) return `<p class="texto-suave">${esc(vazioTexto)}</p>`;
  const max = lista[0].valor;
  const total = lista.reduce((t, i) => t + i.valor, 0);
  return `<div class="barras-h ${classe}">${lista.map(i => {
    const pct = total ? Math.round((i.valor / total) * 100) : 0;
    const dica = `<strong>${esc(i.rotulo)}</strong><span>${moeda(i.valor)} (${pct}% do total)</span>`;
    return `<div class="bh-linha" tabindex="0" data-dica="${esc(dica)}">
        <span class="bh-rotulo">${esc(i.rotulo)}</span>
        <span class="bh-trilho"><span class="bh-barra" style="width:${Math.max(1.5, (i.valor / max) * 100)}%"></span></span>
        <span class="bh-valor">${moeda(i.valor)}</span>
      </div>`;
  }).join('')}</div>`;
}

// Liga as dicas (tooltip) de qualquer elemento com data-dica dentro de "raiz"
export function ligarDicas(raiz) {
  let dica = document.getElementById('dica-grafico');
  if (!dica) {
    dica = document.createElement('div');
    dica.id = 'dica-grafico';
    dica.className = 'dica-grafico';
    dica.hidden = true;
    document.body.appendChild(dica);
  }
  const mostrar = alvo => {
    dica.innerHTML = alvo.dataset.dica;
    dica.hidden = false;
    const r = alvo.getBoundingClientRect();
    const d = dica.getBoundingClientRect();
    let x = r.left + r.width / 2 - d.width / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - d.width - 8));
    let y = r.top - d.height - 8;
    if (y < 8) y = r.bottom + 8;
    dica.style.left = `${x}px`;
    dica.style.top = `${y}px`;
    raiz.querySelectorAll('.com-dica').forEach(e => e.classList.remove('com-dica'));
    alvo.classList.add('com-dica');
  };
  const esconder = () => {
    dica.hidden = true;
    raiz.querySelectorAll('.com-dica').forEach(e => e.classList.remove('com-dica'));
  };
  raiz.addEventListener('pointerover', e => { const a = e.target.closest('[data-dica]'); if (a) mostrar(a); });
  raiz.addEventListener('pointerout', e => { const a = e.target.closest('[data-dica]'); if (a && !a.contains(e.relatedTarget)) esconder(); });
  raiz.addEventListener('focusin', e => { const a = e.target.closest('[data-dica]'); if (a) mostrar(a); });
  raiz.addEventListener('focusout', esconder);
  if (!rolagemLigada) {
    rolagemLigada = true;
    window.addEventListener('scroll', () => { dica.hidden = true; }, { passive: true, capture: true });
  }
}

let rolagemLigada = false;
