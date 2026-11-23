'use strict';
/* Utilitários de formatação, DOM e armazenamento local. */
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const brl = v => Number.isFinite(v) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'n/d';
export const kmf = v => (Math.round(v * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' km';
export const pctf = v => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : 'n/d';
export const litf = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' L';
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
export const sgn = v => (v >= 0 ? 'pos' : 'neg');

export function lsGet(key, fallback){
  try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; }
  catch { return fallback; }
}
export function lsSet(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* armazenamento indisponível */ } }

/** Ícone do sprite do design system (Lucide). */
export const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/icons.svg#${name}"/></svg>`;

const TOAST_ICON = { success: 'circle-check', warning: 'triangle-alert', danger: 'circle-alert', info: 'info' };
let toastTimer;
/** Aviso temporário no padrão do design system. tone: success | warning | danger | info. */
export function toast(msg, tone = 'success'){
  const region = $('#toast');
  region.innerHTML = `<div class="ds-toast ds-toast--${tone}" role="status"><span class="ds-toast__icon">${icon(TOAST_ICON[tone] || 'info')}</span><div class="ds-toast__body"><div class="ds-toast__title">${esc(msg)}</div></div><span class="ds-toast__timer" style="animation-duration:4s"></span></div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { region.innerHTML = ''; }, 4000);
}
