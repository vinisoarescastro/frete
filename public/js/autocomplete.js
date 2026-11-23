'use strict';
/* Sugestões de endereço enquanto o usuário digita (coleta, entrega e destino final). */
import { Q } from './state.js';
import { esc } from './utils.js';
import { api, setPoint, clearPoint, geocodeText, nearPoint, setText } from './geo.js';

const MIN_CHARS = 3, DEBOUNCE_MS = 300;
const ui = {};   // estado por campo: { items, active, timer, seq, tried }

const wrapOf = key => document.querySelector(`[data-acwrap="${key}"]`);
const get = key => ui[key] || (ui[key] = { items: [], active: -1, timer: 0, seq: 0, tried: '' });

function close(key){
  const w = wrapOf(key), st = get(key);
  st.items = []; st.active = -1;
  w.querySelector('.ac-list').hidden = true;
  w.querySelector('input').setAttribute('aria-expanded', 'false');
  w.querySelector('input').removeAttribute('aria-activedescendant');
}

function render(key){
  const w = wrapOf(key), st = get(key), list = w.querySelector('.ac-list'), input = w.querySelector('input');
  if (!st.items.length) { close(key); return; }
  list.innerHTML = st.items.map((it, i) => {
    const [main, ...rest] = it.name.split(', ');
    return `<li role="option" class="ac-item" id="ac-${key}-${i}" data-i="${i}" aria-selected="${i === st.active}"><span class="ac-main">${esc(main)}</span><span class="ac-sub">${esc(rest.join(', '))}</span></li>`;
  }).join('');
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  if (st.active >= 0) input.setAttribute('aria-activedescendant', `ac-${key}-${st.active}`); else input.removeAttribute('aria-activedescendant');
}

async function search(key){
  const w = wrapOf(key), st = get(key), text = w.querySelector('input').value.trim(), my = ++st.seq;
  if (text.length < MIN_CHARS) { close(key); return; }
  const qs = new URLSearchParams({ q: text });
  const near = nearPoint(); if (near) qs.set('near', `${near.lat},${near.lon}`);
  try {
    const r = await api('/api/suggest?' + qs);
    if (my !== st.seq || document.activeElement !== w.querySelector('input')) return;   // resposta antiga ou campo sem foco
    st.items = r.items || []; st.active = -1;
    render(key);
  } catch { close(key); }
}

function pick(key, i){
  const st = get(key), it = st.items[i];
  if (!it) return;
  const w = wrapOf(key), input = w.querySelector('input');
  st.seq++; st.tried = it.name;
  input.value = it.name; setText(key, it.name);
  close(key);
  setPoint(key, { lat: it.lat, lon: it.lon, name: it.name });
  if (key === 'pickup' && !Q.pts.delivery) document.getElementById('ac-delivery').focus();   // segue para o próximo campo
}

/** Ícone e aviso de cada campo, conforme o ponto marcado no mapa. */
export function renderAcState(){
  document.querySelectorAll('[data-acwrap]').forEach(w => {
    const key = w.dataset.acwrap, p = Q.pts[key], icon = w.querySelector('.ac-state'), note = w.querySelector('.ac-note');
    icon.toggleAttribute('hidden', !p);
    if (p) {
      icon.querySelector('use').setAttribute('href', `/assets/icons.svg#${p.approx ? 'triangle-alert' : 'circle-check'}`);
      icon.classList.toggle('is-warn', !!p.approx); icon.classList.toggle('is-ok', !p.approx);
    }
    note.hidden = !(p && p.approx);
    note.textContent = p && p.approx ? 'Posição aproximada. Confira no mapa e arraste o pino se precisar.' : '';
  });
}

// Digitação: invalida o ponto se o texto mudou e busca sugestões
document.addEventListener('input', e => {
  const input = e.target.closest && e.target.closest('[data-ac]');
  if (!input) return;
  const key = input.dataset.ac, st = get(key), p = Q.pts[key];
  if (p && p.name !== input.value) clearPoint(key);
  st.tried = '';
  clearTimeout(st.timer);
  st.timer = setTimeout(() => search(key), DEBOUNCE_MS);
});

document.addEventListener('keydown', e => {
  const input = e.target.closest && e.target.closest('[data-ac]');
  if (!input) return;
  const key = input.dataset.ac, st = get(key);
  if (e.key === 'Escape') { close(key); return; }
  if (!st.items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); st.active = (st.active + 1) % st.items.length; render(key); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); st.active = (st.active - 1 + st.items.length) % st.items.length; render(key); }
  else if (e.key === 'Enter') { e.preventDefault(); pick(key, st.active >= 0 ? st.active : 0); }
});

// mousedown (e não click) para o campo não perder o foco antes da escolha
document.addEventListener('mousedown', e => {
  const item = e.target.closest && e.target.closest('.ac-item');
  if (!item) return;
  e.preventDefault();
  pick(item.closest('[data-acwrap]').dataset.acwrap, Number(item.dataset.i));
});

// Ao sair do campo: fecha a lista e, se nada foi escolhido, tenta localizar o texto digitado
document.addEventListener('focusout', e => {
  const input = e.target.closest && e.target.closest('[data-ac]');
  if (!input) return;
  const key = input.dataset.ac, st = get(key);
  setTimeout(() => {
    close(key);
    const text = input.value.trim();
    if (text && !Q.pts[key] && st.tried !== text) { st.tried = text; geocodeText(key); }
  }, 150);
});

