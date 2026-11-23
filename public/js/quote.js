'use strict';
/* Orçamento para o cliente (sem dados internos): visualização, texto, WhatsApp e PDF. */
import { S, Q, app } from './state.js';
import { $, esc, brl, pctf, today, fmtDate, toast } from './utils.js';
import { num, round2 } from './calc.js';
import { MODE_NAME } from './render.js';
import { buildPdf } from './pdf.js';
import { rememberQuote } from './recent.js';

export function quoteData(){
  const r = app.last && app.last.r;
  const trips = Q.mode === 'multiple' ? String(num(Q.trips) || '') : (Q.mode === 'roundtrip' ? '1 (ida e volta)' : '1');
  const v = Math.floor(num(S.validityDays)) || 0;
  const exp = new Date(); exp.setDate(exp.getDate() + v);
  const expIso = new Date(exp.getTime() - exp.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  // Desconto mostrado ao cliente: diferença entre o valor sugerido e o valor final (desconto ou preço negociado menor)
  const disc = r ? round2(r.suggested - r.price) : 0;
  return {
    provider: S.providerName.trim(), providerPhone: S.providerPhone.trim(),
    issue: fmtDate(today()), client: Q.clientName.trim(), phone: Q.clientPhone.trim(),
    service: Q.serviceType, desc: Q.desc.trim(), pickup: Q.pickup.trim(), delivery: Q.delivery.trim(),
    mode: MODE_NAME[Q.mode], trips, date: fmtDate(Q.date), notes: Q.notes.trim(),
    price: r ? r.price : null, card: r ? r.cardPrice : null,
    base: r ? r.suggested : null, disc: disc > 0.004 ? disc : 0, discPct: r && r.suggested > 0 && disc > 0.004 ? disc / r.suggested * 100 : 0,
    notice: (S.quoteNotice || '').trim(), validity: v, validUntil: v > 0 ? fmtDate(expIso) : ''
  };
}

// Layout em tabelas para a pré-visualização. Não expõe custos, margem ou lucro.
export function quoteHTML(){
  const d = quoteData();
  const tbl = (title, rows) => {
    rows = rows.filter(x => x[1]);
    return rows.length ? `<table><tr><th colspan="2">${title}</th></tr>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : '';
  };
  const money = [];
  if (d.disc > 0) {
    money.push(`<tr><td>Valor do serviço</td><td class="r">${brl(d.base)}</td></tr>`);
    money.push(`<tr class="disc"><td>Desconto (${pctf(d.discPct)})</td><td class="r">-${brl(d.disc)}</td></tr>`);
  }
  money.push(`<tr class="tot"><td>Total à vista (Pix ou dinheiro)</td><td class="r">${d.price == null ? 'n/d' : brl(d.price)}</td></tr>`);
  if (d.card) money.push(`<tr><td>Total no cartão de crédito</td><td class="r">${brl(d.card)}</td></tr>`);
  return `<div class="qdoc">
    <div class="qh"><div><div class="qbrand">${esc(d.provider || 'Serviços de Frete')}</div>${d.providerPhone ? `<div class="qsub">${esc(d.providerPhone)}</div>` : ''}</div>
      <div class="qtitle"><h2>Orçamento de frete</h2><div class="qsub">Data: ${d.issue}</div></div></div>
    ${tbl('Cliente e serviço', [['Cliente', d.client], ['Telefone', d.phone], ['Tipo de serviço', d.service], ['Descrição', d.desc], ['Data prevista', d.date]])}
    ${tbl('Trajeto', [['Endereço de coleta', d.pickup], ['Endereço de entrega', d.delivery], ['Modalidade', d.mode], ['Quantidade de viagens', d.trips]])}
    <table><tr><th colspan="2">Valores</th></tr>${money.join('')}</table>
    ${tbl('Observações', [['Observações', d.notes]])}
    ${d.notice ? `<p class="qsub"><b>Importante:</b> ${esc(d.notice)}</p>` : ''}
    <div class="qfoot">${d.validity ? `Orçamento válido por ${d.validity} ${d.validity > 1 ? 'dias' : 'dia'} (até ${d.validUntil}).` : ''}</div></div>`;
}

// Endereço resumido para a mensagem: sem CEP, país nem região
const shortAddr = a => String(a || '').split(',').map(x => x.trim()).filter(x => x && !/^\d{5}-?\d{3}$/.test(x) && !/^brasil$/i.test(x) && !/^região/i.test(x)).join(', ');

// Texto para WhatsApp (negrito com *...*) ou texto simples. Sem dados de quem presta o serviço.
function quoteText(wa){
  const d = quoteData(), L = [], b = t => wa ? `*${t}*` : t;
  L.push(b('Orçamento de frete'), '');
  const first = d.client.split(/\s+/)[0];
  L.push(first ? `Olá, ${first}! Segue o orçamento do seu frete.` : 'Segue o orçamento do seu frete.', '');
  const kv = (k, v) => { if (v) L.push(`${b(k + ':')} ${v}`); };
  kv('Descrição', d.desc); kv('Coleta', shortAddr(d.pickup)); kv('Entrega', shortAddr(d.delivery)); kv('Data prevista', d.date);
  L.push('');
  if (d.disc > 0) L.push(`Valor do serviço: ${brl(d.base)}`, `Desconto (${pctf(d.discPct)}): -${brl(d.disc)}`);
  L.push(`${b('Valor:')} ${brl(d.price)}`, '', b('Formas de pagamento'), `Pix ou dinheiro: ${brl(d.price)}`);
  if (d.card) L.push(`Cartão de crédito: ${brl(d.card)}`);
  if (d.notes) L.push('', `${b('Observações:')} ${d.notes}`);
  if (d.notice) L.push('', `${b('Importante:')} ${d.notice}`);
  if (d.validity) L.push('', wa ? `_Válido até ${d.validUntil}._` : `Válido até ${d.validUntil}.`);
  return L.join('\n');
}

// Valida o mínimo necessário antes de entregar o orçamento ao cliente
export function quoteReady(){
  if (!app.last || !app.last.r) { toast('Corrija os erros de cálculo antes de enviar o orçamento.', 'warning'); return false; }
  if (!Q.pickup.trim() || !Q.delivery.trim()) { toast('Informe os endereços de coleta e entrega.', 'warning'); return false; }
  if (!(app.last.r.price > 0)) { toast('O valor do orçamento está zerado.', 'warning'); return false; }
  return true;
}

async function copyToClipboard(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* sem suporte */ }
    ta.remove(); return ok;
  }
}

/** Copia o texto simples (sem formatação do WhatsApp). */
export async function copyText(){
  if (!quoteReady()) return;
  if (await copyToClipboard(quoteText(false))) { toast('Texto copiado.'); rememberQuote(); }
  else toast('Não foi possível copiar. Selecione o texto manualmente.', 'danger');
}

const digits = s => String(s || '').replace(/\D/g, '');

/** Link do WhatsApp: abre a conversa com o cliente se houver telefone válido; senão, o WhatsApp pede o contato. */
export function whatsappUrl(){
  let phone = digits(Q.clientPhone);
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;   // DDD + número: acrescenta o Brasil
  if (phone.length < 12 || phone.length > 13) phone = '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(quoteText(true))}`;
}

export function sendWhatsApp(){
  if (!quoteReady()) return;
  window.open(whatsappUrl(), '_blank', 'noopener');   // direto no clique, para o navegador não bloquear
  rememberQuote();
}

/** Gera o PDF. No celular abre o menu de compartilhar (WhatsApp, e-mail...); no computador baixa o arquivo. */
export async function savePdf(){
  if (!quoteReady()) return;
  if (!window.jspdf) { toast('Não foi possível gerar o PDF agora. Recarregue a página.', 'danger'); return; }
  try {
    const d = quoteData();
    const base = (d.client || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'cliente';
    const file = new File([buildPdf(d)], `orcamento-${base}.pdf`, { type: 'application/pdf' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Orçamento de frete' }); }
      catch (e) { if (e.name === 'AbortError') return; throw e; }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('PDF gerado.');
    }
    rememberQuote();
  } catch { toast('Não foi possível gerar o PDF.', 'danger'); }
}
