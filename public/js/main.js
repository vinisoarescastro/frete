'use strict';
/* Ponto de entrada: ciclo de atualização, abas e eventos globais. */
import { S, Q, app, resetQuote, setUpdater, update } from './state.js';
import { KEY_S, KEY_Q, DEFAULT_SETTINGS } from './config.js';
import { $, lsSet, toast } from './utils.js';
import { calculate } from './calc.js';
import { buildForms, applyMirrors, syncInputs, renderRoute } from './forms.js';
import { renderValidation, renderResults } from './render.js';
import { quoteHTML, copyQuote, saveImage, printQuote } from './quote.js';
import { locateAddresses, confirmRoutes, onPinMoved } from './geo.js';
import { drawMap, mapStale } from './map.js';

function refresh(){
  applyMirrors();
  syncInputs();
  app.last = calculate(S, Q);
  renderRoute();
  $('#btnConfirm').hidden = !app.geo;
  $('#btnConfirm').textContent = app.geo && app.geo.confirmed ? 'Recalcular distâncias' : 'Confirmar pontos e calcular';
  if (mapStale()) drawMap(false, onPinMoved);
  renderValidation(app.last);
  renderResults(app.last);
  $('#quotePreview').innerHTML = quoteHTML();
  lsSet(KEY_S, S); lsSet(KEY_Q, Q);
}

function showTab(name){
  $('#tab-calc').classList.toggle('hidden', name !== 'calc');
  $('#tab-set').classList.toggle('hidden', name !== 'set');
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]'); if (tab) showTab(tab.dataset.tab);
  const go = e.target.closest('[data-goto]'); if (go) { e.preventDefault(); showTab(go.dataset.goto); }
  const mc = e.target.closest('[data-method]'); if (mc) { Q.method = mc.dataset.method; update(); }
  const rs = e.target.closest('[data-reset]');
  if (rs) { Q.touched[rs.closest('.drow').dataset.key] = false; update(); }
});
document.addEventListener('keydown', e => {
  const mc = e.target.closest && e.target.closest('[data-method]');
  if (mc && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); Q.method = mc.dataset.method; update(); }
});
$('#btnGeo').addEventListener('click', locateAddresses);
$('#btnConfirm').addEventListener('click', confirmRoutes);
$('#btnCopy').addEventListener('click', () => copyQuote(true));
$('#barCopy').addEventListener('click', () => copyQuote(true));
$('#btnCopyPlain').addEventListener('click', () => copyQuote(false));
$('#btnImg').addEventListener('click', saveImage);
$('#btnPrint').addEventListener('click', () => printQuote(false));
$('#btnPdf').addEventListener('click', () => printQuote(true));
$('#btnClearManual').addEventListener('click', () => { Q.manual = ''; update(); });
$('#btnDefaults').addEventListener('click', () => {
  Q.tolls = S.defTolls; Q.parking = S.defParking; Q.food = S.defFood; Q.otherExp = S.defOther; update();
});
$('#btnNew').addEventListener('click', () => {
  if (!confirm('Começar um novo orçamento? Os dados do orçamento atual serão limpos (as configurações são mantidas).')) return;
  resetQuote(); app.geo = null; $('#geoStatus').innerHTML = ''; $('#mapBox').classList.add('hidden'); update(); toast('Novo orçamento iniciado.');
});
$('#btnReset').addEventListener('click', () => {
  if (!confirm('Restaurar todas as configurações para os valores padrão?')) return;
  Object.assign(S, DEFAULT_SETTINGS); update(); toast('Configurações restauradas.');
});
window.addEventListener('beforeprint', () => { $('#printArea').innerHTML = quoteHTML(); });
window.addEventListener('afterprint', () => { $('#printArea').innerHTML = ''; });

/* Início */
setUpdater(refresh);
buildForms();
update();
