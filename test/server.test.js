import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { createMaps } from '../server/maps.js';
import { openDb } from '../server/db.js';

const config = { dbPath: ':memory:', password: 'segredo', port: 0, host: '127.0.0.1', trustProxy: false, sessionDays: 1, maps: {} };
const fakeMaps = {
  geocode: async a => ({ found: true, lat: -16.7, lon: -49.2, name: a, approx: false }),
  route: async () => ({ meters: 12345, coords: [[1, 1], [2, 2]] }),
  suggest: async q => ({ items: [{ lat: -16.7, lon: -49.2, name: 'Sugestão para ' + q, precise: true }] }),
  reverse: async () => ({ found: true, name: 'Rua do Mapa, Goiânia' })
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
    const sg = await (await fetch(s.base + '/api/suggest?q=rua%20nove', { headers: h })).json();
    assert.equal(sg.items.length, 1);
    assert.deepEqual((await (await fetch(s.base + '/api/suggest?q=ab', { headers: h })).json()).items, []);   // curto demais
    assert.equal((await (await fetch(s.base + '/api/reverse?lat=-16.7&lon=-49.2', { headers: h })).json()).name, 'Rua do Mapa, Goiânia');
    assert.equal((await fetch(s.base + '/api/reverse?lat=x&lon=1', { headers: h })).status, 400);
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

test('maps: sugestões (Photon) só do Brasil, com cache, e reverse', async () => {
  let calls = 0;
  const fake = async url => {
    calls++;
    if (String(url).includes('/reverse')) return { ok: true, json: async () => ({ features: [{ properties: { name: 'Rua A', type: 'street', city: 'Goiânia' }, geometry: { coordinates: [-49.2, -16.7] } }] }) };
    return { ok: true, json: async () => ({ features: [
      { properties: { countrycode: 'AR', name: 'fora' }, geometry: { coordinates: [0, 0] } },
      { properties: { countrycode: 'BR', street: 'Rua Nove', housenumber: '12', district: 'Setor Central', city: 'Goiânia', state: 'Goiás', type: 'house' }, geometry: { coordinates: [-49.25, -16.68] } }] }) };
  };
  const m = createMaps({}, fake);
  const a = await m.suggest('rua nove', { lat: -16.7, lon: -49.2 });
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].name, 'Rua Nove, 12, Setor Central, Goiânia, Goiás');
  assert.equal(a.items[0].precise, true);
  await m.suggest('rua nove', { lat: -16.7, lon: -49.2 });
  assert.equal(calls, 1);   // segunda chamada veio do cache
  assert.equal((await m.reverse(-16.7, -49.2)).name, 'Rua A, Goiânia');
});

test('banco: configurações, rascunho e histórico de orçamentos', () => {
  const db = openDb(':memory:');
  assert.equal(db.getKv('settings'), null);
  db.setKv('settings', { home: 'Rua A', margin: '50' });
  db.setKv('settings', { home: 'Rua B' });   // substitui
  assert.deepEqual(db.getKv('settings'), { home: 'Rua B' });
  const id = db.saveQuote({ client: 'Ana', pickup: 'A', delivery: 'B', price: 120.5, data: { x: 1 } });
  const same = db.saveQuote({ id, client: 'Ana Souza', pickup: 'A', delivery: 'B', price: 130, data: { x: 2 } });
  assert.equal(same, id);   // atualiza, não duplica
  assert.equal(db.listQuotes().length, 1);
  assert.equal(db.listQuotes()[0].client, 'Ana Souza');
  assert.deepEqual(db.getQuote(id).data, { x: 2 });
  assert.equal(db.deleteQuote(id), true);
  assert.equal(db.deleteQuote(id), false);
  db.close();
});

test('API de dados salvos exige login e persiste configurações, rascunho e orçamentos', async () => {
  const s = await start();
  try {
    assert.equal((await fetch(s.base + '/api/state')).status, 401);
    assert.equal((await fetch(s.base + '/api/settings', { method: 'PUT', body: '{}' })).status, 401);
    const h = { Cookie: (await login(s.base, 'segredo')).headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
    assert.deepEqual(await (await fetch(s.base + '/api/state', { headers: h })).json(), { settings: null, draft: null });
    assert.equal((await fetch(s.base + '/api/settings', { method: 'PUT', headers: h, body: JSON.stringify({ home: 'Rua X' }) })).status, 200);
    await fetch(s.base + '/api/draft', { method: 'PUT', headers: h, body: JSON.stringify({ pickup: 'A' }) });
    assert.deepEqual(await (await fetch(s.base + '/api/state', { headers: h })).json(), { settings: { home: 'Rua X' }, draft: { pickup: 'A' } });
    assert.equal((await fetch(s.base + '/api/settings', { method: 'PUT', headers: h, body: '[1]' })).status, 400);   // precisa ser objeto
    assert.equal((await fetch(s.base + '/api/draft', { method: 'PUT', headers: h, body: 'x' })).status, 400);

    const created = await (await fetch(s.base + '/api/quotes', { method: 'POST', headers: h, body: JSON.stringify({ summary: { client: 'Maria', pickup: 'A', delivery: 'B', price: 99 }, data: { mode: 'oneway' } }) })).json();
    const upd = await (await fetch(s.base + `/api/quotes/${created.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ summary: { client: 'Maria', price: 120 }, data: { mode: 'roundtrip' } }) })).json();
    assert.equal(upd.id, created.id);
    const list = await (await fetch(s.base + '/api/quotes', { headers: h })).json();
    assert.equal(list.items.length, 1); assert.equal(list.items[0].price, 120);
    assert.deepEqual((await (await fetch(s.base + `/api/quotes/${created.id}`, { headers: h })).json()).data, { mode: 'roundtrip' });
    assert.equal((await fetch(s.base + `/api/quotes/${created.id}`, { method: 'DELETE', headers: h })).status, 200);
    assert.equal((await fetch(s.base + `/api/quotes/${created.id}`, { headers: h })).status, 404);
  } finally { await s.close(); }
});

test('simulador público: cadastro, endereços, valor e registro no painel', async () => {
  const s = await start();
  try {
    assert.equal((await fetch(s.base + '/simular')).status, 200);
    const post = (path, body, token) => fetch(s.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lead-Token': token || '' }, body: JSON.stringify(body) });
    // sem cadastro não há busca nem simulação
    assert.equal((await fetch(s.base + '/api/public/suggest?q=rua', { headers: { 'X-Lead-Token': 'x' } })).status, 401);
    assert.equal((await post('/api/public/simulate', {}, 'x')).status, 401);
    // validações do cadastro
    assert.equal((await post('/api/public/start', { name: 'Ana', phone: '123', consent: true })).status, 400);
    assert.equal((await post('/api/public/start', { name: 'Ana', phone: '(62) 99999-0000', consent: false })).status, 400);
    // cadastro válido libera o simulador
    const { token } = await (await post('/api/public/start', { name: 'Ana', phone: '(62) 99999-0000', consent: true })).json();
    assert.ok(token.length >= 32);
    const sug = await (await fetch(s.base + '/api/public/suggest?q=rua%20nove', { headers: { 'X-Lead-Token': token } })).json();
    assert.equal(sug.items.length, 1);
    const pt = n => ({ name: n, lat: -16.7, lon: -49.2 });
    assert.equal((await post('/api/public/simulate', { pickup: pt('A'), delivery: pt('B'), mode: 'oneway' }, token)).status, 400);   // sem data nem "sem data"
    const sim = await post('/api/public/simulate', { pickup: pt('Rua A'), delivery: pt('Rua B'), mode: 'roundtrip', noDate: true }, token);
    assert.equal(sim.status, 200);
    const out = await sim.json();
    assert.ok(out.price > 0);
    assert.deepEqual(Object.keys(out).sort(), ['mode', 'phone', 'price']);   // nada de custos nem margem
    // robô (campo invisível) não cria registro
    await post('/api/public/start', { name: 'Robo', phone: '(62) 99999-0000', consent: true, website: 'x' });
    // painel: exige login e mostra a simulação
    assert.equal((await fetch(s.base + '/api/leads')).status, 401);
    const ck = (await login(s.base, 'segredo')).headers.get('set-cookie').split(';')[0];
    const list = await (await fetch(s.base + '/api/leads', { headers: { cookie: ck } })).json();
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].name, 'Ana'); assert.equal(list.items[0].phone, '62999990000'); assert.equal(list.items[0].no_date, 1);
    assert.equal(list.items[0].price, out.price);
    const one = await (await fetch(s.base + '/api/leads/' + list.items[0].id, { headers: { cookie: ck } })).json();
    assert.equal(one.pickup, 'Rua A'); assert.equal(one.mode, 'roundtrip');
    assert.equal((await fetch(s.base + '/api/leads/' + one.id, { method: 'DELETE', headers: { cookie: ck } })).status, 200);
  } finally { await s.close(); }
});
