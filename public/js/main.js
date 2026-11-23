'use strict';
/* Ponto de entrada: carrega os dados salvos, liga os eventos e coordena as atualizações. */
import { S, Q, app, resetQuote, replaceQuote, setUpdater, update } from './state.js';
import { DEFAULT_SETTINGS } from './config.js';
import { $, toast } from './utils.js';
import { calculate } from './calc.js';
import { buildForms, applyMirrors, syncInputs, renderRoute } from './forms.js';
import { renderValidation, renderResults } from './render.js';
import { quoteHTML, copyText, sendWhatsApp, savePdf } from './quote.js';
import { syncGeo, resetGeo, warmHome } from './geo.js';
import { renderAcState } from './autocomplete.js';
import { initMap, invalidateMap } from './map.js';
import { loadRemote, initSaved, persist } from './store.js';
import { initRecent, loadRecent, updateEditBanner } from './recent.js';

// Dados do servidor (SQLite) têm prioridade sobre a cópia local do navegador
const remote = await loadRemote();
if (remote) {
  if (remote.settings) Object.assign(S, DEFAULT_SETTINGS, remote.settings);
  if (remote.draft) replaceQuote(remote.draft);
}
initSaved(remote && remote.settings, remote && remote.draft);

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
  updateEditBanner();
  persist(S, Q);
}

/* Navegação entre Orçamento e Configurações (rota pelo hash da URL) */
const ROUTES = { '#/': 'calc', '#/historico': 'hist', '#/configuracoes': 'set' };
function showTab(name){
  $('#tab-calc').classList.toggle('hidden', name !== 'calc');
  $('#tab-set').classList.toggle('hidden', name !== 'set');
  $('#tab-hist').classList.toggle('hidden', name !== 'hist');
  if (name === 'hist') loadRecent();
  document.body.dataset.view = name;
  document.querySelectorAll('[data-route]').forEach(a => a.setAttribute('aria-selected', String(a.dataset.route === name)));
  if (name === 'calc') invalidateMap();
  window.scrollTo(0, 0);
}
const route = () => showTab(ROUTES[location.hash] || 'calc');
window.addEventListener('hashchange', route);

/* Eventos */
document.addEventListener('click', e => {
  const rs = e.target.closest('[data-reset]');
  if (rs) { Q.touched[rs.closest('.drow').dataset.key] = false; update(); }
});
document.addEventListener('change', e => {
  const mc = e.target.closest && e.target.closest('[data-method]');
  if (mc && mc.checked) { Q.method = mc.dataset.method; update(); }
});
$('#btnDistManual').addEventListener('click', () => { Q.distManual = true; update(); $('[data-q="homePickup"]').focus(); });
$('#btnWhats').addEventListener('click', sendWhatsApp);
$('#barSend').addEventListener('click', sendWhatsApp);
$('#btnCopy').addEventListener('click', copyText);
$('#btnPdf').addEventListener('click', savePdf);
$('#btnClearManual').addEventListener('click', () => { Q.manual = ''; update(); });
$('#btnDefaults').addEventListener('click', () => {
  Q.tolls = S.defTolls; Q.parking = S.defParking; Q.food = S.defFood; Q.otherExp = S.defOther; update();
});
$('#btnNew').addEventListener('click', () => {
  if (!confirm('Limpar o orçamento atual? As configurações são mantidas.')) return;
  resetQuote(); resetGeo(); update(); toast('Orçamento limpo.');
});
$('#btnReset').addEventListener('click', () => {
  if (!confirm('Restaurar todas as configurações para os valores padrão?')) return;
  Object.assign(S, DEFAULT_SETTINGS); update(); toast('Configurações restauradas.');
});

/* Início */
setUpdater(refresh);
buildForms();
initMap();
initRecent();
route();
update();
warmHome();
