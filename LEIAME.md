# Sistema da Concept Vidros

Sistema web para gerenciar a Concept Vidros pelo computador e pelo celular. Feito só com HTML, CSS e JavaScript (sem framework e sem build). Os dados ficam no Firebase, então o que um funcionário marca no celular aparece na hora no computador do escritório.

## O que tem

- **Fila de serviços**: quadro por etapa (Orçamento → Aprovado → Aguardando material → Em produção → Pronto → Concluído), lista com filtros, número de OS sequencial, prioridade urgente, data prevista com aviso de atraso, responsável, histórico e anotações. No computador dá para arrastar a ficha de uma coluna para outra.
- **Itens com medidas**: cada item é cobrado por m² (largura × altura), por metro ou por unidade. Ligando o item a um produto do estoque, o preço vem sozinho e depois dá para dar baixa no estoque com um clique.
- **Pagamentos por serviço**: entrada, parcelas e saldo. Cada pagamento entra automaticamente no financeiro.
- **Orçamento, recibo e OS em PDF**, com a logo e as cores da Concept Vidros. Funciona igual ao sistema da Junior Motos: o botão **Enviar PDF** abre o menu de compartilhar do celular, e é só escolher o WhatsApp. No computador, o PDF é baixado e a conversa do cliente abre no WhatsApp Web para anexar. Dá também para baixar, imprimir ou mandar o orçamento como texto.
- **WhatsApp**: botão que abre a conversa com o cliente já com a mensagem certa para a etapa (orçamento com os itens e o total, pronto, concluído…).
- **Clientes**: cadastro com busca, histórico de serviços e quanto falta receber de cada um.
- **Estoque**: produtos com mínimo e aviso de estoque baixo, entrada, saída, ajuste por contagem e histórico de movimentações. Na entrada, o administrador pode lançar a compra direto no financeiro.
- **Financeiro** (só administrador): receitas e despesas por mês, contas a receber e a pagar (com aviso de vencidas), contas que se repetem todo mês, gráfico dos últimos 6 meses, despesas por categoria e exportação para planilha.
- **Painel do administrador** e **painel do funcionário**, com permissões diferentes (tabela abaixo).
- **Funciona no PC e no celular**, pode ser instalado na tela inicial como um aplicativo e continua abrindo sem internet com os dados que já tinha carregado.

---

## 1. Testar agora (modo demonstração)

Enquanto o Firebase não estiver configurado, o sistema roda em **modo demonstração**, com dados de exemplo salvos só no seu navegador.

1. Abra a pasta no VS Code.
2. Clique com o botão direito no `index.html` → **Open with Live Server**.
3. Na tela de entrada, clique em **Carlos (Administrador)** ou **João (Funcionário)**. A senha de todos é `123456`.

Para recomeçar do zero: **Configurações → Voltar aos dados de exemplo**.

> Abrir o `index.html` com dois cliques não funciona (o navegador bloqueia os módulos JavaScript). Use sempre o Live Server ou um site publicado.

---

## 2. Ligar o Firebase (para usar de verdade)

É gratuito para o tamanho de uma vidraçaria e não pede cartão de crédito.

1. Acesse <https://console.firebase.google.com> e clique em **Criar projeto**. O Google Analytics pode ficar desligado.
2. No menu da esquerda: **Criação → Authentication → Vamos começar → Método de login → E-mail/senha → Ativar → Salvar**.
3. **Criação → Firestore Database → Criar banco de dados**. Escolha o local `southamerica-east1 (São Paulo)` e o **modo de produção**.
4. Ainda no Firestore, abra a aba **Regras**, apague o que estiver lá, cole todo o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.
5. Clique na engrenagem ao lado de "Visão geral do projeto" → **Configurações do projeto** → em "Seus apps", clique no ícone **`</>`** (Web), dê um nome e registre (não precisa marcar Hosting).
6. Copie os valores que aparecem no `firebaseConfig` e cole no arquivo `js/config.js`, no lugar das aspas vazias.
7. Abra o sistema. Vai aparecer a tela **Primeiro acesso**: crie a conta do dono da vidraçaria com um **e-mail de verdade** (é por ele que se recupera a senha). Quem fizer isso primeiro vira o administrador; depois disso ninguém mais consegue se cadastrar sozinho.
8. Entre em **Equipe → Novo acesso** e crie o login de cada funcionário.

### Login dos funcionários

O funcionário não precisa ter e-mail. Crie o acesso com um usuário simples, como `joao`, e uma senha. Ele entra digitando só `joao` e a senha.
Se ele esquecer a senha: desative o acesso antigo em **Equipe** e crie um novo (ex.: `joao2`). Se o acesso tiver sido criado com um e-mail de verdade, o botão **Senha** manda um link de troca.

---

## 3. Publicar na internet

Qualquer hospedagem de site estático serve. Pelo GitHub Pages:

1. Crie um repositório e envie todos os arquivos desta pasta (o `index.html` precisa ficar na raiz).
2. No repositório: **Settings → Pages → Deploy from a branch → main / (root) → Save**.
3. Em alguns minutos o sistema fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
4. No Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar domínio** → `SEU-USUARIO.github.io`.

Outras opções que funcionam igual: Netlify (arrastar a pasta no site) ou o próprio Firebase Hosting.

## 4. Instalar no celular

- **Android (Chrome)**: abra o endereço → menu ⋮ → **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone (Safari)**: abra o endereço → botão Compartilhar → **Adicionar à Tela de Início**.

O ícone abre o sistema em tela cheia, como um aplicativo.

---

## 5. Quem pode o quê

| | Administrador | Funcionário |
|---|---|---|
| Ver a fila, criar e editar serviços, mudar etapa, anotar | Sim | Sim |
| Pegar um serviço para si | Sim | Sim |
| Registrar pagamento recebido de um serviço | Sim | Sim |
| Excluir serviço, remover pagamento | Sim | Não |
| Cadastrar e editar clientes | Sim | Sim |
| Excluir clientes | Sim | Não |
| Ver estoque, dar entrada e saída | Sim | Sim |
| Ver custo e preço dos produtos, cadastrar, ajustar, excluir | Sim | Não |
| Financeiro, Equipe e Configurações | Sim | Não |

Essas regras valem de verdade no servidor (arquivo `firestore.rules`), não só na tela.
Observação: o Firestore libera ou bloqueia o documento inteiro, então um funcionário que saiba programar conseguiria ler o custo dos produtos fora do sistema. A tela não mostra.

---

## 6. Personalizar

- `js/constantes.js`: tipos de serviço, categorias de produto, unidades, categorias de receita e despesa, formas de pagamento e motivos de entrada/saída.
- `js/config.js`: troque `MEDIDA = "cm"` para `"mm"` se a vidraçaria mede em milímetros.
- `css/style.css`: as cores da marca ficam no começo do arquivo (`:root`): azul-marinho `#0c1f38` e ciano `#0aa7d7`. O modo escuro segue o do celular/computador.
- `img/`: a logo em vetor (`logo.svg`), a versão branca para fundo escuro (`logo-negativo.svg`), o símbolo sozinho e as versões PNG. O PDF usa o `img/logo.png`.
- As fontes (Anton, a mesma letra do nome na logo, e Montserrat) ficam na pasta `fontes/`, então o sistema não depende do Google Fonts e abre igual sem internet.
- Dados da empresa que saem no orçamento (nome, CNPJ, telefone, PIX, validade, garantia): pela tela **Configurações**.

## 7. Limites do plano gratuito do Firebase

O plano gratuito (Spark) dá 50 mil leituras e 20 mil gravações por dia no Firestore, sem cartão. Para uma vidraçaria pequena com alguns celulares isso sobra. Se um dia passar do limite, o Firebase para de responder até a cota renovar; ninguém é cobrado sem antes cadastrar um cartão.
Cada vez que alguém abre o sistema ele lê os registros (clientes, serviços, produtos…). Se a base ficar muito grande (milhares de serviços), dá para passar a carregar só os serviços dos últimos meses.

## 8. Cópia de segurança

**Configurações → Baixar cópia de segurança** gera um arquivo `.json` com tudo. Faça isso de vez em quando e guarde no computador ou no Drive.

---

## 9. Arquivos

```
index.html              página única do sistema
manifest.webmanifest    nome e ícone do app instalável
sw.js                   deixa abrir sem internet (desligado no Live Server)
firestore.rules         regras de segurança para colar no Firebase
css/style.css           todo o visual (cores no topo)
img/                    logo da Concept Vidros (SVG e PNG)
fontes/                 fontes Anton e Montserrat (com as licenças)
icones/                 ícones do app
js/config.js            ← dados do Firebase e opções
js/constantes.js        ← listas editáveis (tipos, categorias, formas de pagamento)
js/app.js               login, menu e navegação
js/db.js                escolhe entre demonstração e Firebase
js/db-firebase.js       acesso ao Firebase
js/db-demo.js           acesso ao localStorage (modo demonstração)
js/dados-exemplo.js     dados fictícios da demonstração
js/estado.js            dados carregados na memória
js/regras.js            cálculos (m², totais, saldo, atraso, estoque baixo)
js/acoes.js             tudo que grava no banco
js/documento.js         orçamento, recibo e OS em PDF (desenha as páginas e monta o PDF)
js/graficos.js          gráficos do financeiro
js/util.js              formatação, janelas, avisos e ícones
js/telas/*.js           uma tela por arquivo
```

## 10. Problemas comuns

- **Fica parado em "Abrindo…"**: foi aberto direto pelo arquivo. Use o Live Server.
- **"Você não tem permissão para fazer isso"**: as regras do `firestore.rules` não foram publicadas, ou o acesso da pessoa foi desativado.
- **"O login por e-mail e senha não está ativado"**: falta o passo 2 da seção do Firebase.
- **Primeiro acesso dá erro de permissão**: alguém já fez o primeiro acesso nesse projeto, ou as regras não foram publicadas.
- **Sem internet**: o sistema continua mostrando o que já tinha carregado e guarda o que for feito; envia sozinho quando a conexão voltar. Só criar acesso de funcionário e o primeiro acesso precisam de internet.
- **Mudei o código e o celular continua igual**: feche e abra o app de novo. O sistema sempre tenta baixar a versão nova antes de usar a guardada.
