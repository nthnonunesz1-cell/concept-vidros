// Cálculos e regras do negócio (não gravam nada no banco).
import { MEDIDA } from './config.js';
import { STATUS_EM_ANDAMENTO } from './constantes.js';
import { arred, lerNumero, hoje, num } from './util.js';

export const ROTULO_MEDIDA = MEDIDA === 'mm' ? 'mm' : 'cm';

export const paraMetros = v => lerNumero(v) / (MEDIDA === 'mm' ? 1000 : 100);

export const numeroOS = n => String(n || 0).padStart(4, '0');

// Como um produto é cobrado, pela unidade do estoque
export function modoDaUnidade(unidade) {
  if (unidade === 'm²') return 'm2';
  if (unidade === 'm') return 'm';
  return 'un';
}

export const UNIDADE_DO_MODO = { m2: 'm²', m: 'm', un: 'un' };

// Calcula quantidade cobrada (m², metros ou unidades) e subtotal de um item
export function calcularItem(it) {
  const qtd = lerNumero(it.qtd);
  const preco = lerNumero(it.preco);
  const larg = lerNumero(it.larg);
  const alt = lerNumero(it.alt);
  const modo = it.modo || 'un';
  let quant;
  if (modo === 'm2') quant = paraMetros(larg) * paraMetros(alt) * qtd;
  else if (modo === 'm') quant = paraMetros(larg) * qtd;
  else quant = qtd;
  quant = arred(quant, 3);
  return {
    produtoId: it.produtoId || '',
    descricao: String(it.descricao || '').trim(),
    modo, larg, alt, qtd, preco, quant,
    subtotal: arred(quant * preco),
  };
}

export function totaisServico(s) {
  const itens = (s.itens || []).map(calcularItem).filter(i => i.descricao || i.subtotal || i.produtoId);
  const somaItens = arred(itens.reduce((t, i) => t + i.subtotal, 0));
  const maoDeObra = lerNumero(s.maoDeObra);
  const desconto = lerNumero(s.desconto);
  const total = arred(Math.max(0, somaItens + maoDeObra - desconto));
  return { itens, somaItens, maoDeObra, desconto, total };
}

export function medidaTexto(it) {
  if (it.modo === 'm2' && (it.larg || it.alt)) return `${num(it.larg, 1)} × ${num(it.alt, 1)} ${ROTULO_MEDIDA}`;
  if (it.modo === 'm' && it.larg) return `${num(it.larg, 1)} ${ROTULO_MEDIDA}`;
  return '';
}

export function quantTexto(it) {
  return `${num(it.quant, 3)} ${UNIDADE_DO_MODO[it.modo] || 'un'}`;
}

export const totalPago = s => arred((s.pagamentos || []).reduce((t, p) => t + lerNumero(p.valor), 0));

export function saldoServico(s) {
  if (s.status === 'cancelado' || s.status === 'orcamento') return 0;
  return arred(Math.max(0, lerNumero(s.valorTotal) - totalPago(s)));
}

export function atrasado(s) {
  return !!s.dataPrevista && s.dataPrevista < hoje() && STATUS_EM_ANDAMENTO.includes(s.status);
}

export function estoqueBaixo(p) {
  const min = lerNumero(p.estoqueMinimo);
  return min > 0 && lerNumero(p.quantidade) <= min;
}

export const estoqueZerado = p => lerNumero(p.quantidade) <= 0;

// Urgentes primeiro, depois pela data prevista (sem data vai para o fim), depois pelo número
export function ordenarFila(a, b) {
  const ua = a.prioridade === 'urgente' ? 0 : 1;
  const ub = b.prioridade === 'urgente' ? 0 : 1;
  if (ua !== ub) return ua - ub;
  const da = a.dataPrevista || '9999-99-99';
  const dbb = b.dataPrevista || '9999-99-99';
  if (da !== dbb) return da < dbb ? -1 : 1;
  return (a.numero || 0) - (b.numero || 0);
}

// Itens do serviço que estão ligados a um produto do estoque
export function materiaisDoServico(s) {
  const mapa = new Map();
  for (const it of (s.itens || [])) {
    if (!it.produtoId || !(it.quant > 0)) continue;
    const atual = mapa.get(it.produtoId) || { produtoId: it.produtoId, descricao: it.descricao, quant: 0 };
    atual.quant = arred(atual.quant + it.quant, 3);
    mapa.set(it.produtoId, atual);
  }
  return [...mapa.values()];
}
