'use strict';
/* Formulários gerados por configuração e ligação entre campos e estado. */
import { S, Q, update } from './state.js';
import { $ } from './utils.js';

export function field(scope, key, label, o = {}){
  const attr = scope === 's' ? 'data-s' : 'data-q';
  const type = o.type || 'number';
  let input;
  if (type === 'textarea') input = `<textarea ${attr}="${key}" rows="${o.rows || 2}" placeholder="${o.ph || ''}"></textarea>`;
  else if (type === 'select') input = `<select ${attr}="${key}">${o.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  else input = `<input ${attr}="${key}" type="${type}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} placeholder="${o.ph || ''}" autocomplete="off">`;
  const hint = o.hint ? `<i title="${o.hint}">?</i>` : '';
  return `<label class="f ${o.cls || ''}"><span class="lbl">${label}${hint}</span><div class="inp">${o.pre ? `<span class="ad">${o.pre}</span>` : ''}${input}${o.suf ? `<span class="ad">${o.suf}</span>` : ''}</div><small class="msg"></small></label>`;
}
const R$ = { pre: 'R$' }, KM = { suf: 'km' }, PC = { suf: '%' };

export function buildForms(){
  $('#secDados').innerHTML = [
    field('q', 'clientName', 'Nome do cliente (opcional)', { type: 'text' }),
    field('q', 'clientPhone', 'Telefone (opcional)', { type: 'tel' }),
    field('q', 'serviceType', 'Tipo de serviço', { type: 'select', options: ['Frete', 'Entrega', 'Mudança', 'Transporte de mercadorias', 'Outros'].map(x => [x, x]) }),
    field('q', 'date', 'Data prevista do serviço', { type: 'date' }),
    field('q', 'pickup', 'Endereço de coleta', { type: 'text', cls: 'span2', ph: 'Rua, número, bairro, cidade' }),
    field('q', 'delivery', 'Endereço de entrega', { type: 'text', cls: 'span2', ph: 'Rua, número, bairro, cidade' }),
    field('q', 'desc', 'Descrição da carga ou serviço (opcional)', { type: 'textarea', cls: 'span2' }),
    field('q', 'notes', 'Observações adicionais (opcional)', { type: 'textarea', cls: 'span2' })
  ].join('');

  $('#tripsBox').innerHTML = field('q', 'trips', 'Quantidade de viagens de ida', { suf: 'viagens', hint: 'Cada viagem leva carga da coleta à entrega. Entre elas há retorno à coleta.' });
  $('#finalBox').innerHTML = field('q', 'finalDest', 'Retorno final', { type: 'select', options: [['home', 'Para minha residência'], ['other', 'Para outro endereço']] });
  $('#finalAddrBox').innerHTML = field('q', 'finalAddr', 'Endereço do retorno final', { type: 'text' });

  const rows = [
    ['homePickup', 'Residência para coleta', 'always'],
    ['pickupDelivery', 'Coleta para entrega (cada viagem de ida)', 'always'],
    ['deliveryPickup', 'Entrega para coleta (retorno)', 'roundtrip,multiple'],
    ['deliveryFinal', 'Entrega para retorno final', 'oneway,multiple'],
    ['pickupFinal', 'Coleta para retorno final', 'roundtrip']
  ];
  $('#dRows').innerHTML = rows.map(([k, l, m]) =>
    `<div class="drow" data-key="${k}" data-modes="${m}">${field('q', k, `<span data-lbl>${l}</span>`, { ...KM, ph: '0' })}<div class="dx"><span class="tag" data-tag></span><button class="mini hidden" type="button" data-reset title="Voltar a copiar o trecho de ida">Restaurar</button><a class="lnk hidden" target="_blank" rel="noopener" data-map>Ver no Maps</a></div></div>`).join('');

  $('#secDesp').innerHTML = [
    field('q', 'tolls', 'Pedágios', R$), field('q', 'parking', 'Estacionamento', R$),
    field('q', 'food', 'Alimentação', R$), field('q', 'otherExp', 'Outras despesas (ajudante, etc.)', R$),
    field('q', 'hours', 'Horas estimadas de trabalho', { suf: 'h', hint: 'Multiplicadas pelo valor/hora (Configurações) e somadas ao custo como mão de obra.' }),
    field('s', 'laborRate', 'Valor da hora de trabalho', { ...R$, suf: '/h' }),
    field('q', 'fuel', 'Combustível deste serviço', { type: 'select', cls: 'span2', options: [['', 'Padrão das Configurações'], ['gasolina', 'Gasolina'], ['etanol', 'Etanol']] })
  ].join('');

  $('#secPreco').innerHTML = [
    field('s', 'margin', 'Margem de lucro desejada', { ...PC, hint: 'Margem sobre o preço de venda: lucro ÷ preço.' }),
    field('s', 'tax', 'Taxas sobre a venda (opcional)', { ...PC, hint: 'Impostos/taxa de cartão, em % do preço.' }),
    field('s', 'ratePerKm', 'Valor cobrado por km (Método 1)', { ...R$, suf: '/km' }),
    field('s', 'minCharge', 'Valor mínimo por serviço', R$),
    field('q', 'discType', 'Tipo de desconto', { type: 'select', options: [['pct', 'Percentual (%)'], ['val', 'Valor (R$)']] }),
    field('q', 'discount', 'Desconto ao cliente'),
    field('q', 'manual', 'Preço final manual (opcional)', { ...R$, cls: 'span2', hint: 'Substitui o valor sugerido. Lucro e margem são recalculados.' })
  ].join('');

  $('#setEnd').innerHTML = [
    field('s', 'home', 'Endereço residencial (partida e retorno)', { type: 'text', cls: 'span2' }),
    field('s', 'providerName', 'Seu nome / empresa (aparece no orçamento)', { type: 'text' }),
    field('s', 'providerPhone', 'Seu telefone (aparece no orçamento)', { type: 'tel' }),
    field('s', 'validityDays', 'Validade do orçamento (dias)', { suf: 'dias' })
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
    field('s', 'laborRate', 'Valor da hora de trabalho (mão de obra)', { ...R$, suf: '/h', cls: 'span2', hint: 'As horas são informadas em cada orçamento.' })
  ].join('');
  $('#setLucro').innerHTML = [
    field('s', 'margin', 'Margem de lucro desejada', PC), field('s', 'tax', 'Taxas sobre a venda (opcional)', PC),
    field('s', 'minCharge', 'Valor mínimo por serviço', R$), field('s', 'ratePerKm', 'Valor padrão por km', { ...R$, suf: '/km' }),
    field('s', 'cardFee', 'Taxa do cartão de crédito (estimativa)', { ...PC, cls: 'span2', hint: 'Acrescida ao valor no orçamento do cartão: Pix dividido por (1 menos a taxa). Ajuste conforme sua maquininha.' }),
    field('s', 'rounding', 'Arredondar valor sugerido para cima', { type: 'select', cls: 'span2', options: [['0', 'Não arredondar'], ['1', 'Próximo R$ 1'], ['5', 'Próximo R$ 5'], ['10', 'Próximo R$ 10']] })
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

function mapsLink(a, b){
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}`;
}
export const finalAddress = () => Q.finalDest === 'home' ? S.home : Q.finalAddr;

export function renderRoute(){
  const mode = Q.mode, home = S.home, fin = finalAddress();
  $('#tripsBox').classList.toggle('hidden', mode !== 'multiple');
  $('#finalAddrBox').classList.toggle('hidden', Q.finalDest !== 'other');
  const pairs = {
    homePickup: [home, Q.pickup], pickupDelivery: [Q.pickup, Q.delivery], deliveryPickup: [Q.delivery, Q.pickup],
    deliveryFinal: [Q.delivery, fin], pickupFinal: [Q.pickup, fin]
  };
  const finLabel = Q.finalDest === 'home' ? 'residência' : 'outro endereço';
  document.querySelectorAll('.drow').forEach(row => {
    const k = row.dataset.key, modes = row.dataset.modes;
    row.classList.toggle('hidden', !(modes === 'always' || modes.split(',').includes(mode)));
    if (k === 'deliveryFinal') row.querySelector('[data-lbl]').textContent = `Entrega para retorno final (${finLabel})`;
    if (k === 'pickupFinal') row.querySelector('[data-lbl]').textContent = `Coleta para retorno final (${finLabel})`;
    const mirrored = MIRROR_KEYS.includes(k) && !Q.touched[k] && (k === 'deliveryPickup' || Q.finalDest === 'home');
    const tag = row.querySelector('[data-tag]');
    tag.textContent = mirrored ? 'igual ao trecho inverso' : (Q.touched[k] ? 'manual' : '');
    tag.classList.toggle('auto', mirrored);
    tag.classList.toggle('hidden', !tag.textContent);
    row.querySelector('[data-reset]').classList.toggle('hidden', !(MIRROR_KEYS.includes(k) && Q.touched[k]));
    const [a, b] = pairs[k], link = row.querySelector('[data-map]');
    link.classList.toggle('hidden', !(a && b));
    if (a && b) link.href = mapsLink(a, b);
  });
  const stale = Q.geoKey && Q.geoKey !== [S.home, Q.pickup, Q.delivery, fin].join('|');
  $('#geoNote').dataset.stale = stale ? '1' : '';
}
