'use strict';
/* Mapa do trajeto com Leaflet e imagens do OpenStreetMap (a biblioteca fica em /vendor/leaflet). */
import { Q, app } from './state.js';
import { $, kmf } from './utils.js';
import { num } from './calc.js';
import { decodePolyline } from './polyline.js';

let MAP = null, LAYER = null, MAP_SIG = '';
export const mapSig = () => Q.mode + '|' + Q.finalDest;
export const mapStale = () => !!app.geo && mapSig() !== MAP_SIG;

export function drawMap(keepView, onPinMoved){
  const box = $('#mapBox'), geo = app.geo;
  if (!geo) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  MAP_SIG = mapSig();
  if (typeof L === 'undefined') {
    $('#map').innerHTML = '<p class="note" style="padding:16px">Não foi possível carregar o mapa. Use os links "Ver no Maps" para conferir os trechos.</p>';
    return;
  }
  if (!MAP) {
    MAP = L.map('map', { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(MAP);
  }
  if (LAYER) LAYER.remove();
  LAYER = L.featureGroup().addTo(MAP);

  const { pt, routes } = geo;
  const returns = Q.mode === 'roundtrip' ? 1 : (Q.mode === 'multiple' ? Math.max(num(Q.trips) - 1, 0) : 0);
  const legs = [
    ['homePickup', 'Residência para coleta', '#7a8aa6', 4, null],
    ['pickupDelivery', 'Coleta para entrega (ida)', '#0b5fff', 6, null]
  ];
  if (returns > 0) legs.push(['deliveryPickup', 'Entrega para coleta (retorno)', '#f59e0b', 4, '8 8']);
  legs.push(Q.mode === 'roundtrip' ? ['pickupFinal', 'Coleta para retorno final', '#0f9d58', 4, null] : ['deliveryFinal', 'Entrega para retorno final', '#0f9d58', 4, null]);

  const items = [];
  legs.forEach(([k, name, color, w, dash]) => {
    const rt = routes[k]; if (!geo.confirmed || !rt) return;
    const path = decodePolyline(rt.polyline).map(p => [p.lat, p.lng]);
    L.polyline(path, { color, weight: w, opacity: .85, dashArray: dash }).addTo(LAYER);
    items.push(`<span><i style="background:${color}"></i>${name}: ${kmf(rt.km)}</span>`);
  });

  const pins = [['R', 'Residência', pt.home, 'home'], ['C', 'Coleta', pt.pickup, 'pickup'], ['E', 'Entrega', pt.delivery, 'delivery']];
  if (geo.finalOther) pins.push(['F', 'Retorno final', pt.final, 'final']);
  pins.forEach(([t, name, p, key]) => {
    if (!p) return;
    L.marker([p.lat, p.lon], { draggable: true, icon: L.divIcon({ className: '', html: `<div class="pin">${t}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindTooltip(name + ' (arraste para corrigir)')
      .on('dragend', ev => { const ll = ev.target.getLatLng(); onPinMoved(key, { lat: ll.lat, lon: ll.lng }); })
      .addTo(LAYER);
  });

  $('#mapLegend').innerHTML = items.join('') + '<span>' + (geo.confirmed ? '' : 'Aguardando sua confirmação. ') + 'Pontos arrastáveis: R residência, C coleta, E entrega' + (geo.finalOther ? ', F retorno final' : '') + '</span>';
  setTimeout(() => {
    MAP.invalidateSize();
    const b = LAYER.getBounds(); if (!keepView && b.isValid()) MAP.fitBounds(b, { padding: [24, 24] });
  }, 50);
}
