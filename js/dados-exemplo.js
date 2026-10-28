// Dados fictícios do modo demonstração. As datas são calculadas a partir de hoje,
// então o painel sempre parece "vivo" quando você mostra para alguém.
import { DOMINIO_LOGIN } from './config.js';
import { calcularItem, totaisServico } from './regras.js';
import { hoje, somarDias, arred } from './util.js';

export function gerarDadosExemplo() {
  const h = hoje();
  const dia = n => somarDias(h, n);
  const ts = (n, hora = 9, min = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(hora, min, 0, 0);
    return d.toISOString();
  };

  // gerador pseudoaleatório com semente fixa (sempre os mesmos números)
  let semente = 42;
  const rand = () => { semente = (semente * 16807) % 2147483647; return (semente - 1) / 2147483646; };
  const entre = (a, b) => Math.round(a + rand() * (b - a));

  const login = u => `${u}@${DOMINIO_LOGIN}`;

  const usuarios = {
    u_admin: { nome: 'Carlos Andrade', email: login('admin'), senha: '123456', papel: 'admin', ativo: true, criadoEm: ts(-300) },
    u_joao: { nome: 'João Pereira', email: login('joao'), senha: '123456', papel: 'funcionario', ativo: true, criadoEm: ts(-250) },
    u_marcos: { nome: 'Marcos Lima', email: login('marcos'), senha: '123456', papel: 'funcionario', ativo: true, criadoEm: ts(-120) },
  };
  const nomeU = id => usuarios[id]?.nome || '';

  const cli = (nome, telefone, endereco, bairro, extra = {}) => ({
    nome, telefone, endereco, bairro, cidade: '', documento: '', email: '', obs: '',
    criadoEm: ts(-entre(30, 280)), atualizadoEm: ts(-entre(1, 29)), criadoPor: 'Carlos Andrade', ...extra,
  });
  const clientes = {
    c1: cli('Maria Aparecida Souza', '(77) 90000-0101', 'Rua das Acácias, 120', 'Centro'),
    c2: cli('José Carlos Santos', '(77) 90000-0102', 'Av. Brasil, 845', 'São José'),
    c3: cli('Ana Paula Ribeiro', '(77) 90000-0103', 'Rua Sete de Setembro, 32', 'Centro', { obs: 'Prefere contato à tarde.' }),
    c4: cli('Pedro Henrique Alves', '(77) 90000-0104', 'Rua do Campo, 77', 'Alto da Boa Vista'),
    c5: cli('Clínica Bem Viver', '(77) 3000-0105', 'Praça da Matriz, 10, sala 2', 'Centro', { documento: '12.345.678/0001-90' }),
    c6: cli('Restaurante Sabor da Terra', '(77) 90000-0106', 'Rodovia BA, km 3', 'Distrito Industrial'),
    c7: cli('Fernanda Oliveira', '(77) 90000-0107', 'Rua Nova, 210', 'Jardim Primavera'),
    c8: cli('Antônio Gomes', '(77) 90000-0108', 'Travessa da Igreja, 5', 'Centro', { obs: 'Cliente antigo, paga sempre em dinheiro.' }),
    c9: cli('Padaria Pão Quente', '(77) 90000-0109', 'Rua Principal, 400', 'São José'),
  };

  const prod = (nome, categoria, unidade, quantidade, estoqueMinimo, custo, preco, fornecedor = '') => ({
    nome, categoria, unidade, quantidade, estoqueMinimo, custo, preco, fornecedor, obs: '',
    criadoEm: ts(-entre(100, 300)), atualizadoEm: ts(-entre(0, 20)),
  });
  const produtos = {
    p1: prod('Vidro temperado 8mm incolor', 'Vidro', 'm²', 14.5, 5, 180, 320, 'Têmpera Regional'),
    p2: prod('Vidro temperado 8mm fumê', 'Vidro', 'm²', 6, 4, 210, 360, 'Têmpera Regional'),
    p3: prod('Vidro temperado 10mm incolor', 'Vidro', 'm²', 3.2, 4, 240, 420, 'Têmpera Regional'),
    p4: prod('Vidro comum 4mm incolor', 'Vidro', 'm²', 22, 8, 45, 110, 'Distribuidora Cristal'),
    p5: prod('Espelho 4mm prata', 'Espelho', 'm²', 9, 5, 85, 220, 'Distribuidora Cristal'),
    p6: prod('Vidro laminado 8mm incolor', 'Vidro', 'm²', 0, 2, 260, 480, 'Têmpera Regional'),
    p7: prod('Kit box de correr (alumínio branco)', 'Kit / ferragem', 'jogo', 7, 3, 95, 190, 'Alumínios Bahia'),
    p8: prod('Perfil U de alumínio 6m', 'Perfil de alumínio', 'barra', 18, 10, 32, 65, 'Alumínios Bahia'),
    p9: prod('Puxador inox 30cm', 'Acessório', 'un', 12, 4, 28, 60),
    p10: prod('Fechadura para porta de vidro', 'Kit / ferragem', 'un', 2, 3, 70, 140),
    p11: prod('Silicone incolor 280g', 'Vedação / silicone', 'tubo', 15, 10, 14, 28),
    p12: prod('Silicone preto 280g', 'Vedação / silicone', 'tubo', 4, 6, 15, 30),
    p13: prod('Dobradiça para porta de vidro', 'Kit / ferragem', 'par', 10, 4, 40, 85),
    p14: prod('Fita dupla face para espelho', 'Fixação', 'rolo', 6, 2, 22, 45),
    p15: prod('Parafuso 4,2 × 32 (caixa com 100)', 'Fixação', 'cx', 8, 3, 12, 25),
    p16: prod('Perfil de janela de correr', 'Perfil de alumínio', 'm', 40, 20, 18, 38, 'Alumínios Bahia'),
  };
  const p = id => ({ produtoId: id, descricao: produtos[id].nome });

  // ------------------------------------------------ serviços
  const servicos = {};
  const lancamentos = {};
  let nLanc = 0;

  function pagar(sid, s, valor, diasAtras, forma, usuarioId = 'u_admin') {
    const id = `l_s${++nLanc}`;
    const data = dia(-diasAtras);
    lancamentos[id] = {
      tipo: 'receita', categoria: 'Serviços', descricao: `Pagamento da OS ${String(s.numero).padStart(4, '0')} (${s.clienteNome})`,
      valor, data, vencimento: data, status: 'pago', forma, servicoId: sid, clienteId: s.clienteId, clienteNome: s.clienteNome,
      obs: '', criadoEm: ts(-diasAtras, 16), criadoPor: nomeU(usuarioId),
    };
    s.pagamentos.push({ id, valor, data, forma, obs: '', usuarioNome: nomeU(usuarioId) });
  }

  function servico(sid, o) {
    const c = clientes[o.cliente];
    const itens = (o.itens || []).map(calcularItem);
    const { total } = totaisServico({ itens, maoDeObra: o.maoDeObra, desconto: o.desconto });
    const criado = o.criado ?? -10;
    const s = {
      numero: o.numero, clienteId: o.cliente, clienteNome: c.nome, clienteTelefone: c.telefone,
      endereco: `${c.endereco}, ${c.bairro}`, tipo: o.tipo, descricao: o.descricao,
      itens, maoDeObra: o.maoDeObra || 0, desconto: o.desconto || 0, valorTotal: total,
      prioridade: o.urgente ? 'urgente' : 'normal', dataPrevista: o.prevista === undefined ? '' : dia(o.prevista),
      responsavelId: o.resp || '', responsavelNome: nomeU(o.resp), status: o.status, obs: o.obs || '',
      formaCombinada: o.forma || '', pagamentos: [], estoqueBaixado: !!o.baixado,
      historico: [{ data: ts(criado, 10), status: 'orcamento', obs: 'Serviço criado', usuarioId: 'u_admin', usuarioNome: nomeU('u_admin') }],
      criadoEm: ts(criado, 10), atualizadoEm: ts(o.mexido ?? -1, 15), criadoPor: nomeU('u_admin'),
    };
    const caminho = ['aprovado', 'aguardando', 'producao', 'pronto', 'concluido'];
    const alvo = caminho.indexOf(o.status);
    if (o.status === 'cancelado') {
      s.historico.push({ data: ts(criado + 2, 11), status: 'cancelado', obs: o.motivo || 'Cliente desistiu', usuarioId: 'u_admin', usuarioNome: nomeU('u_admin') });
    } else if (alvo >= 0) {
      let d = criado;
      for (let i = 0; i <= alvo; i++) {
        if (caminho[i] === 'aguardando' && o.status !== 'aguardando') continue;
        d = Math.min(d + 1 + (i % 2), o.mexido ?? -1);
        s.historico.push({ data: ts(d, 9 + i), status: caminho[i], obs: '', usuarioId: o.resp || 'u_admin', usuarioNome: nomeU(o.resp || 'u_admin') });
      }
      if (o.status === 'concluido') s.concluidoEm = ts(o.mexido ?? -1, 17);
      s.aprovadoEm = s.historico[1]?.data || '';
    }
    if (o.nota) s.historico.push({ data: ts(o.mexido ?? -1, 16), status: o.status, obs: o.nota, nota: true, usuarioId: o.resp || 'u_admin', usuarioNome: nomeU(o.resp || 'u_admin') });
    servicos[sid] = s;
    for (const [valor, diasAtras, forma] of (o.pagos || [])) pagar(sid, s, valor === 'total' ? arred(total - s.pagamentos.reduce((t, x) => t + x.valor, 0)) : valor, diasAtras, forma, o.resp || 'u_admin');
    return s;
  }

  servico('s127', { numero: 127, cliente: 'c4', tipo: 'Janela', status: 'cancelado', criado: -40, mexido: -38,
    descricao: 'Janela de correr 2 folhas para o quarto', motivo: 'Cliente fechou com outra empresa',
    itens: [{ ...p('p4'), modo: 'm2', larg: 120, alt: 100, qtd: 2, preco: 110 }], maoDeObra: 120 });

  servico('s128', { numero: 128, cliente: 'c8', tipo: 'Troca de vidro', status: 'concluido', criado: -32, mexido: -29, resp: 'u_joao', baixado: true,
    descricao: 'Troca de 3 vidros quebrados da janela da cozinha', prevista: -29,
    itens: [{ ...p('p4'), modo: 'm2', larg: 50, alt: 60, qtd: 3, preco: 110 }], maoDeObra: 60, pagos: [['total', 29, 'Dinheiro']] });

  servico('s129', { numero: 129, cliente: 'c1', tipo: 'Box de banheiro', status: 'concluido', criado: -26, mexido: -18, resp: 'u_joao', baixado: true,
    descricao: 'Box frontal de correr, 8mm incolor, banheiro social', prevista: -18, forma: 'PIX, metade na aprovação',
    itens: [{ ...p('p1'), modo: 'm2', larg: 120, alt: 190, qtd: 1, preco: 320 }, { ...p('p7'), modo: 'un', qtd: 1, preco: 190 }],
    maoDeObra: 150, pagos: [[500, 24, 'PIX'], ['total', 18, 'PIX']] });

  servico('s130', { numero: 130, cliente: 'c6', tipo: 'Tampo / mesa', status: 'concluido', criado: -20, mexido: -9, resp: 'u_marcos', baixado: true,
    descricao: '6 tampos de mesa 8mm incolor com acabamento lapidado', prevista: -9, forma: 'Entrada + restante em 30 dias',
    itens: [{ ...p('p1'), modo: 'm2', larg: 80, alt: 80, qtd: 6, preco: 320 }], maoDeObra: 0, desconto: 88.8,
    pagos: [[600, 18, 'PIX']] });

  servico('s131', { numero: 131, cliente: 'c3', tipo: 'Espelho', status: 'pronto', criado: -9, mexido: -2, resp: 'u_joao', prevista: -1, baixado: true,
    descricao: 'Espelho 4mm bisotado para a parede da sala', forma: '50% na aprovação, 50% na instalação',
    itens: [{ ...p('p5'), modo: 'm2', larg: 150, alt: 100, qtd: 1, preco: 220 }, { ...p('p14'), modo: 'un', qtd: 1, preco: 45 }],
    maoDeObra: 80, pagos: [[200, 8, 'PIX']] });

  servico('s132', { numero: 132, cliente: 'c2', tipo: 'Box de banheiro', status: 'producao', criado: -6, mexido: -1, resp: 'u_marcos', prevista: 1, urgente: true, baixado: true,
    descricao: 'Box de canto 8mm fumê, suíte', nota: 'Cliente pediu para instalar antes do fim de semana.',
    itens: [{ ...p('p2'), modo: 'm2', larg: 90, alt: 190, qtd: 2, preco: 360 }, { ...p('p7'), modo: 'un', qtd: 1, preco: 190 }, { ...p('p11'), modo: 'un', qtd: 2, preco: 28 }],
    maoDeObra: 180, pagos: [[700, 5, 'Cartão de crédito']] });

  servico('s133', { numero: 133, cliente: 'c5', tipo: 'Divisória', status: 'producao', criado: -8, mexido: -2, resp: 'u_joao', prevista: 3,
    descricao: 'Divisória em vidro temperado 10mm para a recepção, com porta de giro',
    itens: [{ ...p('p3'), modo: 'm2', larg: 300, alt: 220, qtd: 1, preco: 420 }, { ...p('p13'), modo: 'un', qtd: 2, preco: 85 }, { ...p('p9'), modo: 'un', qtd: 1, preco: 60 }],
    maoDeObra: 400, forma: 'Boleto 30/60', pagos: [[1500, 7, 'Transferência']] });

  servico('s134', { numero: 134, cliente: 'c9', tipo: 'Porta', status: 'aguardando', criado: -5, mexido: -3, resp: 'u_marcos', prevista: 5,
    descricao: 'Porta de vidro temperado 10mm com fechadura, entrada da loja', nota: 'Vidro encomendado na têmpera, chega na quinta.',
    itens: [{ ...p('p3'), modo: 'm2', larg: 90, alt: 210, qtd: 1, preco: 420 }, { ...p('p10'), modo: 'un', qtd: 1, preco: 140 }, { ...p('p13'), modo: 'un', qtd: 1, preco: 85 }],
    maoDeObra: 200, pagos: [[500, 4, 'PIX']] });

  servico('s135', { numero: 135, cliente: 'c7', tipo: 'Janela', status: 'aprovado', criado: -4, mexido: -2, prevista: 6,
    descricao: 'Janela de correr 4 folhas para a sala, vidro 4mm incolor',
    itens: [{ ...p('p4'), modo: 'm2', larg: 200, alt: 120, qtd: 1, preco: 110 }, { ...p('p16'), modo: 'm', larg: 200, qtd: 4, preco: 38 }],
    maoDeObra: 220 });

  servico('s136', { numero: 136, cliente: 'c4', tipo: 'Box de banheiro', status: 'aprovado', criado: -3, mexido: -1, prevista: 2, urgente: true,
    descricao: 'Box frontal 8mm incolor, banheiro do térreo',
    itens: [{ ...p('p1'), modo: 'm2', larg: 110, alt: 190, qtd: 1, preco: 320 }, { ...p('p7'), modo: 'un', qtd: 1, preco: 190 }],
    maoDeObra: 150, pagos: [[300, 1, 'Dinheiro']] });

  servico('s137', { numero: 137, cliente: 'c8', tipo: 'Espelho', status: 'orcamento', criado: -3, mexido: -3,
    descricao: 'Espelho para o banheiro com fita dupla face',
    itens: [{ ...p('p5'), modo: 'm2', larg: 60, alt: 80, qtd: 1, preco: 220 }, { ...p('p14'), modo: 'un', qtd: 1, preco: 45 }], maoDeObra: 40 });

  servico('s138', { numero: 138, cliente: 'c6', tipo: 'Guarda-corpo', status: 'orcamento', criado: -2, mexido: -2,
    descricao: 'Guarda-corpo em vidro laminado 8mm para a varanda do restaurante',
    itens: [{ ...p('p6'), modo: 'm2', larg: 600, alt: 110, qtd: 1, preco: 480 }], maoDeObra: 900 });

  servico('s139', { numero: 139, cliente: 'c1', tipo: 'Tampo / mesa', status: 'orcamento', criado: 0, mexido: 0,
    descricao: 'Tampo de vidro 8mm para mesa de jantar redonda',
    itens: [{ descricao: 'Tampo redondo 8mm incolor, lapidado', modo: 'un', qtd: 1, preco: 380 }], maoDeObra: 0 });

  // ------------------------------------------------ financeiro dos últimos meses
  const [ano, mes] = h.split('-').map(Number);
  const diaHoje = Number(h.slice(8, 10));
  const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const lanc = (tipo, categoria, descricao, valor, data, status, forma, extra = {}) => {
    lancamentos[`l${++nLanc}`] = {
      tipo, categoria, descricao, valor, data, vencimento: data, status, forma, obs: '',
      clienteNome: '', criadoEm: `${data}T12:00:00.000Z`, criadoPor: 'Carlos Andrade', ...extra,
    };
  };

  for (let k = 5; k >= 0; k--) {
    const d = new Date(ano, mes - 1 - k, 1);
    const a = d.getFullYear();
    const m = d.getMonth() + 1;
    const atual = k === 0;
    const ate = atual ? diaHoje : 28;
    const passou = n => !atual || n <= diaHoje;

    // receitas de serviços antigos e vendas de balcão
    // no mês atual, só até hoje (e menos, porque parte já vem dos serviços acima)
    const qtdServ = atual ? Math.round((diaHoje / 28) * 5) : entre(7, 11);
    for (let i = 0; i < qtdServ; i++) {
      const tipos = ['Box', 'Janela', 'Espelho', 'Troca de vidro', 'Porta', 'Tampo'];
      lanc('receita', 'Serviços', `${tipos[entre(0, 5)]} (serviço de ${MESES_CURTOS[m - 1]})`, entre(18, 260) * 10, iso(a, m, entre(1, ate)), 'pago', ['PIX', 'Dinheiro', 'Cartão de crédito'][entre(0, 2)]);
    }
    const qtdBalcao = entre(2, 4);
    for (let i = 0; i < qtdBalcao; i++) {
      const n = entre(1, ate);
      lanc('receita', 'Venda no balcão', ['Corte de vidro avulso', 'Silicone e acessórios', 'Espelho pequeno pronto'][i % 3], entre(4, 22) * 10, iso(a, m, n), 'pago', i % 2 ? 'Dinheiro' : 'PIX');
    }

    // despesas fixas
    const fixas = [
      ['Aluguel', 'Aluguel do galpão', 1200, 5, 'PIX'],
      ['Salários', 'Salários da equipe', 3400, 5, 'Transferência'],
      ['Energia', 'Conta de energia', entre(24, 34) * 10, 12, 'Boleto'],
      ['Internet / telefone', 'Internet e telefone', 99.9, 15, 'Boleto'],
      ['Água', 'Conta de água', entre(6, 9) * 10, 18, 'Boleto'],
    ];
    for (const [cat, desc, valor, d0, forma] of fixas) lanc('despesa', cat, desc, valor, iso(a, m, d0), passou(d0) ? 'pago' : 'pendente', forma);

    // compras de material e combustível
    const dc1 = entre(2, 12);
    const dc2 = entre(14, 27);
    if (passou(dc1)) lanc('despesa', 'Compra de material', 'Vidros da têmpera', entre(120, 300) * 10, iso(a, m, dc1), 'pago', 'Boleto');
    if (passou(dc2)) lanc('despesa', 'Compra de material', 'Perfis e acessórios', entre(50, 150) * 10, iso(a, m, dc2), 'pago', 'PIX');
    else lanc('despesa', 'Compra de material', 'Boleto Alumínios Bahia', entre(60, 120) * 10, iso(a, m, dc2), 'pendente', 'Boleto');
    const dcomb = Math.min(entre(8, 26), ate);
    lanc('despesa', 'Combustível', 'Combustível da caminhonete', entre(28, 45) * 10, iso(a, m, dcomb), 'pago', 'Cartão de débito');
  }

  // uma conta vencida, para aparecer o aviso
  lanc('despesa', 'Ferramentas', 'Disco de corte e lixas', 186.5, dia(-2), 'pendente', 'Boleto');

  // ------------------------------------------------ movimentações recentes
  const movimentos = {};
  let nMov = 0;
  const mov = (pid, tipo, quantidade, motivo, diasAtras, usuarioId, servicoId = '') => {
    const pr = produtos[pid];
    movimentos[`m${++nMov}`] = {
      produtoId: pid, produtoNome: pr.nome, unidade: pr.unidade, tipo, quantidade,
      delta: tipo === 'saida' ? -quantidade : quantidade, motivo, servicoId,
      servicoNumero: servicoId ? servicos[servicoId].numero : null,
      data: ts(-diasAtras, 8 + (nMov % 8), nMov * 7 % 60), usuarioId, usuarioNome: nomeU(usuarioId),
    };
  };
  mov('p1', 'entrada', 20, 'Compra de fornecedor', 12, 'u_admin');
  mov('p11', 'entrada', 24, 'Compra de fornecedor', 12, 'u_admin');
  mov('p1', 'saida', 2.28, 'Uso em serviço', 9, 'u_joao', 's129');
  mov('p5', 'saida', 1.5, 'Uso em serviço', 6, 'u_joao', 's131');
  mov('p2', 'saida', 3.42, 'Uso em serviço', 4, 'u_marcos', 's132');
  mov('p4', 'saida', 0.6, 'Quebra / perda', 3, 'u_joao');
  mov('p12', 'saida', 2, 'Uso em serviço', 1, 'u_marcos', 's133');
  mov('p9', 'entrada', 6, 'Compra de fornecedor', 1, 'u_admin');

  return {
    usuarios,
    clientes,
    produtos,
    servicos,
    lancamentos,
    movimentos,
    sistema: {
      contador: { servicos: 139 },
      empresa: {
        nome: 'Concept Vidros',
        documento: '00.000.000/0001-00',
        telefone: '(77) 3000-0000',
        whatsapp: '(77) 90000-0000',
        endereco: 'Rua do Comércio, 100, Centro',
        cidade: '',
        email: '',
        validadeOrcamento: 7,
        pix: '00.000.000/0001-00',
        condicoes: 'Garantia de 1 ano para a instalação. Vidros temperados com selo de qualidade. O prazo de entrega conta a partir da aprovação e do pagamento da entrada.',
      },
    },
  };
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
