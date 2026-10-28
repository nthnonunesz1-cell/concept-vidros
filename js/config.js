// =====================================================================
//  CONFIGURAÇÃO DO SISTEMA DA VIDRAÇARIA
// =====================================================================
//
//  Enquanto "apiKey" estiver vazio, o sistema roda em MODO DEMONSTRAÇÃO:
//  os dados ficam salvos só neste navegador e já vêm com exemplos.
//
//  Para usar de verdade (dados sincronizados entre PC e celulares):
//  1. Crie um projeto em https://console.firebase.google.com
//  2. Authentication > Método de login > ative "E-mail/senha"
//  3. Firestore Database > Criar banco de dados (modo produção)
//  4. Firestore > Regras > cole o conteúdo do arquivo firestore.rules > Publicar
//  5. Configurações do projeto > Seus apps > Web (</>) > copie o firebaseConfig
//     e cole os valores abaixo.
//
//  O passo a passo completo está no arquivo LEIAME.md
// =====================================================================

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const MODO_DEMO = !firebaseConfig.apiKey;

// Funcionário sem e-mail entra só com um "usuário" (ex.: joao).
// Por baixo dos panos o Firebase recebe "joao@vidracaria.example.com".
// O domínio example.com é reservado e nunca recebe e-mails de verdade.
export const DOMINIO_LOGIN = "vidracaria.example.com";

// Unidade em que as medidas são digitadas nos itens do serviço: "cm" ou "mm"
export const MEDIDA = "cm";

// Versão do SDK do Firebase carregada do CDN oficial (gstatic)
export const FIREBASE_VERSAO = "10.12.2";

export const VERSAO = "1.0.0";
