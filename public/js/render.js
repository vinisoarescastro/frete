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
    if (map[key]) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    const m = el.closest('.ds-field')?.querySelector('.msg');
    if (m) { m.textContent = map[key] || ''; m.hidden = !map[key]; }
  });

  const useEta = (Q.fuel || S.fuelType) === 'etanol';
  const needSetup = useEta ? (num(S.etaPrice) <= 0 || num(S.etaKmPerL) <= 0) : (num(S.gasPrice) <= 0 || num(S.kmPerL) <= 0);

  let html = '';
  const shown = res.errors.filter(e => e.key);   // o aviso genérico de "informe as quilometragens" fica por conta do resumo
  if (shown.length) html += alertBox('danger', 'Corrija para calcular', `<ul>${shown.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul>`);
  if (needSetup) html += alertBox('warning', '', 'Complete o preço e o consumo médio do combustível em <a href="#/configuracoes">Configurações</a> para um cálculo de combustível correto.');
  const w = res.warnings.slice();
  if (w.length) html += alertBox('warning', '', `<ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  $('#alerts').innerHTML = html;
}

/* =========================================================
   PAINEL DE RESULTADOS
   ========================================================= */
export const MODE_NAME = { oneway: 'Somente ida', roundtrip: 'Ida e volta', multiple: 'Múltiplas viagens' };
const METHOD_NAME = { '1': 'Método 1: preço por km', '2': 'Método 2: custos e margem' };

/* Composição do valor cobrado: para onde vai cada real do preço */
function composition(r){
  const c = r.c, f = r.fin;
  const items = [
    ['Combustível', c.fuel, 'c1'],
    ['Manutenção e desgaste', c.maint + c.tires + c.deprec + c.otherKm, 'c2'],
    ['Pedágios e despesas', c.reimb, 'c3'],
    ['Mão de obra', c.labor, 'c4'],
    ['Taxas sobre a venda', f.taxes, 'c5'],
    [f.profit < 0 ? 'Prejuízo' : 'Lucro', f.profit, f.profit < 0 ? 'loss' : 'profit']
  ].filter(([, v]) => Math.abs(v) >= 0.005);
  const pos = items.filter(([, v]) => v > 0), tot = pos.reduce((a, [, v]) => a + v, 0) || 1;
  const bar = pos.map(([l, v, k]) => `<span class="seg-${k}" style="flex:${(v / tot).toFixed(4)}" title="${l}"></span>`).join('');
  const rows = items.map(([l, v, k]) => `<li><span class="dot seg-${k}"></span><span class="lb">${l}</span><span class="vl">${brl(v)}</span><span class="pc">${r.price > 0 ? pctf(v / r.price * 100) : ''}</span></li>`).join('');
  return `<div class="hero-bar" aria-hidden="true">${bar}</div><ul class="hero-comp" aria-label="Composição do valor">${rows}</ul>`;
}

export function renderResults(res){
  const r = res.r;
  if (!r) {
    $('#hero').innerHTML = `<div class="ds-card hero"><div class="hero__label">Valor a cobrar</div><div class="hero__price">R$ 0,00</div><p class="hero__note">Informe a coleta e a entrega para calcular.</p></div>`;
    $('#barPrice').textContent = 'Aguardando dados';
    ['#kmTable', '#costTable'].forEach(s => $(s).innerHTML = '<p class="note">Aguardando dados válidos.</p>');
    return;
  }
  const f = r.fin;
  const notes = [];
  if (r.manualUsed) notes.push(`preço manual (sugerido ${brl(r.suggested)})`);
  else if (r.discAmt > 0) notes.push(`desconto de ${brl(r.discAmt)} sobre ${brl(r.suggested)}`);
  $('#hero').innerHTML = `<div class="ds-card hero ${f.profit < 0 ? 'is-loss' : ''}">
    <div class="hero__label">Valor a cobrar</div>
    <div class="hero__price">${brl(r.price)}</div>
    ${notes.length ? `<p class="hero__note">${notes.join(', ')}</p>` : ''}
    <div class="hero__chips"><span class="chip ${f.profit < 0 ? 'chip--loss' : 'chip--ok'}">Lucro ${brl(f.profit)}</span><span class="chip">Margem ${pctf(f.margin)}</span>${r.partial ? '<span class="chip chip--warn">Estimativa parcial</span>' : ''}</div>
    ${composition(r)}</div>`;
  $('#barPrice').textContent = brl(r.price);

  // Método de cálculo: a escolha fica no seletor; aqui só uma linha de apoio
  $('#methodHint').textContent = r.auto
    ? `Usa o maior valor entre os dois métodos. Agora: ${METHOD_NAME[r.chosen.id]}.`
    : (Q.method === '1' && !r.m1.available ? 'Informe o valor por km em Configurações para usar este método.' : `${METHOD_NAME[r.chosen.id]}.`);

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
