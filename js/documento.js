// Orçamento, recibo e ordem de serviço em PDF, com a logo da Concept Vidros.
//
// Funciona igual ao sistema da Junior Motos: quando a janela abre, o documento já é
// desenhado e o arquivo fica pronto. Assim o botão "Enviar PDF" abre na hora o menu de
// compartilhar do celular (WhatsApp, salvar, imprimir). O iPhone só deixa abrir esse
// menu se o arquivo já estiver pronto no momento do toque.
//
// O PDF é montado aqui mesmo, sem biblioteca: cada página A4 é desenhada num canvas
// e colocada no PDF como imagem.
import { estado, buscar } from './estado.js';
import {
  $, $$, esc, icone, moeda, num, dataBR, hoje, somarDias, abrirModal, toast, linkWhatsApp,
  primeiroNome, normalizar, lerNumero,
} from './util.js';
import { totaisServico, numeroOS, medidaTexto, quantTexto, totalPago, saldoServico } from './regras.js';
import { statusInfo } from './constantes.js';

// ------------------------------------------------------------------ medidas da página

const LARG = 1240;      // A4 em 150 dpi (21 cm)
const ALT = 1754;       // 29,7 cm
const ESCALA = 1.4;     // desenha maior para o texto ficar nítido
const M = 84;           // margem
const CW = LARG - M * 2;
const FIM_UTIL = ALT - 104; // abaixo disso fica o rodapé

const COR = {
  marinho: '#0c1f38',
  ciano: '#0aa7d7',
  cianoMedio: '#2bc3ec',
  cianoClaro: '#8fe7f3',
  texto: '#0f2139',
  suave: '#5b6b82',
  pauta: '#dbe3ec',
  fundo: '#f1f5f9',
};
const SANS = 'Montserrat, "Helvetica Neue", Arial, sans-serif';
const TITULO = 'Anton, "Arial Narrow", Impact, sans-serif';
const F = (peso, tam, fam = SANS) => `${peso} ${tam}px ${fam}`;

export const TIPOS_DOC = {
  orcamento: { titulo: 'Orçamento', arquivo: 'Orcamento' },
  recibo: { titulo: 'Recibo', arquivo: 'Recibo' },
  os: { titulo: 'Ordem de serviço', arquivo: 'OS' },
};

// ------------------------------------------------------------------ logo e fontes

let logo = null;
const logoPronta = new Promise(ok => {
  const img = new Image();
  img.onload = () => { logo = img; ok(img); };
  img.onerror = () => ok(null);
  img.src = 'img/logo.png';
});

async function prepararRecursos() {
  try { await logoPronta; } catch {}
  try {
    if (document.fonts?.load) {
      await Promise.all([
        document.fonts.load(F(400, 40, TITULO)),
        document.fonts.load(F(500, 24)),
        document.fonts.load(F(600, 24)),
        document.fonts.load(F(700, 24)),
      ]);
    }
  } catch {}
}

// ------------------------------------------------------------------ desenho com quebra de página

function criarDocumento(cabecalhoContinuacao) {
  const paginas = [];
  let ctx = null;
  const d = { y: 0 };

  d.novaPagina = () => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(LARG * ESCALA);
    cv.height = Math.round(ALT * ESCALA);
    ctx = cv.getContext('2d');
    ctx.scale(ESCALA, ESCALA);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LARG, ALT);
    faixaTopo(ctx);
    paginas.push({ cv, ctx });
    d.y = 0;
    if (paginas.length > 1) d.y = cabecalhoContinuacao(d);
  };

  d.ctx = () => ctx;
  d.paginas = paginas;

  d.precisa = h => {
    if (d.y + h > FIM_UTIL) { d.novaPagina(); return true; }
    return false;
  };

  d.texto = (s, x, base, fonte, cor = COR.texto, al = 'left') => {
    ctx.font = fonte;
    ctx.fillStyle = cor;
    ctx.textAlign = al;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(s ?? ''), x, base);
  };
  d.medir = (s, fonte) => { ctx.font = fonte; return ctx.measureText(String(s ?? '')).width; };
  d.ret = (x, y, w, h, cor) => { ctx.fillStyle = cor; ctx.fillRect(x, y, w, h); };
  d.pauta = (cor = COR.pauta, esp = 2) => { d.ret(M, d.y, CW, esp, cor); d.y += esp; };

  d.quebrar = (s, maxW, fonte) => {
    ctx.font = fonte;
    const linhas = [];
    String(s || '').split('\n').forEach(par => {
      let linha = '';
      par.split(/\s+/).filter(Boolean).forEach(p => {
        const teste = linha ? `${linha} ${p}` : p;
        if (linha && ctx.measureText(teste).width > maxW) { linhas.push(linha); linha = p; } else linha = teste;
      });
      linhas.push(linha);
    });
    return linhas;
  };

  // parágrafo com quebra de página entre as linhas
  d.paragrafo = (s, x, maxW, tam, peso = 500, cor = COR.texto, lh = Math.round(tam * 1.5)) => {
    const fonte = F(peso, tam);
    for (const l of d.quebrar(s, maxW, fonte)) {
      d.precisa(lh);
      d.texto(l, x, d.y + tam, fonte, cor);
      d.y += lh;
    }
  };

  d.rotulo = s => {
    d.precisa(110);
    d.y += 34;
    d.texto(s, M, d.y + 18, F(700, 17), COR.ciano);
    d.y += 34;
  };

  d.novaPagina();
  return d;
}

// faixa azul-marinho com a "borda de vidro" ciano no topo de cada página
function faixaTopo(ctx) {
  ctx.fillStyle = COR.marinho;
  ctx.fillRect(0, 0, LARG, 16);
  ctx.fillStyle = COR.cianoMedio;
  ctx.beginPath();
  ctx.moveTo(0, 16); ctx.lineTo(LARG, 16); ctx.lineTo(LARG, 22); ctx.lineTo(0, 34); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COR.cianoClaro;
  ctx.beginPath();
  ctx.moveTo(0, 34); ctx.lineTo(LARG, 22); ctx.lineTo(LARG, 26); ctx.lineTo(0, 40); ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------------ partes comuns

function cabecalho(d, titulo, numero) {
  const e = estado.empresa || {};
  const topo = 70;

  // título e número à direita
  const fT = F(400, titulo.length > 12 ? 50 : 62, TITULO);
  d.texto(titulo.toUpperCase(), LARG - M, topo + 58, fT, COR.marinho, 'right');
  d.texto(`Nº ${numero}`, LARG - M, topo + 112, F(400, 44, TITULO), COR.ciano, 'right');
  d.texto(`Emitido em ${dataBR(hoje())}`, LARG - M, topo + 146, F(500, 19), COR.suave, 'right');
  const largDir = Math.max(d.medir(titulo.toUpperCase(), fT), 280);

  // logo à esquerda
  let y = topo;
  if (logo?.naturalWidth) {
    const h = 132;
    const w = Math.min(Math.round(h * (logo.naturalWidth / logo.naturalHeight)), CW - largDir - 40);
    const hh = Math.round(w / (logo.naturalWidth / logo.naturalHeight));
    d.ctx().drawImage(logo, M - 4, y - 8, w, hh);
    y += hh;
  } else {
    d.texto(e.nome || 'Concept Vidros', M, y + 56, F(400, 56, TITULO), COR.marinho);
    y += 72;
  }

  // contatos da empresa
  const largEsq = CW - largDir - 40;
  const linhas = [
    [e.telefone && `Tel. ${e.telefone}`, e.whatsapp && `WhatsApp ${e.whatsapp}`].filter(Boolean).join('     '),
    [e.endereco, e.cidade].filter(Boolean).join(', '),
    [e.documento && `CNPJ/CPF ${e.documento}`, e.email].filter(Boolean).join('     '),
  ].filter(Boolean);
  y += 10;
  for (const l of linhas) {
    for (const parte of d.quebrar(l, largEsq, F(500, 18))) {
      d.texto(parte, M, y + 18, F(500, 18), COR.suave);
      y += 27;
    }
  }
  d.y = Math.max(y, topo + 160) + 22;
  d.ret(M, d.y, CW, 4, COR.marinho);
  d.y += 4;
}

function cabecalhoContinuacao(titulo, numero) {
  return d => {
    const y = 64;
    if (logo?.naturalWidth) {
      const h = 64;
      const w = Math.round(h * (logo.naturalWidth / logo.naturalHeight));
      d.ctx().drawImage(logo, M - 2, y - 6, w, h);
    }
    d.texto(`${titulo.toUpperCase()} Nº ${numero}`, LARG - M, y + 34, F(400, 32, TITULO), COR.marinho, 'right');
    d.texto('continuação', LARG - M, y + 60, F(500, 17), COR.suave, 'right');
    d.ret(M, y + 82, CW, 3, COR.marinho);
    return y + 85;
  };
}

// duas colunas de informação: [[rótulo, valor], [rótulo, valor]]; uma coluna se o segundo for null
function linhaInfo(d, a, b = null) {
  const col2 = M + CW / 2 + 18;
  const largCol = b ? CW / 2 - 30 : CW;
  const fV = F(600, 23);
  const la = d.quebrar(a[1] || '–', largCol, fV);
  const lb = b ? d.quebrar(b[1] || '–', largCol, fV) : [];
  const h = 22 + 30 + Math.max(la.length, lb.length || 1) * 33 + 14;
  d.precisa(h);
  d.y += 20;
  d.texto(a[0], M, d.y + 17, F(600, 16), COR.suave);
  if (b) d.texto(b[0], col2, d.y + 17, F(600, 16), COR.suave);
  d.y += 28;
  let ya = d.y;
  la.forEach(l => { d.texto(l, M, ya + 23, fV); ya += 33; });
  let yb = d.y;
  lb.forEach(l => { d.texto(l, col2, yb + 23, fV); yb += 33; });
  d.y = Math.max(ya, yb) + 12;
  d.pauta();
}

function blocoTotal(d, rotulo, valor) {
  d.precisa(140);
  d.y += 16;
  d.ret(M, d.y, CW, 112, COR.marinho);
  // borda de vidro embaixo do bloco
  const ctx = d.ctx();
  ctx.fillStyle = COR.cianoMedio;
  ctx.fillRect(M, d.y + 106, CW, 6);
  d.texto(rotulo.toUpperCase(), M + 30, d.y + 72, F(400, 40, TITULO), '#ffffff');
  d.texto(moeda(valor), LARG - M - 30, d.y + 80, F(400, 66, TITULO), '#ffffff', 'right');
  d.y += 112;
}

function linhaValor(d, rotulo, valor, destaque = false) {
  d.precisa(40);
  d.texto(rotulo, LARG - M - 270, d.y + 26, F(destaque ? 600 : 500, 21), destaque ? COR.texto : COR.suave, 'right');
  d.texto(valor, LARG - M, d.y + 26, F(destaque ? 700 : 600, 22), COR.texto, 'right');
  d.y += 38;
}

function assinaturas(d, esquerda, direita) {
  d.precisa(128);
  d.y += 84;
  const larg = CW / 2 - 40;
  d.ret(M, d.y, larg, 2, COR.texto);
  d.ret(LARG - M - larg, d.y, larg, 2, COR.texto);
  d.y += 10;
  d.texto(esquerda, M + larg / 2, d.y + 20, F(500, 18), COR.suave, 'center');
  d.texto(direita, LARG - M - larg / 2, d.y + 20, F(500, 18), COR.suave, 'center');
  d.y += 36;
}

function rodapes(d) {
  const e = estado.empresa || {};
  const total = d.paginas.length;
  d.paginas.forEach(({ ctx }, i) => {
    ctx.fillStyle = COR.pauta;
    ctx.fillRect(M, ALT - 86, CW, 2);
    ctx.font = F(500, 16);
    ctx.fillStyle = COR.suave;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText([e.nome || 'Concept Vidros', 'Onde a qualidade encontra design'].join('. '), M, ALT - 54);
    ctx.textAlign = 'right';
    ctx.fillText(total > 1 ? `Página ${i + 1} de ${total}` : 'Documento sem valor fiscal', LARG - M, ALT - 54);
  });
}

function dadosCliente(s) {
  const c = buscar('clientes', s.clienteId) || {};
  return {
    nome: s.clienteNome || c.nome || '',
    telefone: c.telefone || s.clienteTelefone || '',
    documento: c.documento || '',
    endereco: s.endereco || [c.endereco, c.bairro, c.cidade].filter(Boolean).join(', '),
  };
}

// ------------------------------------------------------------------ tabela de itens

function tabelaItens(d, itens, { precos = true, checagem = false } = {}) {
  if (!itens.length) {
    d.precisa(50);
    d.y += 20;
    d.texto('Nenhum item lançado.', M, d.y + 22, F(500, 20), COR.suave);
    d.y += 34;
    return;
  }
  const xFim = LARG - M;
  const cols = precos
    ? { qtd: xFim - 470, total: xFim - 330, preco: xFim - 175, sub: xFim }
    : { qtd: xFim - 170, total: xFim };
  const xDesc = M + (checagem ? 44 : 0);
  const largDesc = (precos ? cols.qtd - 70 : cols.qtd - 90) - xDesc;

  const cab = () => {
    d.y += 30;
    const f = F(600, 16);
    if (checagem) d.texto('Ok', M, d.y + 16, f, COR.suave);
    d.texto('Descrição e medidas', xDesc, d.y + 16, f, COR.suave);
    d.texto('Qtd.', cols.qtd, d.y + 16, f, COR.suave, 'right');
    d.texto('Total', cols.total, d.y + 16, f, COR.suave, 'right');
    if (precos) {
      d.texto('Preço', cols.preco, d.y + 16, f, COR.suave, 'right');
      d.texto('Subtotal', cols.sub, d.y + 16, f, COR.suave, 'right');
    }
    d.y += 28;
    d.ret(M, d.y, CW, 3, COR.marinho);
    d.y += 3;
  };

  d.precisa(140);
  cab();
  itens.forEach(it => {
    const fD = F(600, 21);
    const linhas = d.quebrar(it.descricao || 'Item', largDesc, fD);
    const med = medidaTexto(it);
    const h = 18 + linhas.length * 30 + (med ? 28 : 0) + 14;
    if (d.precisa(h)) cab();
    const y0 = d.y + 18;
    if (checagem) {
      d.ctx().strokeStyle = COR.texto;
      d.ctx().lineWidth = 2;
      d.ctx().strokeRect(M + 2, y0 + 2, 22, 22);
    }
    let y = y0;
    linhas.forEach(l => { d.texto(l, xDesc, y + 21, fD); y += 30; });
    if (med) { d.texto(med, xDesc, y + 19, F(500, 18), COR.suave); y += 28; }
    const fN = F(500, 20);
    d.texto(num(it.qtd, 3), cols.qtd, y0 + 21, fN, COR.texto, 'right');
    d.texto(quantTexto(it), cols.total, y0 + 21, fN, COR.texto, 'right');
    if (precos) {
      d.texto(moeda(it.preco), cols.preco, y0 + 21, fN, COR.suave, 'right');
      d.texto(moeda(it.subtotal), cols.sub, y0 + 21, F(700, 21), COR.texto, 'right');
    }
    d.y = y + 12;
    d.pauta();
  });
}

// ------------------------------------------------------------------ os três documentos

function desenharOrcamento(s) {
  const e = estado.empresa || {};
  const n = numeroOS(s.numero);
  const titulo = s.status === 'orcamento' ? 'Orçamento' : 'Pedido';
  const d = criarDocumento(cabecalhoContinuacao(titulo, n));
  cabecalho(d, titulo, n);
  const c = dadosCliente(s);
  const { itens, somaItens, maoDeObra, desconto, total } = totaisServico(s);
  const pago = totalPago(s);
  const validade = Number(e.validadeOrcamento) || 7;

  linhaInfo(d, ['Cliente', c.nome], ['Telefone / WhatsApp', c.telefone]);
  linhaInfo(d, ['Endereço da obra', c.endereco || 'A combinar']);
  if (s.status === 'orcamento') {
    linhaInfo(d, ['Válido até', `${dataBR(somarDias(hoje(), validade))} (${validade} dias)`], ['Previsão de entrega', s.dataPrevista ? dataBR(s.dataPrevista) : 'A combinar']);
  } else {
    linhaInfo(d, ['Situação', statusInfo(s.status).nome], ['Previsão de entrega', s.dataPrevista ? dataBR(s.dataPrevista) : 'A combinar']);
  }

  d.rotulo(s.tipo ? `Serviço: ${s.tipo}` : 'Serviço');
  d.paragrafo(s.descricao || s.tipo || '', M, CW, 23, 500);

  d.y += 8;
  tabelaItens(d, itens, { precos: true });

  d.y += 18;
  if (itens.length && (maoDeObra || desconto)) linhaValor(d, 'Materiais e vidros', moeda(somaItens));
  if (maoDeObra) linhaValor(d, 'Mão de obra e instalação', moeda(maoDeObra));
  if (desconto) linhaValor(d, 'Desconto', `− ${moeda(desconto)}`);
  blocoTotal(d, 'Total', total);
  if (pago > 0) {
    d.y += 14;
    linhaValor(d, 'Já pago', moeda(pago));
    linhaValor(d, 'Falta pagar', moeda(Math.max(0, total - pago)), true);
  }

  const condicoes = [
    s.formaCombinada && `Pagamento: ${s.formaCombinada}`,
    e.pix && `Chave PIX: ${e.pix}`,
    e.condicoes,
  ].filter(Boolean);
  if (condicoes.length) {
    d.rotulo('Condições');
    condicoes.forEach(t => { d.paragrafo(t, M, CW, 19, 500, COR.texto, 29); d.y += 6; });
  }

  assinaturas(d, e.nome || 'Concept Vidros', `${c.nome || 'Cliente'} (de acordo)`);
  rodapes(d);
  return d.paginas.map(p => p.cv);
}

function desenharRecibo(s) {
  const e = estado.empresa || {};
  const n = numeroOS(s.numero);
  const d = criarDocumento(cabecalhoContinuacao('Recibo', n));
  cabecalho(d, 'Recibo', n);
  const c = dadosCliente(s);
  const pago = totalPago(s);
  const total = lerNumero(s.valorTotal);

  linhaInfo(d, ['Cliente', c.nome], ['CPF/CNPJ', c.documento || '–']);
  linhaInfo(d, ['Endereço da obra', c.endereco || '–']);

  d.y += 30;
  d.paragrafo(
    `Recebemos de ${c.nome || 'cliente'} a quantia de ${moeda(pago)}, referente ao pedido nº ${n}: ${(s.descricao || s.tipo || '').replace(/\.$/, '')}.`,
    M, CW, 25, 500, COR.texto, 40,
  );

  d.rotulo('Pagamentos');
  const pags = [...(s.pagamentos || [])].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  d.ret(M, d.y, CW, 3, COR.marinho);
  d.y += 3;
  pags.forEach(p => {
    d.precisa(56);
    d.y += 14;
    d.texto(dataBR(p.data), M, d.y + 22, F(600, 21));
    d.texto([p.forma, p.obs].filter(Boolean).join(', ') || '–', M + 170, d.y + 22, F(500, 20), COR.suave);
    d.texto(moeda(p.valor), LARG - M, d.y + 22, F(700, 21), COR.texto, 'right');
    d.y += 38;
    d.pauta();
  });

  d.y += 18;
  linhaValor(d, 'Valor do pedido', moeda(total));
  blocoTotal(d, 'Recebido', pago);
  const falta = Math.max(0, total - pago);
  d.y += 14;
  linhaValor(d, falta > 0 ? 'Falta pagar' : 'Situação', falta > 0 ? moeda(falta) : 'Quitado', true);

  assinaturas(d, `${e.nome || 'Concept Vidros'}${e.documento ? `, CNPJ ${e.documento}` : ''}`, `${e.cidade ? `${e.cidade}, ` : 'Data: '}${dataBR(hoje())}`);
  rodapes(d);
  return d.paginas.map(p => p.cv);
}

function desenharOS(s) {
  const n = numeroOS(s.numero);
  const d = criarDocumento(cabecalhoContinuacao('Ordem de serviço', n));
  cabecalho(d, 'Ordem de serviço', n);
  const c = dadosCliente(s);
  const { itens } = totaisServico(s);
  const saldo = saldoServico(s);

  linhaInfo(d, ['Cliente', c.nome], ['Telefone / WhatsApp', c.telefone]);
  linhaInfo(d, ['Endereço da obra', c.endereco || 'A combinar']);
  linhaInfo(d, ['Tipo', s.tipo || '–'], ['Situação', statusInfo(s.status).nome]);
  linhaInfo(d, ['Previsão', s.dataPrevista ? dataBR(s.dataPrevista) : 'A combinar'], ['Responsável', s.responsavelNome || 'Sem responsável']);
  linhaInfo(d, ['Prioridade', s.prioridade === 'urgente' ? 'URGENTE' : 'Normal'], ['Receber na entrega', saldo > 0 ? moeda(saldo) : 'Nada']);

  d.rotulo('O que fazer');
  d.paragrafo(s.descricao || '', M, CW, 23, 500);
  if (s.obs) { d.y += 6; d.paragrafo(`Observação: ${s.obs}`, M, CW, 20, 500, COR.suave, 30); }

  d.y += 8;
  tabelaItens(d, itens, { precos: false, checagem: true });

  const internas = ['Editado', 'Dados editados', 'Pagamento', 'Baixa no estoque', 'Responsável', 'Sem responsável', 'Nova data', 'Data prevista'];
  const notas = (s.historico || []).filter(h => h.nota && h.obs && !internas.some(t => h.obs.startsWith(t))).slice(-5);
  if (notas.length) {
    d.rotulo('Anotações');
    notas.forEach(h => d.paragrafo(`${dataBR(h.data)}: ${h.obs}`, M, CW, 19, 500, COR.texto, 29));
  }

  d.rotulo('Observações da produção e instalação');
  for (let i = 0; i < 4; i++) { d.precisa(44); d.y += 42; d.ret(M, d.y, CW, 1.5, '#a9b5c4'); }

  assinaturas(d, 'Responsável pela instalação', 'Recebido por (cliente), data ___/___/____');
  rodapes(d);
  return d.paginas.map(p => p.cv);
}

// ------------------------------------------------------------------ PDF (feito à mão, sem biblioteca)

function textoPdf(s) {
  // texto em UTF-16 para os acentos aparecerem certo nas propriedades do arquivo
  let h = 'FEFF';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c <= 0xffff) h += c.toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${h}>`;
}

function montarPdf(imagens, titulo) {
  const enc = new TextEncoder();
  const partes = [];
  const offs = [];
  let pos = 0;
  const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); pos += b.length; };
  const objeto = (n, escrever) => { offs[n] = pos; add(`${n} 0 obj\n`); escrever(); add('\nendobj\n'); };

  const PW = 595.28;
  const PH = 841.89;
  const qtd = imagens.length;
  const ultimo = 3 + qtd * 3;
  const agora = new Date();
  const p2 = v => String(v).padStart(2, '0');
  const data = `D:${agora.getFullYear()}${p2(agora.getMonth() + 1)}${p2(agora.getDate())}${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;

  add('%PDF-1.4\n%âãÏÓ\n');
  objeto(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
  objeto(2, () => add(`<< /Type /Pages /Kids [${imagens.map((_, i) => `${4 + i * 3} 0 R`).join(' ')}] /Count ${qtd} >>`));
  objeto(3, () => add(`<< /Title ${textoPdf(titulo)} /Author ${textoPdf(estado.empresa?.nome || 'Concept Vidros')} /Producer (Sistema Concept Vidros) /CreationDate (${data}) >>`));
  imagens.forEach((img, i) => {
    const pg = 4 + i * 3;
    const conteudo = `q ${PW} 0 0 ${PH} 0 0 cm /Im${i} Do Q`;
    objeto(pg, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${pg + 2} 0 R >> >> /Contents ${pg + 1} 0 R >>`));
    objeto(pg + 1, () => add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`));
    objeto(pg + 2, () => {
      add(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.dados.length} >>\nstream\n`);
      add(img.dados);
      add('\nendstream');
    });
  });
  const inicioXref = pos;
  let xref = `xref\n0 ${ultimo + 1}\n0000000000 65535 f \n`;
  for (let k = 1; k <= ultimo; k++) xref += `${String(offs[k]).padStart(10, '0')} 00000 n \n`;
  add(xref);
  add(`trailer\n<< /Size ${ultimo + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  return new Blob(partes, { type: 'application/pdf' });
}

function canvasParaJpeg(cv) {
  return new Promise((ok, falha) => cv.toBlob(b => (b ? ok(b) : falha(new Error('Não foi possível gerar a imagem'))), 'image/jpeg', 0.9));
}

function nomeArquivo(tipo, s) {
  const cliente = normalizar(s.clienteNome || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `${TIPOS_DOC[tipo].arquivo}-${numeroOS(s.numero)}${cliente ? `-${cliente}` : ''}.pdf`;
}

// Gera o PDF de um serviço. Retorna { file, imagens: [urls], blobs }
export async function gerarPdf(s, tipo = 'orcamento') {
  await prepararRecursos();
  const desenhar = { orcamento: desenharOrcamento, recibo: desenharRecibo, os: desenharOS }[tipo] || desenharOrcamento;
  const canvases = desenhar(s);
  const jpegs = await Promise.all(canvases.map(canvasParaJpeg));
  const imagens = await Promise.all(jpegs.map(async (b, i) => ({
    dados: new Uint8Array(await b.arrayBuffer()), w: canvases[i].width, h: canvases[i].height,
  })));
  const titulo = `${s.status === 'orcamento' || tipo !== 'orcamento' ? TIPOS_DOC[tipo].titulo : 'Pedido'} ${numeroOS(s.numero)}, ${s.clienteNome || ''}`;
  const pdf = montarPdf(imagens, titulo);
  const file = new File([pdf], nomeArquivo(tipo, s), { type: 'application/pdf' });
  return { file, paginas: jpegs, titulo };
}

// ------------------------------------------------------------------ texto para o WhatsApp

export function textoOrcamento(s) {
  const e = estado.empresa || {};
  const n = numeroOS(s.numero);
  const { itens, maoDeObra, desconto, total } = totaisServico(s);
  const l = [];
  l.push(`Olá, ${primeiroNome(s.clienteNome)}! Aqui é da ${e.nome || 'Concept Vidros'}.`);
  l.push('');
  l.push(`*${s.status === 'orcamento' ? 'Orçamento' : 'Pedido'} nº ${n}*`);
  l.push([s.tipo, s.descricao].filter(Boolean).join(': '));
  if (itens.length) {
    l.push('');
    itens.forEach(it => {
      const med = medidaTexto(it);
      l.push(`• ${it.descricao}${med ? ` (${med}${it.qtd > 1 ? `, ${num(it.qtd, 3)} pç` : ''})` : it.qtd > 1 ? ` (${num(it.qtd, 3)})` : ''}: ${moeda(it.subtotal)}`);
    });
  }
  if (maoDeObra) l.push(`• Mão de obra e instalação: ${moeda(maoDeObra)}`);
  if (desconto) l.push(`Desconto: − ${moeda(desconto)}`);
  l.push('');
  l.push(`*Total: ${moeda(total)}*`);
  const pago = totalPago(s);
  if (pago > 0) l.push(`Já pago: ${moeda(pago)}. Falta: ${moeda(Math.max(0, total - pago))}`);
  if (s.status === 'orcamento') {
    const v = Number(e.validadeOrcamento) || 7;
    l.push(`Válido até ${dataBR(somarDias(hoje(), v))}.`);
  }
  if (s.formaCombinada) l.push(`Pagamento: ${s.formaCombinada}`);
  if (e.pix) l.push(`PIX: ${e.pix}`);
  return l.join('\n');
}

// ------------------------------------------------------------------ janela do documento

function baixar(file) {
  const u = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = u;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 8000);
}

const podeCompartilhar = file => {
  try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch { return false; }
};

export function abrirDocumento(servicoId, tipoInicial = null) {
  const s0 = buscar('servicos', servicoId);
  if (!s0) { toast('Serviço não encontrado.', 'erro'); return; }
  const temPagamento = totalPago(s0) > 0;
  let tipo = tipoInicial || (['concluido'].includes(s0.status) && temPagamento ? 'recibo' : 'orcamento');
  let atual = null;      // { tipo, file, urls }
  let geracao = 0;

  const rotOrc = s0.status === 'orcamento' ? 'Orçamento' : 'Pedido';
  const opcoes = [['orcamento', rotOrc], ...(temPagamento ? [['recibo', 'Recibo']] : []), ['os', 'OS da produção']];

  abrirModal({
    titulo: `${rotOrc} ${numeroOS(s0.numero)}`,
    classe: 'modal-doc',
    corpo: `
      <div class="segmentado doc-tipos" role="group" aria-label="Tipo de documento">
        ${opcoes.map(([v, t]) => `<button type="button" data-tipo-doc="${v}" aria-pressed="${v === tipo}">${t}</button>`).join('')}
      </div>
      <div class="doc-previa" aria-live="polite"></div>
      <div class="doc-acoes-extra">
        <button type="button" class="btn btn-pequeno" data-doc="baixar">${icone('baixar')} Baixar PDF</button>
        <button type="button" class="btn btn-pequeno" data-doc="imprimir">${icone('imprimir')} Imprimir</button>
      </div>
      <p class="doc-nota">No celular, "Enviar PDF" abre o menu de compartilhar: escolha o WhatsApp e a conversa do cliente. No computador o PDF é baixado e a conversa do cliente abre no WhatsApp Web, aí é só anexar.</p>`,
    rodape: `
      <button type="button" class="btn" data-doc="texto">${icone('conversa')}<span>Mandar como texto</span></button>
      <button type="button" class="btn btn-primario" data-doc="enviar" disabled>${icone('compartilhar')}<span>Enviar PDF</span></button>`,
    aoFechar() { limpar(); },
    aoMontar(m) {
      const previa = $('.doc-previa', m.el);
      const btEnviar = $('[data-doc="enviar"]', m.el);

      async function gerar() {
        const minha = ++geracao;
        limpar();
        btEnviar.disabled = true;
        $$('[data-tipo-doc]', m.el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipoDoc === tipo)));
        previa.innerHTML = '<div class="doc-gerando"><span class="giro" aria-hidden="true"></span><p>Gerando o PDF…</p></div>';
        try {
          const s = buscar('servicos', servicoId) || s0;
          const r = await gerarPdf(s, tipo);
          if (minha !== geracao || m.fechado) return;
          atual = { tipo, file: r.file, urls: r.paginas.map(b => URL.createObjectURL(b)) };
          previa.innerHTML = atual.urls.map((u, i) => `<img src="${u}" alt="Página ${i + 1} do documento">`).join('');
          btEnviar.disabled = false;
          const tam = r.file.size > 1048576 ? `${(r.file.size / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(r.file.size / 1024))} KB`;
          $('h2', m.el).textContent = `${TIPOS_DOC[tipo].titulo === 'Orçamento' ? rotOrc : TIPOS_DOC[tipo].titulo} ${numeroOS(s.numero)}`;
          previa.insertAdjacentHTML('beforeend', `<p class="doc-info">${esc(r.file.name)}, ${atual.urls.length} ${atual.urls.length === 1 ? 'página' : 'páginas'}, ${tam}</p>`);
        } catch (e) {
          console.error(e);
          if (minha === geracao) previa.innerHTML = `<p class="texto-perigo">Não foi possível gerar o PDF: ${esc(e.message)}</p>`;
        }
      }

      m.el.addEventListener('click', async e => {
        const t = e.target.closest('[data-tipo-doc]');
        if (t && t.dataset.tipoDoc !== tipo) { tipo = t.dataset.tipoDoc; gerar(); return; }
        const b = e.target.closest('[data-doc]');
        if (!b) return;
        const s = buscar('servicos', servicoId) || s0;
        const acao = b.dataset.doc;

        if (acao === 'texto') {
          const tel = buscar('clientes', s.clienteId)?.telefone || s.clienteTelefone;
          const link = linkWhatsApp(tel, textoOrcamento(s));
          if (!link) { toast('Cadastre o telefone do cliente para mandar no WhatsApp.', 'erro'); return; }
          window.open(link, '_blank', 'noopener');
          return;
        }
        if (!atual) { toast('O PDF ainda está sendo gerado.'); return; }

        if (acao === 'enviar') {
          // sem "await" antes do share: o iPhone exige que seja direto no toque
          if (podeCompartilhar(atual.file)) {
            navigator.share({ files: [atual.file] }).catch(err => {
              if (err?.name !== 'AbortError') { baixar(atual.file); toast('PDF baixado.'); }
            });
          } else {
            baixar(atual.file);
            const tel = buscar('clientes', s.clienteId)?.telefone || s.clienteTelefone;
            const msg = `Olá, ${primeiroNome(s.clienteNome)}! Aqui é da ${estado.empresa?.nome || 'Concept Vidros'}. Segue o ${TIPOS_DOC[atual.tipo].titulo.toLowerCase()} nº ${numeroOS(s.numero)} em PDF.`;
            const link = linkWhatsApp(tel, msg);
            if (link) window.open(link, '_blank', 'noopener');
            toast(link ? 'PDF baixado. Anexe o arquivo na conversa que abriu no WhatsApp.' : 'PDF baixado.');
          }
        } else if (acao === 'baixar') {
          baixar(atual.file);
          toast('PDF baixado');
        } else if (acao === 'imprimir') {
          imprimirPaginas(atual.urls, atual.file.name.replace(/\.pdf$/, ''));
        }
      });

      gerar();
    },
  });

  function limpar() {
    if (atual) atual.urls.forEach(u => URL.revokeObjectURL(u));
    atual = null;
  }
}

// Imprime as páginas do documento (as mesmas do PDF)
async function imprimirPaginas(urls, titulo) {
  const area = document.getElementById('impressao');
  area.innerHTML = urls.map(u => `<img src="${u}" alt="">`).join('');
  try { await Promise.all($$('img', area).map(i => i.decode())); } catch {}
  const antes = document.title;
  document.title = titulo;
  const voltar = () => { document.title = antes; area.innerHTML = ''; window.removeEventListener('afterprint', voltar); };
  window.addEventListener('afterprint', voltar);
  window.print();
}
