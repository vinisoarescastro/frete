import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { decodePolyline } from '../public/js/polyline.js';

const config = { password: 'segredo', port: 0, host: '127.0.0.1', trustProxy: false, sessionDays: 1, maps: { browserKey: 'BK', serverKey: 'SK', mapId: 'M' } };
const fakeMaps = {
  geocode: async a => ({ found: true, lat: -16.7, lon: -49.2, name: a, approx: false }),
  route: async () => ({ meters: 12345, polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' })
};

async function start(){
  const server = createApp(config, { maps: fakeMaps });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise(r => { server.closeAllConnections(); server.close(r); }) };
}
const login = (base, password) => fetch(base + '/login', {
  method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password })
});

test('sem login: páginas redirecionam e API devolve 401', async () => {
  const s = await start();
  try {
    const page = await fetch(s.base + '/', { redirect: 'manual' });
    assert.equal(page.status, 303); assert.equal(page.headers.get('location'), '/login');
    assert.equal((await fetch(s.base + '/js/main.js', { redirect: 'manual' })).status, 303);
    assert.equal((await fetch(s.base + '/api/config')).status, 401);
    assert.equal((await fetch(s.base + '/login')).status, 200);
  } finally { await s.close(); }
});

test('senha errada é recusada; certa libera o acesso, com cookie HttpOnly', async () => {
  const s = await start();
  try {
    assert.equal((await login(s.base, 'errada')).status, 401);
    const ok = await login(s.base, 'segredo');
    assert.equal(ok.status, 303);
    const cookie = ok.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    const h = { Cookie: cookie.split(';')[0] };
    const home = await fetch(s.base + '/', { headers: h });
    assert.equal(home.status, 200); assert.match(await home.text(), /Calculadora de Fretes/);
    assert.deepEqual(await (await fetch(s.base + '/api/config', { headers: h })).json(), { mapsKey: 'BK', mapId: 'M' });
    const g = await (await fetch(s.base + '/api/geocode?address=Rua%20X', { headers: h })).json();
    assert.equal(g.found, true);
    const r = await fetch(s.base + '/api/route', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: { lat: 1, lon: 1 }, to: { lat: 2, lon: 2 } }) });
    assert.equal((await r.json()).meters, 12345);
    // logout invalida a sessão
    await fetch(s.base + '/logout', { method: 'POST', headers: h, redirect: 'manual' });
    assert.equal((await fetch(s.base + '/api/config', { headers: h })).status, 401);
  } finally { await s.close(); }
});

test('bloqueia após 5 senhas erradas', async () => {
  const s = await start();
  try {
    for (let i = 0; i < 5; i++) await login(s.base, 'x');
    assert.equal((await login(s.base, 'segredo')).status, 429);
  } finally { await s.close(); }
});

test('não permite sair da pasta public (path traversal)', async () => {
  const s = await start();
  try {
    const cookie = (await login(s.base, 'segredo')).headers.get('set-cookie').split(';')[0];
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fserver/index.js']) {
      const res = await fetch(s.base + p, { headers: { Cookie: cookie } });
      assert.equal(res.status, 404, p);
    }
  } finally { await s.close(); }
});

test('decodePolyline decodifica o exemplo oficial do Google', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(pts, [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);
});
