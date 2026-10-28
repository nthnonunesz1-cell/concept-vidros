// Tudo que grava no banco passa por aqui.
import { db } from './db.js';
import { estado, buscar } from './estado.js';
import { agora, hoje, arred, lerNumero, somarMesesData } from './util.js';
import { totaisServico, numeroOS, materiaisDoServico } from './regras.js';

function quem() {
  return { usuarioId: estado.usuario?.id || '', usuarioNome: estado.usuario?.nome || '' };
}

function evento(status, obs = '', extra = {}) {
  return { data: agora(), status, obs, ...quem(), ...extra };
}

// ================================================================ clientes

export async function salvarCliente(d, id = null) {
  const dados = {
    nome: d.nome, telefone: d.telefone || '', documento: d.documento || '', email: d.email || '',
    endereco: d.endereco || '', bairro: d.bairro || '', cidade: d.cidade || '', obs: d.obs || '',
    atualizadoEm: agora(),
  };
  if (id) {
    await db.atualizar('clientes', id, dados);
    // mantém o nome/telefone atualizados nos serviços em aberto desse cliente
    const ops = estado.servicos
      .filter(s => s.clienteId === id && (s.clienteNome !== dados.nome || s.clienteTelefone !== dados.telefone))
      .map(s => ({ tipo: 'update', col: 'servicos', id: s.id, dados: { clienteNome: dados.nome, clienteTelefone: dados.telefone } }));
    if (ops.length) await db.lote(ops.slice(0, 450));
    return id;
  }
  return db.adicionar('clientes', { ...dados, criadoEm: agora(), criadoPor: estado.usuario?.nome || '' });
}

export async function excluirCliente(id) {
  await db.remover('clientes', id);
}

// ================================================================ serviços

export async function salvarServico(d, id = null) {
  const { itens, total } = totaisServico(d);
  const cliente = buscar('clientes', d.clienteId);
  const resp = buscar('usuarios', d.responsavelId);
  const dados = {
    clienteId: d.clienteId,
    clienteNome: cliente?.nome || d.clienteNome || '',
    clienteTelefone: cliente?.telefone || d.clienteTelefone || '',
    tipo: d.tipo || '',
    descricao: d.descricao || '',
    endereco: d.endereco || '',
    itens,
    maoDeObra: lerNumero(d.maoDeObra),
    desconto: lerNumero(d.desconto),
    valorTotal: total,
    prioridade: d.prioridade === 'urgente' ? 'urgente' : 'normal',
    dataPrevista: d.dataPrevista || '',
    responsavelId: d.responsavelId || '',
    responsavelNome: resp?.nome || '',
    formaCombinada: d.formaCombinada || '',
    obs: d.obs || '',
    atualizadoEm: agora(),
  };

  if (id) {
    const antes = buscar('servicos', id);
    const mudancas = [];
    if (antes && antes.responsavelId !== dados.responsavelId) mudancas.push(dados.responsavelNome ? `Responsável: ${dados.responsavelNome}` : 'Sem responsável');
    if (antes && antes.dataPrevista !== dados.dataPrevista) mudancas.push(dados.dataPrevista ? `Nova data prevista: ${dados.dataPrevista.split('-').reverse().join('/')}` : 'Data prevista removida');
    if (antes && arred(antes.valorTotal) !== arred(dados.valorTotal)) mudancas.push('Valores alterados');
    await db.atualizar('servicos', id, {
      ...dados,
      historico: db.unir(evento(antes?.status || 'orcamento', mudancas.length ? `Editado (${mudancas.join('; ')})` : 'Dados editados', { nota: true })),
    });
    return id;
  }

  let numero = await db.proximoNumero('servicos');
  if (!numero) {
    numero = Math.max(0, ...estado.servicos.map(s => s.numero || 0)) + 1;
    db.definir('sistema', 'contador', { servicos: numero }, { mesclar: true }).catch(() => {});
  }
  const status = d.status === 'aprovado' ? 'aprovado' : 'orcamento';
  const historico = [evento('orcamento', 'Serviço criado')];
  if (status === 'aprovado') historico.push(evento('aprovado', 'Já criado como aprovado'));
  return db.adicionar('servicos', {
    ...dados,
    numero,
    status,
    pagamentos: [],
    estoqueBaixado: false,
    historico,
    aprovadoEm: status === 'aprovado' ? agora() : '',
    criadoEm: agora(),
    criadoPor: estado.usuario?.nome || '',
  });
}

export async function mudarStatus(s, novo, obs = '') {
  const dados = { status: novo, atualizadoEm: agora(), historico: db.unir(evento(novo, obs)) };
  if (novo === 'aprovado' && !s.aprovadoEm) dados.aprovadoEm = agora();
  if (novo === 'concluido') dados.concluidoEm = agora();
  await db.atualizar('servicos', s.id, dados);
}

export async function adicionarNota(s, texto) {
  await db.atualizar('servicos', s.id, {
    atualizadoEm: agora(),
    historico: db.unir(evento(s.status, texto, { nota: true })),
  });
}

export async function definirResponsavel(s, usuarioId) {
  const u = buscar('usuarios', usuarioId);
  await db.atualizar('servicos', s.id, {
    responsavelId: usuarioId || '',
    responsavelNome: u?.nome || '',
    atualizadoEm: agora(),
    historico: db.unir(evento(s.status, u ? `Responsável: ${u.nome}` : 'Sem responsável', { nota: true })),
  });
}

export async function excluirServico(s) {
  // apaga também os lançamentos de pagamento ligados a ele
  const ops = [{ tipo: 'delete', col: 'servicos', id: s.id }];
  for (const p of (s.pagamentos || [])) ops.push({ tipo: 'delete', col: 'lancamentos', id: p.id });
  await db.lote(ops);
}

export async function registrarPagamento(s, { valor, forma, data, obs }) {
  valor = arred(lerNumero(valor));
  const lancId = db.novoId('lancamentos');
  const n = numeroOS(s.numero);
  await db.lote([
    {
      tipo: 'set', col: 'lancamentos', id: lancId, dados: {
        tipo: 'receita', categoria: 'Serviços', descricao: `Pagamento da OS ${n} (${s.clienteNome})`,
        valor, data: data || hoje(), vencimento: data || hoje(), status: 'pago', forma: forma || '',
        servicoId: s.id, clienteId: s.clienteId || '', clienteNome: s.clienteNome || '', obs: obs || '',
        criadoEm: agora(), criadoPor: estado.usuario?.nome || '',
      },
    },
    {
      tipo: 'update', col: 'servicos', id: s.id, dados: {
        pagamentos: db.unir({ id: lancId, valor, data: data || hoje(), forma: forma || '', obs: obs || '', usuarioNome: estado.usuario?.nome || '' }),
        atualizadoEm: agora(),
        historico: db.unir(evento(s.status, `Pagamento recebido: R$ ${valor.toFixed(2).replace('.', ',')}${forma ? ` (${forma})` : ''}`, { nota: true })),
      },
    },
  ]);
}

export async function removerPagamento(s, pagamentoId) {
  const pagamentos = (s.pagamentos || []).filter(p => p.id !== pagamentoId);
  await db.lote([
    { tipo: 'delete', col: 'lancamentos', id: pagamentoId },
    { tipo: 'update', col: 'servicos', id: s.id, dados: { pagamentos, atualizadoEm: agora() } },
  ]);
}

// Dá baixa no estoque dos itens do serviço ligados a produtos
export async function baixarMateriais(s) {
  const materiais = materiaisDoServico(s).filter(m => buscar('produtos', m.produtoId));
  const ops = [];
  for (const m of materiais) {
    const pr = buscar('produtos', m.produtoId);
    ops.push({ tipo: 'update', col: 'produtos', id: pr.id, dados: { quantidade: db.inc(-m.quant), atualizadoEm: agora() } });
    ops.push({
      tipo: 'set', col: 'movimentos', id: db.novoId('movimentos'), dados: {
        produtoId: pr.id, produtoNome: pr.nome, unidade: pr.unidade, tipo: 'saida', quantidade: m.quant, delta: -m.quant,
        motivo: 'Uso em serviço', servicoId: s.id, servicoNumero: s.numero, data: agora(), ...quem(),
      },
    });
  }
  ops.push({
    tipo: 'update', col: 'servicos', id: s.id, dados: {
      estoqueBaixado: true, atualizadoEm: agora(),
      historico: db.unir(evento(s.status, `Baixa no estoque: ${materiais.length} ${materiais.length === 1 ? 'material' : 'materiais'}`, { nota: true })),
    },
  });
  await db.lote(ops);
  return materiais.length;
}

// ================================================================ estoque

export async function salvarProduto(d, id = null) {
  const dados = {
    nome: d.nome, categoria: d.categoria || 'Outros', unidade: d.unidade || 'un',
    estoqueMinimo: lerNumero(d.estoqueMinimo), custo: lerNumero(d.custo), preco: lerNumero(d.preco),
    fornecedor: d.fornecedor || '', obs: d.obs || '', atualizadoEm: agora(),
  };
  if (id) {
    await db.atualizar('produtos', id, dados);
    return id;
  }
  const qtd = arred(lerNumero(d.quantidade), 3);
  const novoId = db.novoId('produtos');
  const ops = [{ tipo: 'set', col: 'produtos', id: novoId, dados: { ...dados, quantidade: qtd, criadoEm: agora() } }];
  if (qtd) {
    ops.push({
      tipo: 'set', col: 'movimentos', id: db.novoId('movimentos'), dados: {
        produtoId: novoId, produtoNome: dados.nome, unidade: dados.unidade, tipo: 'entrada', quantidade: qtd, delta: qtd,
        motivo: 'Estoque inicial', servicoId: '', servicoNumero: null, data: agora(), ...quem(),
      },
    });
  }
  await db.lote(ops);
  return novoId;
}

export async function excluirProduto(id) {
  await db.remover('produtos', id);
}

/**
 * tipo: 'entrada' | 'saida' | 'ajuste'
 * Para ajuste, "quantidade" é o novo saldo contado.
 */
export async function movimentarEstoque(produto, { tipo, quantidade, motivo = '', servicoId = '', lancarDespesa = false, valorDespesa = 0, forma = '' }) {
  const q = arred(lerNumero(quantidade), 3);
  const atual = lerNumero(produto.quantidade);
  let delta;
  let mudanca;
  if (tipo === 'ajuste') {
    delta = arred(q - atual, 3);
    mudanca = { quantidade: q };
  } else {
    delta = tipo === 'entrada' ? q : -q;
    mudanca = { quantidade: db.inc(delta) };
  }
  const s = servicoId ? buscar('servicos', servicoId) : null;
  const ops = [
    { tipo: 'update', col: 'produtos', id: produto.id, dados: { ...mudanca, atualizadoEm: agora() } },
    {
      tipo: 'set', col: 'movimentos', id: db.novoId('movimentos'), dados: {
        produtoId: produto.id, produtoNome: produto.nome, unidade: produto.unidade, tipo,
        quantidade: tipo === 'ajuste' ? Math.abs(delta) : q, delta, saldoAjustado: tipo === 'ajuste' ? q : null,
        motivo, servicoId: s?.id || '', servicoNumero: s?.numero || null, data: agora(), ...quem(),
      },
    },
  ];
  if (tipo === 'entrada' && lancarDespesa && lerNumero(valorDespesa) > 0) {
    ops.push({
      tipo: 'set', col: 'lancamentos', id: db.novoId('lancamentos'), dados: {
        tipo: 'despesa', categoria: 'Compra de material', descricao: `Compra: ${produto.nome} (${String(q).replace('.', ',')} ${produto.unidade})`,
        valor: arred(lerNumero(valorDespesa)), data: hoje(), vencimento: hoje(), status: 'pago', forma,
        clienteNome: produto.fornecedor || '', obs: motivo, criadoEm: agora(), criadoPor: estado.usuario?.nome || '',
      },
    });
  }
  await db.lote(ops);
}

// ================================================================ financeiro

export async function salvarLancamento(d, id = null) {
  const dados = {
    tipo: d.tipo === 'despesa' ? 'despesa' : 'receita',
    categoria: d.categoria || '',
    descricao: d.descricao,
    valor: arred(lerNumero(d.valor)),
    status: d.status === 'pendente' ? 'pendente' : 'pago',
    data: d.data || hoje(),
    vencimento: d.data || hoje(),
    forma: d.forma || '',
    clienteNome: d.clienteNome || '',
    obs: d.obs || '',
    atualizadoEm: agora(),
  };

  if (id) {
    const antes = buscar('lancamentos', id);
    const ops = [{ tipo: 'update', col: 'lancamentos', id, dados }];
    // se for pagamento de um serviço, mantém o serviço igual
    const s = antes?.servicoId && buscar('servicos', antes.servicoId);
    if (s) {
      const pagamentos = (s.pagamentos || []).map(p => p.id === id ? { ...p, valor: dados.valor, data: dados.data, forma: dados.forma } : p);
      ops.push({ tipo: 'update', col: 'servicos', id: s.id, dados: { pagamentos, atualizadoEm: agora() } });
    }
    await db.lote(ops);
    return id;
  }

  const vezes = Math.max(1, Math.min(24, parseInt(d.repetir, 10) || 1));
  const ops = [];
  for (let i = 0; i < vezes; i++) {
    const data = i === 0 ? dados.data : somarMesesData(dados.data, i);
    ops.push({
      tipo: 'set', col: 'lancamentos', id: db.novoId('lancamentos'), dados: {
        ...dados,
        descricao: vezes > 1 ? `${dados.descricao} (${i + 1}/${vezes})` : dados.descricao,
        data, vencimento: data,
        status: i === 0 ? dados.status : 'pendente',
        criadoEm: agora(), criadoPor: estado.usuario?.nome || '',
      },
    });
  }
  await db.lote(ops);
}

export async function marcarPago(l, { data, forma }) {
  const dados = { status: 'pago', data: data || hoje(), forma: forma || l.forma || '', atualizadoEm: agora() };
  await db.atualizar('lancamentos', l.id, dados);
}

export async function excluirLancamento(l) {
  const ops = [{ tipo: 'delete', col: 'lancamentos', id: l.id }];
  const s = l.servicoId && buscar('servicos', l.servicoId);
  if (s) ops.push({ tipo: 'update', col: 'servicos', id: s.id, dados: { pagamentos: (s.pagamentos || []).filter(p => p.id !== l.id), atualizadoEm: agora() } });
  await db.lote(ops);
}

// ================================================================ equipe e empresa

export async function criarFuncionario({ nome, email, senha, papel }) {
  const uid = await db.criarLogin(email, senha);
  await db.definir('usuarios', uid, {
    nome, email, papel: papel === 'admin' ? 'admin' : 'funcionario', ativo: true,
    criadoEm: agora(), criadoPor: estado.usuario?.nome || '',
  }, { mesclar: true });
  return uid;
}

export async function atualizarFuncionario(id, dados) {
  await db.atualizar('usuarios', id, { ...dados, atualizadoEm: agora() });
}

export async function salvarEmpresa(dados) {
  await db.definir('sistema', 'empresa', { ...dados, atualizadoEm: agora() }, { mesclar: true });
}
