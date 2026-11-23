'use strict';
/* Orçamentos recentes (histórico no servidor): salvar ao enviar, reabrir e excluir. */
import { Q, app, update, replaceQuote } from './state.js';
import { $, esc, brl, toast, icon } from './utils.js';
import * as store from './store.js';
import { resetGeo } from './geo.js';

const short = a => String(a || '').split(',')[0].trim();
const fmt = ms => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Guarda o orçamento atual no histórico (cria na primeira vez, depois atualiza o mesmo). */
export async function rememberQuote(){
  try {
    const r = app.last && app.last.r;
    const res = await store.saveQuote(Q.savedId, {
      summary: { client: Q.clientName.trim(), pickup: Q.pickup.trim(), delivery: Q.delivery.trim(), price: r ? r.price : 0 },
      data: JSON.parse(JSON.stringify(Q))
    });
    if (Q.savedId !== res.id) { Q.savedId = res.id; update(); }
    if ($('#recent').open) loadRecent();
  } catch { /* o histórico é opcional: não atrapalha o envio */ }
}

export async function loadRecent(){
  const box = $('#recentList');
  try {
    const { items } = await store.listQuotes();
    box.innerHTML = items.length ? items.map(it => `<div class="recent-item" data-id="${it.id}">
      <button type="button" class="recent-open" data-open="${it.id}">
        <span class="recent-title">${esc(it.client || 'Sem nome')}</span>
        <span class="recent-sub">${esc(short(it.pickup))} até ${esc(short(it.delivery))}, ${fmt(it.updated_at)}</span>
      </button>
      <span class="recent-price">${brl(it.price)}</span>
      <button type="button" class="ds-icon-btn ds-icon-btn--sm" data-del="${it.id}" aria-label="Excluir orçamento">${icon('trash-2')}</button>
    </div>`).join('') : '<p class="note">Nenhum orçamento enviado ainda. Eles aparecem aqui quando você envia, copia ou gera o PDF.</p>';
  } catch { box.innerHTML = '<p class="note">Não foi possível carregar o histórico.</p>'; }
}

export function initRecent(){
  $('#recent').addEventListener('toggle', e => { if (e.target.open) loadRecent(); });
  $('#recentList').addEventListener('click', async e => {
    const open = e.target.closest('[data-open]'), del = e.target.closest('[data-del]');
    try {
      if (open) {
        const { id, data } = await store.getQuote(open.dataset.open);
        replaceQuote(data); Q.savedId = id; resetGeo(); update();
        window.scrollTo({ top: 0 }); toast('Orçamento aberto.');
      } else if (del) {
        if (!confirm('Excluir este orçamento do histórico?')) return;
        await store.deleteQuote(del.dataset.del);
        if (Q.savedId === Number(del.dataset.del)) Q.savedId = null;
        loadRecent();
      }
    } catch { toast('Não foi possível concluir. Tente de novo.', 'danger'); }
  });
}
