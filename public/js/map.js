'use strict';
/* Mapa do trajeto com a Google Maps JavaScript API (a chave vem do servidor após o login). */
import { Q, app } from './state.js';
import { $, kmf } from './utils.js';
import { num } from './calc.js';
import { decodePolyline } from './polyline.js';

let MAP = null, OVERLAYS = [], MAP_SIG = '', loading = null;
const DEFAULT_CENTER = { lat: -16.6869, lng: -49.2648 };   // Goiânia
export const mapSig = () => Q.mode + '|' + Q.finalDest;

// Carrega a biblioteca do Google uma única vez
function loadGoogle(){
  if (loading) return loading;
  loading = (async () => {
    const res = await fetch('/api/config', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('configuração indisponível');
    const cfg = await res.json();
    if (!cfg.mapsKey) throw new Error('chave do Google Maps não configurada no servidor');
    await new Promise((resolve, reject) => {
      window.__mapsReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
        key: cfg.mapsKey, v: 'weekly', loading: 'async', language: 'pt-BR', region: 'BR', callback: '__mapsReady'
      });
      s.async = true; s.onerror = () => reject(new Error('falha ao carregar a biblioteca do Google Maps'));
      document.head.appendChild(s);
    });
    const [{ Map, Polyline }, { AdvancedMarkerElement }] = await Promise.all([
      google.maps.importLibrary('maps'), google.maps.importLibrary('marker')
    ]);
    return { Map, Polyline, AdvancedMarkerElement, mapId: cfg.mapId };
  })();
  loading.catch(() => { loading = null; });   // permite tentar de novo
  return loading;
}

const coord = v => (typeof v === 'function' ? v() : v);

export async function drawMap(keepView, onPinMoved){
  const box = $('#mapBox'), geo = app.geo;
  if (!geo) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  MAP_SIG = mapSig();

  let g;
  try { g = await loadGoogle(); }
  catch (e) {
    $('#map').innerHTML = `<p class="note" style="padding:16px">Não foi possível carregar o mapa (${e.message}). Use os links "Ver no Maps" para conferir os trechos.</p>`;
    return;
  }
  if (app.geo !== geo) return;   // o usuário refez a busca enquanto o mapa carregava

  if (!MAP) {
    MAP = new g.Map($('#map'), { center: DEFAULT_CENTER, zoom: 12, mapId: g.mapId, gestureHandling: 'cooperative', streetViewControl: false, mapTypeControl: false, fullscreenControl: true });
  }
  OVERLAYS.forEach(o => { if ('setMap' in o) o.setMap(null); else o.map = null; });
  OVERLAYS = [];

  const { pt, routes } = geo, bounds = new google.maps.LatLngBounds();
  const returns = Q.mode === 'roundtrip' ? 1 : (Q.mode === 'multiple' ? Math.max(num(Q.trips) - 1, 0) : 0);
  const legs = [
    ['homePickup', 'Residência para coleta', '#7a8aa6', 4, false],
    ['pickupDelivery', 'Coleta para entrega (ida)', '#0b5fff', 6, false]
  ];
  if (returns > 0) legs.push(['deliveryPickup', 'Entrega para coleta (retorno)', '#f59e0b', 4, true]);
  legs.push(Q.mode === 'roundtrip' ? ['pickupFinal', 'Coleta para retorno final', '#0f9d58', 4, false] : ['deliveryFinal', 'Entrega para retorno final', '#0f9d58', 4, false]);

  const items = [];
  legs.forEach(([k, name, color, w, dashed]) => {
    const rt = routes[k]; if (!geo.confirmed || !rt) return;
    const path = decodePolyline(rt.polyline);
    const opts = { path, map: MAP, geodesic: false, strokeColor: color, strokeWeight: w };
    if (dashed) Object.assign(opts, { strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: .85, scale: 3 }, offset: '0', repeat: '14px' }] });
    else opts.strokeOpacity = .85;
    OVERLAYS.push(new g.Polyline(opts));
    path.forEach(p => bounds.extend(p));
    items.push(`<span><i style="background:${color}"></i>${name}: ${kmf(rt.km)}</span>`);
  });

  const pins = [['R', 'Residência', pt.home, 'home'], ['C', 'Coleta', pt.pickup, 'pickup'], ['E', 'Entrega', pt.delivery, 'delivery']];
  if (geo.finalOther) pins.push(['F', 'Retorno final', pt.final, 'final']);
  pins.forEach(([t, name, p, key]) => {
    if (!p) return;
    const el = document.createElement('div'); el.className = 'pin'; el.textContent = t;
    const m = new g.AdvancedMarkerElement({ map: MAP, position: { lat: p.lat, lng: p.lon }, content: el, gmpDraggable: true, title: name + ' (arraste para corrigir)' });
    m.addListener('dragend', () => onPinMoved(key, { lat: coord(m.position.lat), lon: coord(m.position.lng) }));
    OVERLAYS.push(m);
    bounds.extend({ lat: p.lat, lng: p.lon });
  });

  $('#mapLegend').innerHTML = items.join('') + '<span>' + (geo.confirmed ? '' : 'Aguardando sua confirmação. ') + 'Pontos arrastáveis: R residência, C coleta, E entrega' + (geo.finalOther ? ', F retorno final' : '') + '</span>';
  if (!keepView && !bounds.isEmpty()) MAP.fitBounds(bounds, 48);
}

export const mapStale = () => !!app.geo && mapSig() !== MAP_SIG;
