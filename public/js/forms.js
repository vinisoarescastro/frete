'use strict';
/* Formulários gerados por configuração e ligação entre campos e estado. */
import { S, Q, app, update } from './state.js';
import { $, icon, kmf } from './utils.js';

export function field(scope, key, label, o = {}){
  const attr = scope === 's' ? 'data-s' : 'data-q';
  const type = o.type || 'number';
  let control;
  if (type === 'textarea') control = `<textarea class="ds-control" ${attr}="${key}" rows="${o.rows || 3}" placeholder="${o.ph || ''}"></textarea>`;
  else if (type === 'select') control = `<div class="ds-input-wrap"><select class="ds-control" ${attr}="${key}">${o.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>${icon('chevron-down', 'icon ds-input-wrap__end')}</div>`;
  else {
    const input = `<input class="ds-control" ${attr}="${key}" type="${type}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} placeholder="${o.ph || ''}" autocomplete="off">`;
    control = o.pre || o.suf
      ? `<div class="ds-group">${o.pre ? `<span class="ds-group__addon ds-group__addon--start">${o.pre}</span>` : ''}${input}${o.suf ? `<span class="ds-group__addon ds-group__addon--end">${o.suf}</span>` : ''}</div>`
      : input;
  }
  const hint = o.hint ? `<p class="ds-help">${o.hint}</p>` : '';
  return `<label class="ds-field ${o.cls || ''}"><span class="ds-label">${label}</span>${control}${hint}<p class="ds-error msg" hidden></p></label>`;
}
const R$ = { pre: 'R$' }, KM = { suf: 'km' }, PC = { suf: '%' };

export function buildForms(){
  $('#secDados').innerHTML = [
    field('q', 'clientName', 'Nome', { type: 'text', ph: 'Opcional' }),
    field('q', 'clientPhone', 'WhatsApp', { type: 'tel', ph: '(00) 00000-0000' })
  ].join('');
  $('#secDadosMais').innerHTML = [
    field('q', 'serviceType', 'Tipo de serviço', { type: 'select', options: ['Frete', 'Entrega', 'Mudança', 'Transporte de mercadorias', 'Outros'].map(x => [x, x]) }),
    field('q', 'date', 'Data prevista', { type: 'date' }),
    field('q', 'desc', 'Descrição da carga ou serviço', { type: 'textarea', cls: 'span2' }),
    field('q', 'notes', 'Observações para o cliente', { type: 'textarea', cls: 'span2' })
  ].join('');

  const rows = [
    ['homePickup', 'Residência até a coleta', 'always'],
    ['pickupDelivery', 'Coleta até a entrega (cada ida)', 'always'],
    ['deliveryPickup', 'Entrega até a coleta (volta)', 'roundtrip,multiple'],
    ['deliveryFinal', 'Entrega até o destino final', 'oneway,multiple'],
    ['pickupFinal', 'Coleta até o destino final', 'roundtrip']
  ];
  $('#dRows').innerHTML = rows.map(([k, l, m]) => `<div class="drow" data-key="${k}" data-modes="${m}">
    <label class="drow__label" for="d-${k}"><span data-lbl>${l}</span><span class="ds-badge ds-badge--sm hidden" data-tag></span></label>
    <button class="ds-btn ds-btn--ghost ds-btn--sm hidden" type="button" data-reset title="Voltar a copiar o trecho inverso">Restaurar</button>
    <span class="drow__val"><input class="km-input" id="d-${k}" data-q="${k}" type="number" step="any" inputmode="decimal" placeholder="0" autocomplete="off"><span class="km-unit">km</span></span></div>`).join('');

  $('#secDesp').innerHTML = [
    field('q', 'tolls', 'Pedágios', R$), field('q', 'parking', 'Estacionamento', R$),
    field('q', 'food', 'Alimentação', R$), field('q', 'otherExp', 'Outras despesas (ajudante, etc.)', R$),
    field('q', 'hours', 'Horas de trabalho', { suf: 'h', hint: 'Multiplicadas pelo valor da hora e somadas ao custo.' }),
    field('s', 'laborRate', 'Valor da hora', { ...R$, suf: '/h' }),
    field('q', 'fuel', 'Combustível deste serviço', { type: 'select', cls: 'span2', options: [['', 'Padrão das Configurações'], ['gasolina', 'Gasolina'], ['etanol', 'Etanol']] })
  ].join('');

  $('#secPreco').innerHTML = [
    field('q', 'discType', 'Tipo de desconto', { type: 'select', options: [['pct', 'Percentual (%)'], ['val', 'Valor (R$)']] }),
    field('q', 'discount', 'Desconto ao cliente'),
    field('q', 'manual', 'Preço final manual', { ...R$, cls: 'span2', hint: 'Substitui o valor sugerido. Lucro e margem são recalculados.' })
  ].join('');
  $('#secPrecoMais').innerHTML = [
    field('s', 'margin', 'Margem de lucro', { ...PC, hint: 'Lucro dividido pelo preço de venda.' }),
    field('s', 'tax', 'Taxas sobre a venda', { ...PC, hint: 'Impostos, em % do preço.' }),
    field('s', 'ratePerKm', 'Valor por km (Método 1)', { ...R$, suf: '/km' }),
    field('s', 'minCharge', 'Frete mínimo', R$)
  ].join('');

  $('#setEnd').innerHTML = [
    field('s', 'providerName', 'Seu nome ou empresa', { type: 'text' }),
    field('s', 'providerPhone', 'Seu telefone', { type: 'tel' }),
    field('s', 'home', 'Endereço residencial', { type: 'text', cls: 'span2', hint: 'Ponto de partida e de retorno.' }),
    field('s', 'validityDays', 'Validade do orçamento', { suf: 'dias' })
  ].join('');
  $('#setVei').innerHTML = [
    field('s', 'vehicleType', 'Tipo de veículo', { type: 'text' }),
    field('s', 'fuelType', 'Combustível padrão', { type: 'select', cls: 'span2', options: [['gasolina', 'Gasolina'], ['etanol', 'Etanol']] }),
    field('s', 'gasPrice', 'Gasolina: preço', { ...R$, suf: '/L' }),
    field('s', 'kmPerL', 'Gasolina: consumo médio', { suf: 'km/L' }),
    field('s', 'etaPrice', 'Etanol: preço', { ...R$, suf: '/L' }),
    field('s', 'etaKmPerL', 'Etanol: consumo médio', { suf: 'km/L' })
  ].join('');
  $('#setKm').innerHTML = [
    field('s', 'costMaint', 'Manutenção', { ...R$, suf: '/km' }), field('s', 'costTires', 'Pneus', { ...R$, suf: '/km' }),
    field('s', 'costDeprec', 'Depreciação', { ...R$, suf: '/km' }), field('s', 'costOther', 'Outros custos operacionais', { ...R$, suf: '/km' })
  ].join('');
  $('#setDesp').innerHTML = [
    field('s', 'defTolls', 'Pedágios', R$), field('s', 'defParking', 'Estacionamento', R$),
    field('s', 'defFood', 'Alimentação', R$), field('s', 'defOther', 'Outras despesas', R$),
    field('s', 'laborRate', 'Valor da hora de trabalho', { ...R$, suf: '/h', cls: 'span2' })
  ].join('');
  $('#setLucro').innerHTML = [
    field('s', 'minCharge', 'Frete mínimo', { ...R$, cls: 'span2', hint: 'Valor mais baixo que você aceita cobrar por um serviço.' }),
    field('s', 'margin', 'Margem de lucro', PC),
    field('s', 'ratePerKm', 'Valor por km', { ...R$, suf: '/km' })
  ].join('');
  $('#setLucroMais').innerHTML = [
    field('s', 'tax', 'Taxas sobre a venda', PC),
    field('s', 'cardFee', 'Taxa do cartão', { ...PC, hint: 'Acrescida ao valor no cartão.' }),
    field('s', 'rounding', 'Arredondar para cima', { type: 'select', cls: 'span2', options: [['0', 'Não arredondar'], ['1', 'Próximo R$ 1'], ['5', 'Próximo R$ 5'], ['10', 'Próximo R$ 10']] })
  ].join('');
}

export const MIRROR_KEYS = ['deliveryPickup', 'pickupFinal'];

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.s !== undefined) S[t.dataset.s] = t.value;
  else if (t.dataset.q !== undefined) {
    if (t.type === 'radio' && !t.checked) return;
    Q[t.dataset.q] = t.value;
    if (MIRROR_KEYS.includes(t.dataset.q)) Q.touched[t.dataset.q] = true;
  } else return;
  update();
});

// Trechos "espelhados": retorno à coleta = ida; coleta para casa = casa para coleta (até o usuário editar)
export function applyMirrors(){
  if (!Q.touched.deliveryPickup) Q.deliveryPickup = Q.pickupDelivery;
  if (!Q.touched.pickupFinal && Q.finalDest === 'home') Q.pickupFinal = Q.homePickup;
}

export function syncInputs(){
  document.querySelectorAll('[data-s],[data-q]').forEach(el => {
    const src = el.dataset.s !== undefined ? S : Q;
    const key = el.dataset.s !== undefined ? el.dataset.s : el.dataset.q;
    if (el.type === 'radio') { el.checked = src[key] === el.value; return; }
    if (el === document.activeElement) return;
    const v = src[key] ?? '';
    if (el.value !== String(v)) el.value = v;
  });
}

export const finalAddress = () => Q.finalDest === 'home' ? S.home : Q.finalAddr;
const DIST_KEYS = ['homePickup', 'pickupDelivery', 'deliveryPickup', 'deliveryFinal', 'pickupFinal'];

export function renderRoute(){
  const mode = Q.mode;
  $('#tripsBox').classList.toggle('hidden', mode !== 'multiple');
  $('#finalAddrBox').classList.toggle('hidden', Q.finalDest !== 'other');

  // Distâncias aparecem quando há coleta e entrega marcadas, quando já há valores, ou se o usuário pedir
  const show = !!(Q.pts.pickup && Q.pts.delivery) || Q.distManual || DIST_KEYS.some(k => String(Q[k] ?? '').trim() !== '');
  $('#distBox').hidden = !show;
  $('#btnDistManual').hidden = show;

  const r = app.last && app.last.r;
  $('#kmTotal').textContent = r ? `Total ${kmf(r.km.total)}` : '';
  const finLabel = Q.finalDest === 'home' ? 'residência' : 'outro endereço';
  document.querySelectorAll('.drow').forEach(row => {
    const k = row.dataset.key, modes = row.dataset.modes;
    row.classList.toggle('hidden', !(modes === 'always' || modes.split(',').includes(mode)));
    if (k === 'deliveryFinal') row.querySelector('[data-lbl]').textContent = `Entrega até o destino final (${finLabel})`;
    if (k === 'pickupFinal') row.querySelector('[data-lbl]').textContent = `Coleta até o destino final (${finLabel})`;
    const mirrored = MIRROR_KEYS.includes(k) && !Q.touched[k] && (k === 'deliveryPickup' || Q.finalDest === 'home');
    const tag = row.querySelector('[data-tag]');
    const manual = MIRROR_KEYS.includes(k) && Q.touched[k] === true;
    tag.textContent = mirrored ? 'igual ao trecho inverso' : (manual ? 'manual' : '');
    tag.classList.toggle('ds-badge--success', mirrored);
    tag.classList.toggle('hidden', !tag.textContent);
    row.querySelector('[data-reset]').classList.toggle('hidden', !manual);
  });
}
