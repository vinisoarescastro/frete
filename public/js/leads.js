'use strict';
/* Simulações feitas pelos clientes na página pública (/simular). */
import { Q, update, replaceQuote } from './state.js';
import { $, esc, brl, toast, icon } from './utils.js';
import * as store from './store.js';
import { resetGeo } from './geo.js';

const when = ms => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dateBr = iso => iso ? iso.split('-').reverse().join('/') : '';
const MODE = { oneway: 'Somente ida', roundtrip: 'Ida e volta' };
const waLink = phone => `https://wa.me/55${String(phone).replace(/\D/g, '')}`;
const fmtPhone = p => { const d = String(p).replace(/\D/g, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
let cache = [];

function render(){
  const box = $('#leadList');
  const t = $('#leadSearch').value.trim().toLowerCase();
  const items = cache.filter(l => !t || [l.name, l.phone, l.pickup, l.delivery].some(x => String(x || '').toLowerCase().includes(t)));
  $('#leadCount').textContent = cache.length ? `${cache.length} ${cache.length > 1 ? 'simulações' : 'simulação'}` : '';
  box.innerHTML = items.length ? items.map(l => {
    const done = l.price != null;
    return `<article class="lead" data-id="${l.id}">
      <div class="lead__top">
        <div><div class="lead__name">${esc(l.name)}</div><div class="lead__sub">${esc(fmtPhone(l.phone))}, ${when(l.created_at)}</div></div>
        <div class="lead__price">${done ? brl(l.price) : '<span class="lead__pending">Não concluiu</span>'}</div>
      </div>
      ${done ? `<div class="lead__route">${esc(l.pickup)}<span class="lead__arrow">para</span>${esc(l.delivery)}</div>
      <div class="lead__meta">${MODE[l.mode] || ''}, ${Math.round(l.km)} km, ${l.no_date ? 'sem data definida' : 'data ' + dateBr(l.desired_date)}${l.simulations > 1 ? `, ${l.simulations} simulações` : ''}</div>` : ''}
      <div class="lead__actions">
        <a class="ds-btn btn-wa ds-btn--sm" href="${waLink(l.phone)}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>
        ${done ? `<button type="button" class="ds-btn ds-btn--outline ds-btn--sm" data-quote="${l.id}">Criar orçamento</button>` : ''}
        <button type="button" class="ds-icon-btn ds-icon-btn--sm" data-del="${l.id}" aria-label="Excluir simulação">${icon('trash-2')}</button>
      </div></article>`;
  }).join('') : `<p class="note">${cache.length ? 'Nada encontrado.' : 'Nenhuma simulação ainda. Compartilhe o link da página /simular com seus clientes.'}</p>`;
}

export async function loadLeads(){
  try { cache = (await store.listLeads()).items; render(); }
  catch { $('#leadList').innerHTML = '<p class="note">Não foi possível carregar as simulações.</p>'; }
}

export function initLeads(){
  $('#leadSearch').addEventListener('input', render);
  $('#leadList').addEventListener('click', async e => {
    const q = e.target.closest('[data-quote]'), del = e.target.closest('[data-del]');
    try {
      if (q) {
        const l = await store.getLead(q.dataset.quote);
        const pt = (name, lat, lon) => ({ lat, lon, name, approx: false });
        replaceQuote({
          clientName: l.name, clientPhone: l.phone, pickup: l.pickup, delivery: l.delivery,
          mode: l.mode || 'oneway', date: l.no_date ? '' : (l.desired_date || ''),
          pts: { pickup: pt(l.pickup, l.pickup_lat, l.pickup_lon), delivery: pt(l.delivery, l.delivery_lat, l.delivery_lon) }
        });
        resetGeo(); update(); location.hash = '#/'; toast('Orçamento criado a partir da simulação.');
      } else if (del) {
        if (!confirm('Excluir esta simulação?')) return;
        await store.deleteLead(del.dataset.del); loadLeads();
      }
    } catch { toast('Não foi possível concluir. Tente de novo.', 'danger'); }
  });
}
