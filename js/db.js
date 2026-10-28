// Escolhe o banco de dados: demonstração (localStorage) ou Firebase.
import { MODO_DEMO } from './config.js';

let modulo;
let erro = null;
try {
  modulo = MODO_DEMO ? await import('./db-demo.js') : await import('./db-firebase.js');
} catch (e) {
  console.error('Falha ao carregar o banco de dados', e);
  erro = e;
  modulo = { db: null };
}

export const db = modulo.db;
export const erroCarga = erro;
