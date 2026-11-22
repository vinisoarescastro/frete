'use strict';
/* Orçamento para o cliente (sem dados internos): visualização, texto, imagem e impressão. */
import { S, Q, app } from './state.js';
import { $, esc, brl, pctf, today, fmtDate, toast } from './utils.js';
import { num, round2 } from './calc.js';
import { MODE_NAME } from './render.js';

function quoteData(){
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
    validity: v, validUntil: v > 0 ? fmtDate(expIso) : ''
  };
}

// Layout em tabelas (tela, impressão/PDF e imagem). Não expõe custos, margem ou lucro.
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
    <div class="qfoot">${d.validity ? `Orçamento válido por ${d.validity} ${d.validity > 1 ? 'dias' : 'dia'} (até ${d.validUntil}).` : ''}</div></div>`;
}

// Texto para WhatsApp (negrito com *...*) ou texto simples
function quoteText(wa){
  const d = quoteData(), L = [], b = t => wa ? `*${t}*` : t;
  L.push(b('ORÇAMENTO DE FRETE'));
  if (d.provider || d.providerPhone) L.push([d.provider, d.providerPhone].filter(Boolean).join(' | '));
  L.push(`Data: ${d.issue}`, '');
  const kv = (k, v) => { if (v) L.push(`${b(k + ':')} ${v}`); };
  kv('Cliente', d.client); kv('Telefone', d.phone); kv('Serviço', d.service); kv('Descrição', d.desc);
  kv('Coleta', d.pickup); kv('Entrega', d.delivery); kv('Modalidade', d.mode); kv('Viagens', d.trips); kv('Data prevista', d.date);
  L.push('', b('VALORES'));
  if (d.disc > 0) { L.push(`Valor do serviço: ${brl(d.base)}`, `Desconto (${pctf(d.discPct)}): -${brl(d.disc)}`); }
  L.push(b(`Total à vista (Pix ou dinheiro): ${brl(d.price)}`));
  if (d.card) L.push(b(`Total no cartão de crédito: ${brl(d.card)}`));
  if (d.notes) L.push('', `${b('Observações:')} ${d.notes}`);
  if (d.validity) L.push('', wa ? `_Orçamento válido por ${d.validity} ${d.validity > 1 ? 'dias' : 'dia'} (até ${d.validUntil})._` : `Orçamento válido por ${d.validity} ${d.validity > 1 ? 'dias' : 'dia'} (até ${d.validUntil}).`);
  return L.join('\n');
}

// Valida o mínimo necessário antes de entregar o orçamento ao cliente
function quoteReady(){
  if (!app.last || !app.last.r) { toast('Corrija os erros de cálculo antes de gerar o orçamento.'); return false; }
  if (!Q.pickup.trim() || !Q.delivery.trim()) { toast('Informe os endereços de coleta e entrega.'); return false; }
  if (!(app.last.r.price > 0)) { toast('O valor do orçamento está zerado.'); return false; }
  return true;
}

export async function copyQuote(wa){
  if (!quoteReady()) return;
  const text = quoteText(wa);
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); if (!ok) { toast('Não foi possível copiar. Selecione o texto manualmente.'); return; }
  }
  toast(wa ? 'Texto para WhatsApp copiado.' : 'Texto copiado.');
}
// Gera imagem PNG do orçamento (SVG com foreignObject desenhado em canvas)
export function saveImage(){
  if (!quoteReady()) return;
  const css = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch { return []; } })
    .filter(r => r.selectorText && r.selectorText.includes('.qdoc')).map(r => r.cssText).join('\n');
  const W = 760, holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-9999px;top:0;width:${W}px`;
  holder.innerHTML = quoteHTML();
  const el = holder.firstElementChild; el.style.width = W + 'px'; el.style.boxShadow = 'none'; el.style.borderRadius = '0';
  document.body.appendChild(holder);
  const H = el.offsetHeight, xhtml = new XMLSerializer().serializeToString(el);
  holder.remove();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas'), k = 2; c.width = W * k; c.height = H * k;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(k, k); g.drawImage(img, 0, 0);
      c.toBlob(blob => {
        if (!blob) { toast('Não foi possível gerar a imagem. Use "Salvar em PDF".'); return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'orcamento-frete.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('Imagem salva.');
      }, 'image/png');
    } catch { toast('Não foi possível gerar a imagem. Use "Salvar em PDF".'); }
  };
  img.onerror = () => toast('Não foi possível gerar a imagem. Use "Salvar em PDF".');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export function printQuote(pdf){
  if (!quoteReady()) return;
  if (pdf) toast('Na janela de impressão, escolha "Salvar como PDF".');
  setTimeout(() => window.print(), pdf ? 600 : 0);
}
