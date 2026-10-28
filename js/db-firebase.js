// Banco de dados real: Firebase Authentication + Cloud Firestore.
// Mesmas funções do db-demo.js.
import { firebaseConfig, FIREBASE_VERSAO } from './config.js';
import { erroCom } from './util.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSAO}`;

const { initializeApp, deleteApp } = await import(`${CDN}/firebase-app.js`);
const {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, initializeAuth, inMemoryPersistence,
} = await import(`${CDN}/firebase-auth.js`);
const {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc,
  writeBatch, runTransaction, increment, arrayUnion, query, orderBy, limit,
} = await import(`${CDN}/firebase-firestore.js`);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Cache local: o app abre e mostra os dados mesmo sem internet;
// o que for feito offline é enviado quando a conexão voltar.
let fs;
try {
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  console.warn('Cache offline indisponível, usando memória', e);
  fs = initializeFirestore(app, { localCache: memoryLocalCache() });
}

const ref = (c, id) => doc(fs, c, id);

// O Firestore não aceita campos "undefined"; remove antes de gravar
function limparValor(v) {
  if (Array.isArray(v)) return v.map(limparValor);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const r = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) r[k] = limparValor(x);
    return r;
  }
  return v;
}

// O "id" do documento não é gravado como campo
function limpo(dados) {
  const { id, ...resto } = dados || {};
  return limparValor(resto);
}

// Sem internet, a gravação fica na fila e a promessa só termina quando sincronizar.
// Para a tela não travar, depois de alguns segundos seguimos em frente.
function gravar(promessa) {
  return new Promise((ok, falha) => {
    let pronto = false;
    const t = setTimeout(() => {
      if (!pronto) { pronto = true; ok({ pendente: true }); }
    }, 2500);
    promessa.then(
      r => { if (!pronto) { pronto = true; clearTimeout(t); ok(r); } },
      e => {
        clearTimeout(t);
        if (!pronto) { pronto = true; falha(e); }
        else db.aoErro?.(e);
      },
    );
  });
}

function comTempo(promessa, ms) {
  return Promise.race([promessa, new Promise((_, f) => setTimeout(() => f(erroCom('unavailable')), ms))]);
}

export const db = {
  demo: false,
  aoErro: null,

  // ---------- acesso
  aoMudarSessao(cb) {
    return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null));
  },

  async entrar(email, senha) {
    await signInWithEmailAndPassword(auth, email, senha);
  },

  async sair() {
    await signOut(auth);
  },

  // Cria o login de um funcionário sem deslogar o administrador
  // (usa uma segunda instância do Firebase só para isso).
  async criarLogin(email, senha) {
    const secundario = initializeApp(firebaseConfig, 'cadastro-' + Date.now());
    try {
      const auth2 = initializeAuth(secundario, { persistence: inMemoryPersistence });
      const cred = await createUserWithEmailAndPassword(auth2, email, senha);
      await signOut(auth2);
      return cred.user.uid;
    } finally {
      deleteApp(secundario).catch(() => {});
    }
  },

  async enviarRedefinicao(email) {
    await sendPasswordResetEmail(auth, email);
  },

  async trocarSenha(atual, nova) {
    const u = auth.currentUser;
    if (!u) throw erroCom('auth/requires-recent-login');
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, atual));
    } catch (e) {
      if (e.code === 'auth/too-many-requests' || e.code === 'auth/network-request-failed') throw e;
      throw erroCom('auth/invalid-credential', 'Senha atual incorreta.');
    }
    await updatePassword(u, nova);
  },

  async sistemaInstalado() {
    try {
      const d = await comTempo(getDoc(ref('sistema', 'instalacao')), 8000);
      return d.exists();
    } catch (e) {
      console.warn('Não foi possível verificar a instalação', e);
      return true; // na dúvida, mostra a tela de login
    }
  },

  // Primeiro acesso: cria o administrador e trava a instalação
  async instalar({ nome, email, senha, empresa }) {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    const uid = cred.user.uid;
    const quando = new Date().toISOString();
    try {
      const b = writeBatch(fs);
      b.set(ref('usuarios', uid), { nome, email, papel: 'admin', ativo: true, criadoEm: quando });
      b.set(ref('sistema', 'instalacao'), { criadoEm: quando, por: uid });
      await b.commit();
      await setDoc(ref('sistema', 'empresa'), { nome: empresa }, { merge: true });
    } catch (e) {
      await cred.user.delete().catch(() => {});
      throw e;
    }
    return { uid, email };
  },

  // ---------- dados
  novoId(c) { return doc(collection(fs, c)).id; },
  inc(n) { return increment(n); },
  unir(...itens) { return arrayUnion(...itens.map(limparValor)); },

  ouvir(c, cb, op = {}) {
    let q = collection(fs, c);
    const partes = [];
    if (op.ordem) partes.push(orderBy(op.ordem, op.desc ? 'desc' : 'asc'));
    if (op.limite) partes.push(limit(op.limite));
    if (partes.length) q = query(q, ...partes);
    return onSnapshot(q,
      snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      e => { console.error(`Erro ao ouvir "${c}"`, e); op.erro?.(e); });
  },

  ouvirDoc(c, id, cb, aoErro) {
    return onSnapshot(ref(c, id),
      d => cb(d.exists() ? { ...d.data(), id: d.id } : null),
      e => { console.error(`Erro ao ouvir "${c}/${id}"`, e); aoErro?.(e); });
  },

  async obter(c, id) {
    const d = await getDoc(ref(c, id));
    return d.exists() ? { ...d.data(), id: d.id } : null;
  },

  async adicionar(c, dados) {
    const r = doc(collection(fs, c));
    await gravar(setDoc(r, limpo(dados)));
    return r.id;
  },

  async definir(c, id, dados, { mesclar = false } = {}) {
    await gravar(setDoc(ref(c, id), limpo(dados), { merge: mesclar }));
  },

  async atualizar(c, id, dados) {
    await gravar(updateDoc(ref(c, id), limpo(dados)));
  },

  async remover(c, id) {
    await gravar(deleteDoc(ref(c, id)));
  },

  async lote(ops) {
    const b = writeBatch(fs);
    for (const op of ops) {
      const r = ref(op.col, op.id);
      if (op.tipo === 'delete') b.delete(r);
      else if (op.tipo === 'update') b.update(r, limpo(op.dados));
      else b.set(r, limpo(op.dados), { merge: !!op.mesclar });
    }
    await gravar(b.commit());
  },

  // Número sequencial da OS. Retorna null se estiver sem internet
  // (aí quem chamou usa o maior número conhecido + 1).
  async proximoNumero(chave) {
    const r = ref('sistema', 'contador');
    try {
      return await comTempo(runTransaction(fs, async tx => {
        const d = await tx.get(r);
        const n = ((d.exists() && d.data()[chave]) || 0) + 1;
        tx.set(r, { [chave]: n }, { merge: true });
        return n;
      }), 7000);
    } catch (e) {
      console.warn('Sem conexão para gerar o número da OS', e);
      return null;
    }
  },
};
