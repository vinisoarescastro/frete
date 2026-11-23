import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { createMaps } from '../server/maps.js';

const config = { password: 'segredo', port: 0, host: '127.0.0.1', trustProxy: false, sessionDays: 1, maps: {} };
const fakeMaps = {
  geocode: async a => ({ found: true, lat: -16.7, lon: -49.2, name: a, approx: false }),
  route: async () => ({ meters: 12345, coords: [[1, 1], [2, 2]] })
};

test('maps: Nominatim escolhe o resultado mais próximo e OSRM devolve metros', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url: String(url), ua: opts?.headers?.['User-Agent'] });
    if (String(url).includes('nominatim')) return { ok: true, json: async () => [{ lat: '-10', lon: '-10', display_name: 'longe' }, { lat: '-16.7', lon: '-49.2', display_name: 'perto' }] };
    return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 5400, geometry: { coordinates: [[-49.2, -16.7], [-49.3, -16.8]] } }] }) };
  };
  const m = createMaps({ contact: '' }, fake);
  const g = await m.geocode('Rua X', { lat: -16.69, lon: -49.26 });
  assert.equal(g.name, 'perto');
  assert.match(calls[0].ua, /^calculadora-de-fretes/);
  const r = await m.route({ lat: 1, lon: 2 }, { lat: 3, lon: 4 });
  assert.deepEqual(r, { meters: 5400, coords: [[-16.7, -49.2], [-16.8, -49.3]] });
  await assert.rejects(() => m.route({ lat: 999, lon: 0 }, { lat: 0, lon: 0 }), /inválidas/);
});

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
    assert.equal((await fetch(s.base + '/api/geocode?address=x')).status, 401);
    assert.equal((await fetch(s.base + '/login')).status, 200);
    // estilos, fontes e ícones do design system são públicos (a tela de login precisa deles)
    assert.equal((await fetch(s.base + '/assets/css/tokens.css')).status, 200);
    assert.equal((await fetch(s.base + '/assets/icons.svg')).status, 200);
    assert.equal((await fetch(s.base + '/assets/../package.json', { redirect: 'manual' })).status !== 200, true);
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
    const g = await (await fetch(s.base + '/api/geocode?address=Rua%20X', { headers: h })).json();
    assert.equal(g.found, true);
    const r = await fetch(s.base + '/api/route', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: { lat: 1, lon: 1 }, to: { lat: 2, lon: 2 } }) });
    assert.equal((await r.json()).meters, 12345);
    // logout invalida a sessão
    await fetch(s.base + '/logout', { method: 'POST', headers: h, redirect: 'manual' });
    assert.equal((await fetch(s.base + '/api/geocode?address=x', { headers: h })).status, 401);
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


test('maps: com GEOAPIFY_KEY usa o Geoapify e converte geocodificação e rota', async () => {
  const urls = [];
  const fake = async url => {
    urls.push(String(url));
    if (String(url).includes('/geocode/')) return { ok: true, status: 200, json: async () => ({ results: [{ lat: -16.7, lon: -49.2, formatted: 'Rua X, Goiânia', result_type: 'street' }] }) };
    return { ok: true, status: 200, json: async () => ({ features: [{ properties: { distance: 8000 }, geometry: { type: 'MultiLineString', coordinates: [[[-49.2, -16.7], [-49.3, -16.8]], [[-49.3, -16.8], [-49.4, -16.9]]] } }] }) };
  };
  const m = createMaps({ geoapifyKey: 'KEY' }, fake);
  const g = await m.geocode('Rua X, 10, Goiânia', { lat: -16.69, lon: -49.26 });
  assert.equal(g.name, 'Rua X, Goiânia');
  assert.equal(g.approx, true);   // tinha número, mas o resultado é só a rua
  assert.match(urls[0], /apiKey=KEY/); assert.match(urls[0], /bias=proximity/);
  const r = await m.route({ lat: -16.7, lon: -49.2 }, { lat: -16.9, lon: -49.4 });
  assert.equal(r.meters, 8000); assert.equal(r.coords.length, 4); assert.deepEqual(r.coords[0], [-16.7, -49.2]);
  const bad = createMaps({ geoapifyKey: 'KEY' }, async () => ({ ok: false, status: 401 }));
  await assert.rejects(() => bad.geocode('x'), /recusou a chave/);
});

test('maps: se o Nominatim falhar, usa o Photon como reserva; sem nenhum, devolve erro claro', async () => {
  let nominatimCalls = 0;
  const fake = async url => {
    if (String(url).includes('nominatim')) { nominatimCalls++; throw new Error('timeout'); }
    return { ok: true, json: async () => ({ features: [
      { properties: { countrycode: 'AR', name: 'fora' }, geometry: { coordinates: [-58, -34] } },
      { properties: { countrycode: 'BR', name: 'Rua Martins', district: 'Jardim Mariliza', city: 'Goiânia', state: 'Goiás', type: 'street' }, geometry: { coordinates: [-49.2, -16.73] } }] }) };
  };
  const m = createMaps({}, fake);
  const g = await m.geocode('Rua Martins 43, Goiânia', { lat: -16.7, lon: -49.2 });
  assert.equal(g.found, true); assert.equal(g.lat, -16.73); assert.match(g.name, /Rua Martins/); assert.equal(g.approx, true);
  await m.geocode('Rua Martins 43, Goiânia');
  assert.equal(nominatimCalls, 1);   // depois da falha, não tenta o Nominatim de novo por alguns minutos
  const down = createMaps({}, async () => { throw new Error('rede'); });
  await assert.rejects(() => down.geocode('Rua X'), /indisponível/);
});
