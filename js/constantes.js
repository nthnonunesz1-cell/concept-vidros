// Listas fixas usadas no sistema. Pode editar à vontade para adaptar à vidraçaria.

// Etapas do serviço, na ordem do fluxo
export const STATUS = [
  { id: 'orcamento',  nome: 'Orçamento',            curto: 'Orçamento' },
  { id: 'aprovado',   nome: 'Aprovado',             curto: 'Aprovado' },
  { id: 'aguardando', nome: 'Aguardando material',  curto: 'Aguardando' },
  { id: 'producao',   nome: 'Em produção',          curto: 'Produção' },
  { id: 'pronto',     nome: 'Pronto p/ entrega',    curto: 'Pronto' },
  { id: 'concluido',  nome: 'Concluído',            curto: 'Concluído' },
  { id: 'cancelado',  nome: 'Cancelado',            curto: 'Cancelado' },
];

// Colunas do quadro (fila)
export const STATUS_FILA = ['orcamento', 'aprovado', 'aguardando', 'producao', 'pronto'];

// Serviços que já foram fechados com o cliente e ainda não terminaram
export const STATUS_EM_ANDAMENTO = ['aprovado', 'aguardando', 'producao', 'pronto'];

// Para onde o botão "avançar" leva cada etapa
export const PROXIMO_STATUS = {
  orcamento: 'aprovado',
  aprovado: 'producao',
  aguardando: 'producao',
  producao: 'pronto',
  pronto: 'concluido',
};

// Texto do botão de avançar, de acordo com a próxima etapa
export const ROTULO_AVANCAR = {
  aprovado: 'Aprovar',
  producao: 'Iniciar produção',
  pronto: 'Marcar pronto',
  concluido: 'Concluir',
};

export function statusInfo(id) {
  return STATUS.find(s => s.id === id) || STATUS[0];
}

export const TIPOS_SERVICO = [
  'Box de banheiro',
  'Janela',
  'Porta',
  'Espelho',
  'Tampo / mesa',
  'Divisória',
  'Fachada / vitrine',
  'Guarda-corpo',
  'Cobertura',
  'Troca de vidro',
  'Manutenção / conserto',
  'Outro',
];

export const CATEGORIAS_PRODUTO = [
  'Vidro',
  'Espelho',
  'Perfil de alumínio',
  'Kit / ferragem',
  'Acessório',
  'Vedação / silicone',
  'Fixação',
  'Consumível',
  'Outros',
];

export const UNIDADES = ['m²', 'm', 'un', 'barra', 'chapa', 'jogo', 'par', 'tubo', 'rolo', 'cx', 'kg'];

export const CATEGORIAS_RECEITA = ['Serviços', 'Venda no balcão', 'Outras receitas'];

export const CATEGORIAS_DESPESA = [
  'Compra de material',
  'Aluguel',
  'Energia',
  'Água',
  'Internet / telefone',
  'Salários',
  'Combustível',
  'Manutenção',
  'Ferramentas',
  'Impostos / taxas',
  'Outras despesas',
];

export const FORMAS_PAGAMENTO = ['PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência', 'Cheque'];

export const MOTIVOS_ENTRADA = ['Compra de fornecedor', 'Devolução de obra', 'Sobra reaproveitada'];
export const MOTIVOS_SAIDA = ['Uso em serviço', 'Venda no balcão', 'Quebra / perda', 'Amostra'];
