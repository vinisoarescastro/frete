'use strict';
/* Mapa do trajeto: Leaflet com imagens do OpenStreetMap (biblioteca em /vendor/leaflet). */
import { Q, app } from './state.js';
import { $, kmf } from './utils.js';
import { num } from './calc.js';

let MAP = null, LAYER = null, handlers = {}, centered = false;
const DEFAULT_CENTER = [-16.6869, -49.2648];   // Goiânia, até a residência ser localizada

/** Cria o mapa (uma vez). Chamado ao iniciar e quando a aba Orçamento volta a ficar visível. */
export function initMap(){
  if (MAP || typeof L === 'undefined') return;
  MAP = L.map('map', { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 12);
  // Scroll dá zoom só depois de clicar no mapa; ao sair com o mouse, volta a rolar a página
  MAP.on('click focus', () => MAP.scrollWheelZoom.enable());
  MAP.on('mouseout blur', () => MAP.scrollWheelZoom.disable());
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(MAP);
  LAYER = L.featureGroup().addTo(MAP);
  MAP.on('click', e => handlers.onMapClick && handlers.onMapClick({ lat: e.latlng.lat, lon: e.latlng.lng }));
}
export const invalidateMap = () => { if (MAP) setTimeout(() => MAP.invalidateSize(), 50); };

const nextMissing = () => !Q.pts.pickup ? 'a coleta' : !Q.pts.delivery ? 'a entrega' : (Q.finalDest === 'other' && !Q.pts.final ? 'o destino final' : '');

/** Desenha pinos e rotas. fit: enquadra tudo no mapa. */
export function drawMap({ fit = false, onPinMoved, onMapClick } = {}){
  initMap();
  handlers = { onMapClick };
  if (!MAP) { $('#map').innerHTML = '<p class="note" style="padding:16px">Não foi possível carregar o mapa.</p>'; return; }
  LAYER.clearLayers();
  const { home, routes } = app.geo, pts = Q.pts;
  const hasPoints = !!(pts.pickup || pts.delivery || pts.final);
  const missing = nextMissing();
  MAP.getContainer().style.cursor = missing ? 'crosshair' : '';
  $('#mapHint').textContent = missing ? `Clique no mapa para marcar ${missing}, ou digite o endereço.` : 'Arraste os pinos para ajustar a posição.';

  if (!hasPoints && home && !centered) { MAP.setView([home.lat, home.lon], 13); centered = true; }

  const returns = Q.mode === 'roundtrip' ? 1 : (Q.mode === 'multiple' ? Math.max(num(Q.trips) - 1, 0) : 0);
  const legs = [['homePickup', 'Residência até a coleta', '#7a8aa6', 4, null], ['pickupDelivery', 'Coleta até a entrega', '#2563eb', 6, null]];
  if (returns > 0) legs.push(['deliveryPickup', 'Volta à coleta', '#f59e0b', 4, '8 8']);
  legs.push(Q.mode === 'roundtrip' ? ['pickupFinal', 'Coleta até o destino final', '#16a34a', 4, null] : ['deliveryFinal', 'Entrega até o destino final', '#16a34a', 4, null]);
  const items = [];
  legs.forEach(([k, name, color, w, dash]) => {
    const rt = routes[k]; if (!rt) return;
    L.polyline(rt.coords, { color, weight: w, opacity: .85, dashArray: dash }).addTo(LAYER);
    items.push(`<span><i style="background:${color}"></i>${name}: ${kmf(rt.km)}</span>`);
  });
  $('#mapLegend').innerHTML = items.join('');

  const pins = [['C', 'Coleta', pts.pickup, 'pickup', true], ['E', 'Entrega', pts.delivery, 'delivery', true]];
  if (Q.finalDest === 'other') pins.push(['F', 'Destino final', pts.final, 'final', true]);
  if (hasPoints && home) pins.push(['R', 'Residência', home, 'home', false]);
  pins.forEach(([t, name, p, key, drag]) => {
    if (!p) return;
    const m = L.marker([p.lat, p.lon], { draggable: drag, icon: L.divIcon({ className: '', html: `<div class="pin${key === 'home' ? ' pin--home' : ''}">${t}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindTooltip(name + (drag ? ' (arraste para ajustar)' : '')).addTo(LAYER);
    if (drag) m.on('dragend', ev => { const ll = ev.target.getLatLng(); onPinMoved && onPinMoved(key, { lat: ll.lat, lon: ll.lng }); });
  });

  if (fit) setTimeout(() => {
    MAP.invalidateSize();
    const b = LAYER.getBounds();
    if (b.isValid()) MAP.fitBounds(b, { padding: [32, 32], maxZoom: 16 });
  }, 50);
}
