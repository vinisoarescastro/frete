'use strict';
/* Pontos no mapa (coleta, entrega, destino final) e rotas calculadas automaticamente. */
import { S, Q, app, update } from './state.js';
import { $, esc, icon, lsGet, lsSet } from './utils.js';
import { drawMap } from './map.js';

const KEY_HOME = 'frete.homept.v1';
const TEXT_KEY = { pickup: 'pickup', delivery: 'delivery', final: 'finalAddr' };

export async function api(path, options){
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  if (res.status === 401) { location.href = '/login'; throw new Error('sessão expirada'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'HTTP ' + res.status);
  return body;
}

/* ---------- Busca de um endereço digitado, sem escolher sugestão ---------- */

// "Cidade - GO" vira "Cidade, GO"; sem cidade/UF, usa a cidade da residência
function normalizeAddr(addr){
  let a = addr.trim().replace(/\s+-\s+([A-Za-z]{2})\s*$/, ', $1').replace(/\s+/g, ' ');
  if (!/,\s*[A-Za-z]{2}\s*$/.test(a)) {
    const hp = S.home.trim().replace(/\s+-\s+([A-Za-z]{2})\s*$/, ', $1').split(',');
    if (hp.length >= 2) a += ', ' + hp.slice(-2).map(x => x.trim()).join(', ');
  }
  return a;
}

// Tenta o texto completo e, se não achar, versões mais simples (marcadas como aproximadas)
async function geocode(addr, near){
  const full = normalizeAddr(addr);
  const noNum = full.replace(/\b\d+\b/g, '').replace(/(\s*,)+/g, ',').replace(/^,|,$/g, '').replace(/,/g, ', ').trim();
  const parts = full.split(',').map(x => x.trim());
  const short = parts.length > 3 ? [parts[0], ...parts.slice(-2)].join(', ') : full;
  const [first, ...rest] = parts;
  const area = first.split(' ').filter(w => !/^(rua|r\.?|avenida|av\.?|travessa|alameda|rodovia|estrada)$/i.test(w) && !/\d/.test(w)).join(' ').trim();
  const byArea = area && area !== first ? [area, ...rest].join(', ') : '';
  const variants = [[full, false], [noNum, true], [short, true], [byArea, true], [rest.join(', '), true]]
    .filter(v => v[0]).filter((v, i, arr) => arr.findIndex(x => x[0] === v[0]) === i);
  for (const [q, approx] of variants) {
    const qs = new URLSearchParams({ address: q });
    if (near) qs.set('near', `${near.lat},${near.lon}`);
    const r = await api('/api/geocode?' + qs);
    if (r.found) return { lat: r.lat, lon: r.lon, approx: approx || r.approx };
  }
  return null;
}

/** Usuário digitou um endereço e saiu do campo sem escolher uma sugestão: tenta localizar mesmo assim. */
export async function geocodeText(key){
  const text = String(Q[TEXT_KEY[key]] || '').trim();
  if (!text || Q.pts[key]) return;
  try {
    const p = await geocode(text, nearPoint());
    if (!p || String(Q[TEXT_KEY[key]] || '').trim() !== text) return;
    setPoint(key, { lat: p.lat, lon: p.lon, name: text, approx: p.approx });
  } catch { /* sem serviço: o usuário pode marcar no mapa ou preencher as distâncias */ }
}

/* ---------- Pontos ---------- */

export const nearPoint = () => app.geo.home ? { lat: app.geo.home.lat, lon: app.geo.home.lon } : null;

export function setPoint(key, p){
  Q.pts[key] = { lat: p.lat, lon: p.lon, name: p.name, approx: !!p.approx };
  update();
}
export function clearPoint(key){
  if (!Q.pts[key]) return;
  delete Q.pts[key]; app.geo.routes = {};
  update();
}
export function setText(key, text){ Q[TEXT_KEY[key]] = text; }

// Usuário arrastou um pino: mantém o endereço digitado e usa a nova posição
function onPinMoved(key, pos){
  if (key === 'home') return;
  const old = Q.pts[key] || {};
  Q.pts[key] = { ...old, lat: pos.lat, lon: pos.lon, approx: false };
  update();
}

// Clique no mapa: marca o próximo ponto que falta e descobre o endereço
async function onMapClick({ lat, lon }){
  const key = !Q.pts.pickup ? 'pickup' : !Q.pts.delivery ? 'delivery' : (Q.finalDest === 'other' && !Q.pts.final ? 'final' : '');
  if (!key) return;
  let name = '';
  try { const r = await api(`/api/reverse?lat=${lat}&lon=${lon}`); if (r.found) name = r.name; } catch { /* usa as coordenadas */ }
  name = name || `Ponto no mapa (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
  setText(key, name);
  setPoint(key, { lat, lon, name });
}

/* ---------- Residência (ponto de partida) ---------- */

async function getHome(){
  const addr = S.home.trim();
  if (!addr) return null;
  if (app.geo.home && app.geo.home.addr === addr) return app.geo.home;
  const cached = lsGet(KEY_HOME, null);
  if (cached && cached.addr === addr) return (app.geo.home = cached);
  const p = await geocode(addr, null);
  if (!p) return null;
  app.geo.home = { addr, lat: p.lat, lon: p.lon };
  lsSet(KEY_HOME, app.geo.home);
  return app.geo.home;
}

/** Localiza a residência em segundo plano, para centralizar o mapa e priorizar resultados próximos. */
export async function warmHome(){
  try { await getHome(); update(); } catch { /* tenta de novo quando precisar */ }
}

/* ---------- Rotas automáticas ---------- */

const routeCache = new Map();
async function routeBetween(a, b){
  const key = [a, b].map(p => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|');
  if (routeCache.has(key)) return routeCache.get(key);
  const r = await api('/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: { lat: a.lat, lon: a.lon }, to: { lat: b.lat, lon: b.lon } }) });
  const out = { km: Math.round(r.meters / 100) / 10, coords: r.coords };
  routeCache.set(key, out);
  return out;
}

// Trechos necessários para a modalidade escolhida
function legsFor(home){
  const pt = Q.pts, final = Q.finalDest === 'home' ? home : pt.final;
  const legs = [['homePickup', home, pt.pickup], ['pickupDelivery', pt.pickup, pt.delivery]];
  if (Q.mode !== 'oneway') legs.push(['deliveryPickup', pt.delivery, pt.pickup]);
  legs.push(Q.mode === 'roundtrip' ? ['pickupFinal', pt.pickup, final] : ['deliveryFinal', pt.delivery, final]);
  return legs.filter(([, a, b]) => a && b);
}

let seq = 0, timer = 0;
const status = html => { $('#geoStatus').innerHTML = html; };

async function ensureRoutes(){
  const my = ++seq;
  if (!Q.pts.pickup || !Q.pts.delivery) { app.geo.routes = {}; status(''); redraw(false); return; }
  status(`<span>${icon('route', 'icon icon--sm')} Calculando rotas...</span>`);
  try {
    const home = await getHome();
    if (my !== seq) return;
    const legs = legsFor(home), errs = [], routes = {};
    if (!home) errs.push('Não localizei a residência. Confira o endereço em Configurações.');
    await Promise.all(legs.map(async ([k, a, b]) => {
      try { routes[k] = await routeBetween(a, b); } catch { errs.push('Rota indisponível para um dos trechos.'); }
    }));
    if (my !== seq) return;
    Object.entries(routes).forEach(([k, rt]) => { Q[k] = String(rt.km); delete Q.touched[k]; });
    // Trechos de volta calculados de verdade: não copiam mais o trecho de ida ('auto' não é edição manual)
    ['deliveryPickup', 'pickupFinal'].forEach(k => { if (routes[k]) Q.touched[k] = 'auto'; });
    const first = !Object.keys(app.geo.routes).length;
    app.geo.routes = routes;
    redraw(first);
    if (errs.length) Q.distManual = true;   // mostra os campos para preencher à mão
    status([...new Set(errs)].map(m => `<span class="e">${esc(m)} Preencha as distâncias manualmente.</span>`).join(''));
    update();
  } catch (e) {
    if (my !== seq) return;
    Q.distManual = true;
    status(`<span class="e">Não foi possível calcular as rotas (${esc(e.message)}). Preencha as distâncias manualmente.</span>`);
    update();
  }
}

/* ---------- Sincronização com o estado (chamada a cada atualização) ---------- */

let lastSig = '', lastCount = -1;
const redraw = fit => drawMap({ fit, onPinMoved, onMapClick });

export function syncGeo(){
  const count = Object.keys(Q.pts).length;
  const sig = JSON.stringify([Q.mode, Q.finalDest, S.home, Q.trips, Q.pts, !!app.geo.home]);
  if (sig === lastSig) return;
  lastSig = sig;
  const fit = count !== lastCount; lastCount = count;
  redraw(fit);
  clearTimeout(timer); timer = setTimeout(ensureRoutes, 250);
}

/** Novo orçamento: descarta pontos e rotas (a residência continua em cache). */
export function resetGeo(){
  app.geo.routes = {}; seq++; lastSig = ''; lastCount = -1; status('');
}
