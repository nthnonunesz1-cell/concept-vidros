// Service worker: deixa o app instalável e abre mesmo sem internet.
// Estratégia "rede primeiro": sempre tenta baixar a versão nova; se não tiver
// internet, usa a última cópia guardada. Assim nunca fica preso numa versão velha.
const CACHE = 'concept-vidros-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesmoSite = url.origin === self.location.origin;
  const cdn = url.hostname === 'www.gstatic.com'; // SDK do Firebase
  if (!mesmoSite && !cdn) return; // Firestore e login passam direto

  e.respondWith((async () => {
    try {
      const resp = await fetch(req);
      if (resp.ok || resp.type === 'opaque') {
        const copia = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      }
      return resp;
    } catch (erro) {
      const guardado = await caches.match(req);
      if (guardado) return guardado;
      if (req.mode === 'navigate') {
        const inicio = await caches.match('./index.html') || await caches.match('./');
        if (inicio) return inicio;
      }
      throw erro;
    }
  })());
});
