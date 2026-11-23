'use strict';
/* Persistência: servidor (SQLite) como fonte principal e localStorage como cópia para uso sem conexão. */
import { lsSet } from './utils.js';
import { KEY_S, KEY_Q } from './config.js';

async function req(path, opts = {}){
  const res = await fetch('/api' + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401) { location.href = '/login'; throw new Error('sessão expirada'); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** Estado salvo no servidor: { settings, draft } ou null se o servidor não respondeu. */
export async function loadRemote(){
  try { return await req('/state', { signal: AbortSignal.timeout(5000) }); } catch { return null; }
}

// O que já está salvo no servidor, para enviar só o que mudou
const last = { settings: '', draft: '' };
let refs = null, timer = 0;

export function initSaved(settings, draft){
  last.settings = settings ? JSON.stringify(settings) : '';
  last.draft = draft ? JSON.stringify(draft) : '';
}

function showState(text, state){
  const el = document.querySelector('#saveState');
  if (el) { el.textContent = text; el.dataset.state = state; }
}

async function flush(){
  if (!refs) return;
  const s = JSON.stringify(refs.S), d = JSON.stringify(refs.Q);
  if (s === last.settings && d === last.draft) return;
  try {
    if (s !== last.settings) { await req('/settings', { method: 'PUT', body: s, keepalive: true }); last.settings = s; }
    if (d !== last.draft) { await req('/draft', { method: 'PUT', body: d, keepalive: true }); last.draft = d; }
    showState('Salvo', 'ok');
  } catch { showState('Sem conexão. Salvo só neste aparelho.', 'warn'); }
}

/** Chamado a cada alteração: guarda uma cópia local e agenda o envio ao servidor. */
export function persist(S, Q){
  refs = { S, Q };
  lsSet(KEY_S, S); lsSet(KEY_Q, Q);
  if (JSON.stringify(S) === last.settings && JSON.stringify(Q) === last.draft) return;
  showState('Salvando...', 'busy');
  clearTimeout(timer); timer = setTimeout(flush, 700);
}

// Ao sair da página ou trocar de aba, envia na hora
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); flush(); } });
window.addEventListener('pagehide', () => { clearTimeout(timer); flush(); });

/* Histórico de orçamentos */
export const listQuotes = () => req('/quotes?limit=15');
export const getQuote = id => req('/quotes/' + id);
export const deleteQuote = id => req('/quotes/' + id, { method: 'DELETE' });
export const saveQuote = (id, body) => req(id ? '/quotes/' + id : '/quotes', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
