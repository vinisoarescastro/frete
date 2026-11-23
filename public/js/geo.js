'use strict';
/* Localização de endereços e cálculo de rotas (via servidor, que consulta o Google Maps). */
import { S, Q, app, update } from './state.js';
import { $, esc } from './utils.js';
import { finalAddress } from './forms.js';
import { drawMap } from './map.js';

async function api(path, options){
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  if (res.status === 401) { location.href = '/login'; throw new Error('sessão expirada'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'HTTP ' + res.status);
  return body;
}

// Normaliza o endereço: "Cidade - GO" vira "Cidade, GO"; sem cidade/UF, usa a cidade da residência
function normalizeAddr(addr){
  let a = addr.trim().replace(/\s+-\s+([A-Za-z]{2})\s*$/, ', $1').replace(/\s+/g, ' ');
  if (!/,\s*[A-Za-z]{2}\s*$/.test(a)) {
    const hp = S.home.trim().replace(/\s+-\s+([A-Za-z]{2})\s*$/, ', $1').split(',');
    if (hp.length >= 2) a += ', ' + hp.slice(-2).map(x => x.trim()).join(', ');
  }
  return a;
}

// Busca o endereço. Tenta primeiro o texto completo (com número); variações são marcadas como aproximadas.
async function geocode(addr, near){
  const full = normalizeAddr(addr);
  const noNum = full.replace(/\b\d+\b/g, '').replace(/(\s*,)+/g, ',').replace(/^,|,$/g, '').replace(/,/g, ', ').trim();
  const parts = full.split(',').map(x => x.trim());
  const short = parts.length > 3 ? [parts[0], ...parts.slice(-2)].join(', ') : full;
  // Sem o tipo de via e sem códigos com número ("Rua OR2 Vila Redenção" vira "Vila Redenção"): acha o bairro
  const [first, ...rest] = parts;
  const area = first.split(' ').filter(w => !/^(rua|r\.?|avenida|av\.?|travessa|alameda|rodovia|estrada)$/i.test(w) && !/\d/.test(w)).join(' ').trim();
  const byArea = area && area !== first ? [area, ...rest].join(', ') : '';
  const city = rest.join(', ');   // último recurso: centro da cidade (o usuário arrasta o ponto)
  const variants = [[full, false], [noNum, true], [short, true], [byArea, true], [city, true]]
    .filter(v => v[0]).filter((v, i, arr) => arr.findIndex(x => x[0] === v[0]) === i);
  for (const [q, approx] of variants) {
    const qs = new URLSearchParams({ address: q });
    if (near) qs.set('near', `${near.lat},${near.lon}`);   // prefere resultados perto da residência
    const r = await api('/api/geocode?' + qs);
    if (!r.found) continue;
    return { lat: r.lat, lon: r.lon, name: r.name, query: q, approx: approx || r.approx };
  }
  return null;
}

async function routeKm(a, b){
  const r = await api('/api/route', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: { lat: a.lat, lon: a.lon }, to: { lat: b.lat, lon: b.lon } })
  });
  return { km: Math.round(r.meters / 100) / 10, coords: r.coords };   // km com 1 casa
}

// Calcula todas as rotas a partir dos pontos e preenche as distâncias do orçamento
const ROUTE_JOBS = [['homePickup', 'home', 'pickup'], ['pickupDelivery', 'pickup', 'delivery'], ['deliveryPickup', 'delivery', 'pickup'],
                    ['deliveryFinal', 'delivery', 'final'], ['pickupFinal', 'pickup', 'final']];
async function computeRoutes(pt, log){
  const routes = {};
  for (const [key, a, b] of ROUTE_JOBS) {
    if (!pt[a] || !pt[b]) continue;
    try { const rt = await routeKm(pt[a], pt[b]); routes[key] = rt; Q[key] = String(rt.km); delete Q.touched[key]; }
    catch { if (log) log(`Rota indisponível para o trecho ${esc(key)}. Preencha manualmente.`, 'e'); }
  }
  Q.touched.deliveryPickup = true; Q.touched.pickupFinal = true;   // sentidos reais; continuam editáveis
  return routes;
}

// ETAPA 1: localiza os endereços e mostra os pontos no mapa para o usuário conferir
export async function locateAddresses(){
  const st = $('#geoStatus'), btn = $('#btnGeo'), lines = [];
  const log = (t, c = '') => { lines.push(`<span class="${c}">${t}</span>`); st.innerHTML = lines.join(''); };
  const fin = finalAddress();
  const need = [['Residência (Configurações)', S.home], ['Endereço de coleta', Q.pickup], ['Endereço de entrega', Q.delivery]];
  if (Q.finalDest === 'other') need.push(['Endereço de destino final', fin]);
  const miss = need.filter(n => !String(n[1]).trim());
  if (miss.length) { st.innerHTML = `<span class="e">Preencha: ${miss.map(m => m[0]).join(', ')}.</span>`; return; }

  btn.disabled = true; st.innerHTML = ''; app.geo = null;
  try {
    log('Localizando endereços...');
    const pt = {};
    const targets = [['home', 'Residência', S.home], ['pickup', 'Coleta', Q.pickup], ['delivery', 'Entrega', Q.delivery]];
    if (Q.finalDest === 'other') targets.push(['final', 'Destino final', fin]);
    let failed = 0;
    for (const [k, label, addr] of targets) {
      pt[k] = await geocode(addr.trim(), k === 'home' ? null : pt.home);
      if (!pt[k]) { failed++; log(`${label}: não localizei "${esc(addr)}". Complete com cidade e estado e tente de novo.`, 'e'); }
      else log(`${label}: ${esc(pt[k].name)}${pt[k].approx ? ' (localização aproximada, sem o número exato; confira no mapa)' : ''}`, pt[k].approx ? 'e' : 'o');
    }
    if (Q.finalDest === 'home') pt.final = pt.home;
    Q.geoKey = [S.home, Q.pickup, Q.delivery, fin].join('|');
    if (failed) { log('Corrija os endereços não localizados ou preencha as distâncias manualmente.', 'e'); }
    else {
      app.geo = { pt, routes: {}, finalOther: Q.finalDest === 'other', confirmed: false };
      drawMap(false, onPinMoved);
      log('Confira os pontos no mapa. Se algum estiver fora do lugar, arraste-o. Depois clique em "Confirmar pontos e calcular".', '');
    }
  } catch (e) {
    log('Não foi possível consultar o serviço de mapas (' + esc(e.message) + '). Preencha as distâncias manualmente.', 'e');
  } finally { btn.disabled = false; update(); }
}

// ETAPA 2: com os pontos confirmados, calcula as rotas e as quilometragens
export async function confirmRoutes(){
  const geo = app.geo;
  if (!geo) return;
  const st = $('#geoStatus'), btn = $('#btnConfirm');
  btn.disabled = true; st.innerHTML = '<span>Calculando rotas...</span>';
  try {
    const errs = [];
    geo.routes = await computeRoutes(geo.pt, m => errs.push(m));
    geo.confirmed = true;
    drawMap(true, onPinMoved);
    st.innerHTML = errs.map(m => `<span class="e">${m}</span>`).join('') +
      '<span class="o">Distâncias calculadas e preenchidas. Você ainda pode arrastar os pontos para recalcular ou editar os km manualmente.</span>';
  } catch (e) {
    st.innerHTML = '<span class="e">Não foi possível calcular as rotas (' + esc(e.message) + '). Preencha as distâncias manualmente.</span>';
  } finally { btn.disabled = false; update(); }
}

// Usuário arrastou um ponto: antes da confirmação só move o ponto; depois recalcula as rotas
export async function onPinMoved(key, pos){
  const geo = app.geo;
  geo.pt[key] = { ...geo.pt[key], lat: pos.lat, lon: pos.lon, approx: false, name: 'ponto ajustado manualmente' };
  if (key === 'home' && !geo.finalOther) geo.pt.final = geo.pt.home;
  if (!geo.confirmed) { $('#geoStatus').innerHTML = '<span class="o">Ponto ajustado. Clique em "Confirmar pontos e calcular" quando estiver correto.</span>'; return; }
  $('#geoStatus').innerHTML = '<span>Recalculando rotas...</span>';
  geo.routes = await computeRoutes(geo.pt, null);
  $('#geoStatus').innerHTML = '<span class="o">Ponto ajustado. Rotas e quilometragens recalculadas.</span>';
  drawMap(true, onPinMoved); update();
}
