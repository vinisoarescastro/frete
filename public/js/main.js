'use strict';
/* Ponto de entrada: ciclo de atualização, abas e eventos globais. */
import { S, Q, app, resetQuote, setUpdater, update } from './state.js';
import { KEY_S, KEY_Q, DEFAULT_SETTINGS } from './config.js';
import { $, lsSet, toast } from './utils.js';
import { calculate } from './calc.js';
import { buildForms, applyMirrors, syncInputs, renderRoute } from './forms.js';
import { renderValidation, renderResults } from './render.js';
import { quoteHTML, copyQuote, saveImage, printQuote } from './quote.js';
import { syncGeo, resetGeo, warmHome } from './geo.js';
import { renderAcState } from './autocomplete.js';
import { initMap, invalidateMap } from './map.js';

function refresh(){
  applyMirrors();
  syncInputs();
  app.last = calculate(S, Q);
  renderRoute();
  syncGeo();
  renderAcState();
  renderValidation(app.last);
  renderResults(app.last);
  $('#quotePreview').innerHTML = quoteHTML();
  const name = (S.providerName || '').trim() || 'Prestador';
  $('#userName').textContent = name;
  $('#userAvatar').textContent = name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  lsSet(KEY_S, S); lsSet(KEY_Q, Q);
}

const ROUTES = { '#/': 'calc', '#/configuracoes': 'set' };
function showTab(name){
  $('#tab-calc').classList.toggle('hidden', name !== 'calc');
  $('#tab-set').classList.toggle('hidden', name !== 'set');
  document.querySelectorAll('[data-route]').forEach(a => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  setMenu(false);
  if (name === 'calc') invalidateMap();
  window.scrollTo(0, 0);
}
const route = () => showTab(ROUTES[location.hash] || 'calc');
window.addEventListener('hashchange', route);

// Menu lateral no celular
function setMenu(open){
  $('#sidebar').dataset.open = String(open); $('#scrim').dataset.open = String(open);
  $('#btnMenu').setAttribute('aria-expanded', String(open));
}
$('#btnMenu').addEventListener('click', () => setMenu($('#sidebar').dataset.open !== 'true'));
$('#scrim').addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

document.addEventListener('click', e => {
  const rs = e.target.closest('[data-reset]');
  if (rs) { Q.touched[rs.closest('.drow').dataset.key] = false; update(); }
});
document.addEventListener('change', e => {
  const mc = e.target.closest && e.target.closest('[data-method]');
  if (mc && mc.checked) { Q.method = mc.dataset.method; update(); }
});
$('#btnDistManual').addEventListener('click', () => { Q.distManual = true; update(); $('[data-q="homePickup"]').focus(); });
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
  resetQuote(); resetGeo(); update(); toast('Novo orçamento iniciado.');
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
initMap();
route();
update();
warmHome();
