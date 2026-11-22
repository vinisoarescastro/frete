'use strict';
/* Alertas de validação e painel de resultados. */
import { S, Q } from './state.js';
import { $, esc, brl, kmf, pctf, litf, sgn } from './utils.js';
import { num } from './calc.js';

export function renderValidation(res){
  const map = {};
  res.errors.forEach(e => { if (e.key) map[e.key] = e.msg; });
  document.querySelectorAll('[data-s],[data-q]').forEach(el => {
    const key = (el.dataset.s !== undefined ? 's.' + el.dataset.s : 'q.' + el.dataset.q);
    const lab = el.closest('.f'); if (!lab) return;
    lab.classList.toggle('invalid', !!map[key]);
    const m = lab.querySelector('.msg'); if (m) m.textContent = map[key] || '';
  });

  const missing = [];
  if (!Q.pickup.trim()) missing.push('endereço de coleta');
  if (!Q.delivery.trim()) missing.push('endereço de entrega');
  const useEta = (Q.fuel || S.fuelType) === 'etanol';
  const needSetup = useEta ? (num(S.etaPrice) <= 0 || num(S.etaKmPerL) <= 0) : (num(S.gasPrice) <= 0 || num(S.kmPerL) <= 0);

  let html = '';
  if (res.errors.length) html += `<div class="al e"><b>Corrija para calcular:</b><ul>${res.errors.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul></div>`;
  if (needSetup) html += `<div class="al w">Complete o preço e o consumo médio do combustível em <a href="#" data-goto="set">Configurações</a> para um cálculo de combustível correto.</div>`;
  const w = res.warnings.slice();
  if (missing.length) w.push('Faltam informações para o orçamento: ' + missing.join(' e ') + '.');
  if ($('#geoNote').dataset.stale) w.push('Os endereços mudaram desde o último cálculo automático. Recalcule ou revise as distâncias.');
  if (w.length) html += `<div class="al w"><ul>${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  $('#alerts').innerHTML = html;
}

/* =========================================================
   PAINEL DE RESULTADOS
   ========================================================= */
export const MODE_NAME = { oneway: 'Somente ida', roundtrip: 'Ida e volta', multiple: 'Múltiplas viagens' };
const METHOD_NAME = { '1': 'Método 1 · Preço por km', '2': 'Método 2 · Custos detalhados' };

export function renderResults(res){
  const r = res.r;
  if (!r) {
    $('#hero').innerHTML = `<div class="hero"><div class="hl">Valor final a cobrar</div><div class="hv">Aguardando dados</div><div class="hs">Preencha os dados e corrija os avisos para ver o valor.</div></div>`;
    ['#mcards', '#kmTable', '#costTable'].forEach(s => $(s).innerHTML = '<p class="note">Aguardando dados válidos.</p>');
    return;
  }
  const f = r.fin, label = r.manualUsed ? 'Preço manual' : METHOD_NAME[r.chosen.id];
  $('#hero').innerHTML = `<div class="hero ${f.profit < 0 ? 'loss' : ''}">
    <div class="hl">Valor final a cobrar</div><div class="hv">${brl(r.price)}</div>
    <div class="hs">${esc(label)} · sugerido ${brl(r.suggested)}${r.discAmt > 0 && !r.manualUsed ? ` · desconto ${brl(r.discAmt)}` : ''}${r.diff !== 0 ? ` · diferença ${r.diff > 0 ? '+' : ''}${brl(r.diff)} (${pctf(r.diffPct)})` : ''}</div>
    <div class="chips"><span class="chip">Lucro ${brl(f.profit)}</span><span class="chip">Margem ${pctf(f.margin)}</span>${r.partial ? '<span class="chip warn">Estimativa parcial</span>' : ''}</div></div>`;

  // Cartões de comparação
  const card = (m, extra) => {
    const sel = r.chosen.id === m.id && true;
    if (!m.available) return `<div class="mcard ${sel ? 'sel' : ''}" data-method="${m.id}" tabindex="0" role="button"><div class="mh"><span class="rd"></span>${METHOD_NAME[m.id]}</div><p class="note">Informe o valor cobrado por km para usar este método.${Number.isFinite(r.reqRate) ? `<br>Para atingir a margem desejada: <b>${brl(r.reqRate)}/km</b>.` : ''}</p></div>`;
    return `<div class="mcard ${r.chosen.id === m.id ? 'sel' : ''}" data-method="${m.id}" tabindex="0" role="button" aria-pressed="${r.chosen.id === m.id}">
      <div class="mh"><span class="rd"></span>${METHOD_NAME[m.id]}</div>
      <table class="t"><tr><td>Custo estimado</td><td>${brl(r.c.total)}</td></tr>
      <tr><td>Margem efetiva<br><small>acréscimo s/ custo: ${m.markup == null ? 'n/d' : pctf(m.markup)}</small></td><td>${pctf(m.margin)}</td></tr>
      <tr><td>Lucro estimado</td><td class="${sgn(m.profit)}">${brl(m.profit)}</td></tr></table>
      <div class="big">${brl(m.price)}</div><small class="note">Preço sugerido${m.minApplied ? ' (mínimo aplicado)' : ''}</small>${extra || ''}</div>`;
  };
  $('#mcards').innerHTML = card(r.m1, Number.isFinite(r.reqRate) ? `<p class="note">Valor/km para a margem desejada: ${brl(r.reqRate)}</p>` : '') + card(r.m2);

  // Quilometragem
  const k = r.km, back = r.mode === 'roundtrip' ? 'Retorno à coleta' : 'Retornos intermediários';
  const fin = Q.finalDest === 'home' ? 'residência' : 'outro endereço';
  $('#kmTable').innerHTML = `<table class="t">
    <tr><td>Modalidade</td><td>${MODE_NAME[r.mode]}</td></tr>
    <tr><td>Quantidade de viagens</td><td>${k.trips}${r.mode === 'roundtrip' ? ' (ida e volta)' : ''}</td></tr>
    <tr><td>Deslocamento inicial <small>(residência para coleta)</small></td><td>${kmf(k.initial)}</td></tr>
    <tr><td>${k.trips} ${k.trips > 1 ? 'viagens' : 'viagem'} de ida <small>(${k.trips} × ${kmf(num(Q.pickupDelivery))})</small></td><td>${kmf(k.ida)}</td></tr>
    <tr><td>${back} <small>(${k.returns} × ${kmf(num(Q.deliveryPickup))})</small></td><td>${kmf(k.inter)}</td></tr>
    <tr><td>Retorno final <small>(${r.mode === 'roundtrip' ? 'coleta' : 'entrega'} para ${fin})</small></td><td>${kmf(k.final)}</td></tr>
    <tr class="tot"><td>Total</td><td>${kmf(k.total)}</td></tr></table>`;

  // Custos e resultado
  const c = r.c, pr = r.p, row = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td>${v}</td></tr>`;
  $('#costTable').innerHTML = `<table class="t">
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
