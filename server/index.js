import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createAuth } from './auth.js';
import { createMaps, MapsError } from './maps.js';
import { serveStatic } from './static.js';
import { openDb } from './db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const ASSETS = join(ROOT, 'assets');   // estilos, fontes e ícones do design system: públicos (a tela de login também usa)
const LOGIN_HTML = readFileSync(join(ROOT, 'views', 'login.html'), 'utf8');

// Política de segurança do conteúdo: o app só carrega recursos próprios e as imagens do mapa do OpenStreetMap
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"
].join('; ');

function securityHeaders(res, secure){
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');   // o OSM exige Referer nas imagens do mapa
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function readBody(req, limit = 2048){   // limite maior só para rascunho e orçamentos
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('corpo grande demais'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, ...headers }); res.end(); };
const loginPage = (res, status, msg = '') => {
  const alert = msg ? `<div class="ds-alert ds-alert--danger" role="alert"><span class="ds-alert__icon-wrap"><svg class="icon" width="20" height="20" aria-hidden="true"><use href="/assets/icons.svg#circle-alert"/></svg></span><div class="ds-alert__body"><div class="ds-alert__text">${msg}</div></div></div>` : '';
  const html = LOGIN_HTML.replace('{{MSG}}', alert);
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
};
async function readJson(req, limit){
  let v; try { v = JSON.parse(await readBody(req, limit)); } catch { throw new MapsError('JSON inválido.', 400); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new MapsError('Dados inválidos.', 400);
  return v;
}
const clip = (v, n) => String(v ?? '').slice(0, n);
/** Cria ou atualiza um orçamento a partir do corpo {summary, data}. */
function saveQuote(db, id, body){
  const sm = body.summary || {}, price = Number(sm.price);
  if (!body.data || typeof body.data !== 'object') throw new MapsError('Dados inválidos.', 400);
  return db.saveQuote({ id, client: clip(sm.client, 120), pickup: clip(sm.pickup, 300), delivery: clip(sm.delivery, 300), price: Number.isFinite(price) ? price : 0, data: body.data });
}
const parseNear = url => {
  const [lat, lon] = String(url.searchParams.get('near') || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createApp(config, { maps = createMaps(config.maps), db = openDb(config.dbPath) } = {}){
  const auth = createAuth(config);

  const isSecure = req => !!req.socket.encrypted || (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const clientIp = req => (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';

  async function handle(req, res){
    const secure = isSecure(req);
    securityHeaders(res, secure);
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url, method = req.method;

    if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }

    if (pathname.startsWith('/assets/') && (method === 'GET' || method === 'HEAD')) {
      if (await serveStatic(req, res, ASSETS, pathname.slice('/assets'.length))) return;
      res.writeHead(404); return res.end();
    }

    const token = auth.tokenFrom(req), authed = auth.valid(token);

    if (pathname === '/login') {
      if (method === 'GET') return authed ? redirect(res, '/') : loginPage(res, 200);
      if (method === 'POST') {
        const ip = clientIp(req);
        if (auth.isLocked(ip)) return loginPage(res, 429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
        const pw = new URLSearchParams(await readBody(req)).get('password') || '';
        if (auth.check(pw)) {
          auth.clearFails(ip);
          return redirect(res, '/', { 'Set-Cookie': auth.cookie(auth.create(), { secure }) });
        }
        auth.fail(ip);
        await sleep(400);
        return loginPage(res, 401, 'Senha incorreta.');
      }
      res.writeHead(405, { Allow: 'GET, POST' }); return res.end();
    }

    if (pathname === '/logout' && method === 'POST') {
      auth.destroy(token);
      return redirect(res, '/login', { 'Set-Cookie': auth.clearCookie({ secure }) });
    }

    // Tudo abaixo exige login
    if (!authed) {
      if (pathname.startsWith('/api/')) return json(res, 401, { error: 'não autenticado' });
      return redirect(res, '/login');
    }

    if (pathname === '/api/geocode' && method === 'GET') {
      return json(res, 200, await maps.geocode(url.searchParams.get('address'), parseNear(url)));
    }
    // ---- Dados salvos (SQLite) ----
    if (pathname === '/api/state' && method === 'GET') return json(res, 200, { settings: db.getKv('settings'), draft: db.getKv('draft') });
    if ((pathname === '/api/settings' || pathname === '/api/draft') && method === 'PUT') {
      const body = await readJson(req, 64 * 1024);
      db.setKv(pathname.slice('/api/'.length), body);
      return json(res, 200, { ok: true });
    }
    if (pathname === '/api/quotes' && method === 'GET') return json(res, 200, { items: db.listQuotes(url.searchParams.get('limit')) });
    if (pathname === '/api/quotes' && method === 'POST') return json(res, 200, { id: saveQuote(db, null, await readJson(req, 64 * 1024)) });
    const qm = pathname.match(/^\/api\/quotes\/(\d+)$/);
    if (qm) {
      const id = Number(qm[1]);
      if (method === 'GET') { const r = db.getQuote(id); return r ? json(res, 200, r) : json(res, 404, { error: 'não encontrado' }); }
      if (method === 'PUT') return json(res, 200, { id: saveQuote(db, id, await readJson(req, 64 * 1024)) });
      if (method === 'DELETE') return json(res, db.deleteQuote(id) ? 200 : 404, { ok: true });
    }

    if (pathname === '/api/suggest' && method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 200);
      if (q.length < 3) return json(res, 200, { items: [] });
      return json(res, 200, await maps.suggest(q, parseNear(url)));
    }
    if (pathname === '/api/reverse' && method === 'GET') {
      const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new MapsError('Coordenadas inválidas.', 400);
      return json(res, 200, await maps.reverse(lat, lon));
    }
    if (pathname === '/api/route' && method === 'POST') {
      let body; try { body = JSON.parse(await readBody(req)); } catch { throw new MapsError('JSON inválido.', 400); }
      return json(res, 200, await maps.route(body.from, body.to));
    }
    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'não encontrado' });

    if (method !== 'GET' && method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    if (await serveStatic(req, res, PUBLIC, pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado');
  }

  return createServer(async (req, res) => {
    try { await handle(req, res); }
    catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (res.headersSent) return res.destroy();
      json(res, status, { error: status >= 500 && !(e instanceof MapsError) ? 'erro interno' : e.message });
    }
  });
}

// Inicia o servidor quando executado diretamente (node server/index.js)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let config;
  try { config = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }
  console.log('Busca e rotas via ' + (config.maps.geoapifyKey ? 'Geoapify' : 'OpenStreetMap (sem chave)'));
  createApp(config).listen(config.port, config.host, () => console.log(`Calculadora de Fretes em http://${config.host}:${config.port}`));
}
