'use strict';
/* Alertas de validação e painel de resultados. */
import { S, Q } from './state.js';
import { $, esc, brl, kmf, pctf, litf, sgn, icon } from './utils.js';
import { num } from './calc.js';

const TONE_ICON = { danger: 'circle-alert', warning: 'triangle-alert' };
const alertBox = (tone, title, body) => `<div class="ds-alert ds-alert--${tone}" role="${tone === 'danger' ? 'alert' : 'status'}"><span class="ds-alert__icon-wrap">${icon(TONE_ICON[tone], 'icon')}</span><div class="ds-alert__body">${title ? `<div class="ds-alert__title">${title}</div>` : ''}<div class="ds-alert__text">${body}</div></div></div>`;

export function renderValidation(res){
  const map = {};
  res.errors.forEach(e => { if (e.key) map[e.key] = e.msg; });
  document.querySelectorAll('[data-s],[data-q]').forEach(el => {
    const key = (el.dataset.s !== undefined ? 's.' + el.dataset.s : 'q.' + el.dataset.q);
    const field = el.closest('.ds-field'); if (!field) return;
    const m = field.querySelector('.msg');
    if (map[key]) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    if (m) { m.textContent = map[key] || ''; m.hidden = !map[key]; }
  });

  const missing = [];
  if (!Q.pickup.trim()) missing.push('endereço de coleta');
  if (!Q.delivery.trim()) missing.push('endereço de entrega');
  const useEta = (Q.fuel || S.fuelType) === 'etanol';
  const needSetup = useEta ? (num(S.etaPrice) <= 0 || num(S.etaKmPerL) <= 0) : (num(S.gasPrice) <= 0 || num(S.kmPerL) <= 0);

  let html = '';
  if (res.errors.length) html += alertBox('danger', 'Corrija para calcular', `<ul>${res.errors.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul>`);
  if (needSetup) html += alertBox('warning', '', 'Complete o preço e o consumo médio do combustível em <a href="#/configuracoes">Configurações</a> para um cálculo de combustível correto.');
  const w = res.warnings.slice();
  if (missing.length) w.push('Faltam informações para o orçamento: ' + missing.join(' e ') + '.');
  if ($('#geoNote').dataset.stale) w.push('Os endereços mudaram desde o último cálculo automático. Recalcule ou revise as distâncias.');
  if (w.length) html += alertBox('warning', '', `<ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  $('#alerts').innerHTML = html;
}

/* =========================================================
   PAINEL DE RESULTADOS
   ========================================================= */
export const MODE_NAME = { oneway: 'Somente ida', roundtrip: 'Ida e volta', multiple: 'Múltiplas viagens' };
const METHOD_NAME = { '1': 'Método 1: preço por km', '2': 'Método 2: custos e margem' };

export function renderResults(res){
  const r = res.r;
  if (!r) {
    $('#hero').innerHTML = `<div class="ds-card ds-card--gradient ds-kpi"><div class="ds-kpi__top"><span class="ds-kpi__label">Valor a cobrar</span></div><div class="ds-kpi__main"><span class="t-value">R$ 0,00</span></div><div class="kpi-notes">Informe o trajeto e as distâncias para calcular.</div></div>`;
    $('#barPrice').textContent = 'Aguardando dados';
    ['#mcards', '#kmTable', '#costTable'].forEach(s => $(s).innerHTML = '<p class="note">Aguardando dados válidos.</p>');
    return;
  }
  const f = r.fin, label = r.manualUsed ? 'Preço manual' : METHOD_NAME[r.chosen.id];
  const notes = [esc(label), `sugerido ${brl(r.suggested)}`];
  if (r.discAmt > 0 && !r.manualUsed) notes.push(`desconto ${brl(r.discAmt)}`);
  if (r.diff !== 0) notes.push(`diferença ${r.diff > 0 ? '+' : ''}${brl(r.diff)} (${pctf(r.diffPct)})`);
  $('#hero').innerHTML = `<div class="ds-card ds-card--gradient ds-kpi ${f.profit < 0 ? 'is-loss' : ''}">
    <div class="ds-kpi__top"><span class="ds-kpi__label">Valor a cobrar</span></div>
    <div class="ds-kpi__main"><span class="t-value">${brl(r.price)}</span></div>
    <div class="kpi-notes">${notes.join(', ')}</div>
    <div class="kpi-chips"><span class="ds-trend">Lucro ${brl(f.profit)}</span><span class="ds-trend">Margem ${pctf(f.margin)}</span>${r.partial ? '<span class="ds-trend">Estimativa parcial</span>' : ''}</div></div>`;
  $('#barPrice').textContent = brl(r.price);

  // Escolha do método (cartões de opção do design system)
  const option = (m, desc, disabled) => `<label class="ds-option"><input class="ds-option__input" type="radio" name="method" value="${m.id}" data-method="${m.id}" ${r.chosen.id === m.id ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="ds-option__text"><span class="ds-option__title">${METHOD_NAME[m.id]}</span><span class="ds-option__desc">${desc}</span></span><span class="ds-option__mark ds-option__mark--radio" aria-hidden="true"></span></label>`;
  const m1desc = r.m1.available
    ? `Sugerido <b>${brl(r.m1.price)}</b>, margem ${pctf(r.m1.margin)}, lucro ${brl(r.m1.profit)}${Number.isFinite(r.reqRate) ? `. Valor por km para a margem desejada: ${brl(r.reqRate)}.` : ''}`
    : `Informe o valor cobrado por km para usar este método.${Number.isFinite(r.reqRate) ? ` Para atingir a margem desejada: <b>${brl(r.reqRate)}/km</b>.` : ''}`;
  const m2desc = `Sugerido <b>${brl(r.m2.price)}</b>${r.m2.minApplied ? ' (mínimo aplicado)' : ''}, margem ${pctf(r.m2.margin)}, lucro ${brl(r.m2.profit)}`;
  $('#mcards').innerHTML = option(r.m1, m1desc, !r.m1.available) + option(r.m2, m2desc, false);

  // Quilometragem
  const k = r.km, back = r.mode === 'roundtrip' ? 'Retorno à coleta' : 'Retornos intermediários';
  const fin = Q.finalDest === 'home' ? 'residência' : 'outro endereço';
  $('#kmTable').innerHTML = `<table class="ds-table kv">
    <tr><td>Modalidade</td><td>${MODE_NAME[r.mode]}</td></tr>
    <tr><td>Quantidade de viagens</td><td>${k.trips}${r.mode === 'roundtrip' ? ' (ida e volta)' : ''}</td></tr>
    <tr><td>Deslocamento inicial <small>(residência para coleta)</small></td><td>${kmf(k.initial)}</td></tr>
    <tr><td>${k.trips} ${k.trips > 1 ? 'viagens' : 'viagem'} de ida <small>(${k.trips} × ${kmf(num(Q.pickupDelivery))})</small></td><td>${kmf(k.ida)}</td></tr>
    <tr><td>${back} <small>(${k.returns} × ${kmf(num(Q.deliveryPickup))})</small></td><td>${kmf(k.inter)}</td></tr>
    <tr><td>Retorno final <small>(${r.mode === 'roundtrip' ? 'coleta' : 'entrega'} para ${fin})</small></td><td>${kmf(k.final)}</td></tr>
    <tr class="tot"><td>Total</td><td>${kmf(k.total)}</td></tr></table>`;

  // Custos e resultado
  const c = r.c, pr = r.p, row = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td>${v}</td></tr>`;
  $('#costTable').innerHTML = `<table class="ds-table kv">
    ${row('Consumo estimado de combustível', litf(c.fuelL))}
    ${row('Combustível (' + r.fuelName + ')', brl(c.fuel), 'sub')}${row('Manutenção', brl(c.maint), 'sub')}${row('Pneus', brl(c.tires), 'sub')}
    ${row('Depreciação', brl(c.deprec), 'sub')}${row('Outros custos operacionais', brl(c.otherKm), 'sub')}
    ${row('Custo operacional total', brl(c.op), 'sum')}
    ${row('Pedágios', brl(c.tolls), 'sub')}${row('Estacionamento', brl(c.parking), 'sub')}${row('Alimentação', brl(c.food), 'sub')}
    ${row('Outras despesas', brl(c.otherExp), 'sub')}${row('Mão de obra', brl(c.labor), 'sub')}
    ${row('Despesas adicionais', brl(c.extras), 'sum')}
    ${row('Custo total', brl(c.total), 'sum')}
    ${row('Valor final cobrado', brl(r.price))}
    ${pr.tax > 0 ? row(`Taxas sobre a venda (${pctf(pr.tax)})`, '-' + brl(f.taxes), 'sub') : ''}
    ${row('Lucro estimado' + (r.partial ? ' <small>(parcial)</small>' : ''), `<span class="${sgn(f.profit)}">${brl(f.profit)}</span>`, 'sum')}
    ${row('Margem efetiva <small>(lucro ÷ preço)</small>', pctf(f.margin))}
    ${row('Acréscimo sobre o custo <small>(lucro ÷ custo)</small>', f.markup == null ? 'n/d' : pctf(f.markup))}
    ${row('Margem de lucro aplicada (desejada)', pctf(pr.margin))}
    ${r.cardPrice ? row(`Valor no cartão <small>(taxa ${pctf(pr.cardFee)})</small>`, brl(r.cardPrice)) : ''}
    ${row('Sugerido × negociado', `${brl(r.suggested)} para ${brl(r.price)} <small>(${r.diff > 0 ? '+' : ''}${brl(r.diff)})</small>`)}
    </table>`;
}
