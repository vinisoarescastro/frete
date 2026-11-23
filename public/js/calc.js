'use strict';
/* =========================================================
   NÚCLEO DE CÁLCULO (sem acesso ao DOM, testável isoladamente)
   ========================================================= */
// Converte texto em número. Vazio = 0. Inválido = NaN.
export function num(v){
  if (v === '' || v == null) return 0;
  return Number(String(v).replace(',', '.'));
}
export const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Quilometragem por trecho.
 *  - Deslocamento inicial: residência para coleta (1x)
 *  - Idas: n × (coleta para entrega)
 *  - Retornos à coleta: somente ida = 0 | ida e volta = 1 | múltiplas = n-1
 *  - Retorno final (1x): entrega para destino final
 *    (na modalidade ida e volta o veículo termina na coleta, então é coleta para destino final)
 */
export function computeKm(mode, trips, d){
  const returns = mode === 'oneway' ? 0 : mode === 'roundtrip' ? 1 : trips - 1;
  const legs = {
    trips, returns,
    initial: d.homePickup,
    ida: trips * d.pickupDelivery,
    inter: returns * d.deliveryPickup,
    final: mode === 'roundtrip' ? d.pickupFinal : d.deliveryFinal
  };
  legs.total = legs.initial + legs.ida + legs.inter + legs.final;
  return legs;
}

export function calculate(S, Q){
  const errors = [], warnings = [];
  const err = (key, msg) => errors.push({ key, msg });

  // Leitura validada: número finito, >= 0
  const get = (obj, scope, key, label) => {
    const x = num(obj[key]);
    if (!Number.isFinite(x)) { err(scope + '.' + key, label + ': valor inválido.'); return 0; }
    if (x < 0) { err(scope + '.' + key, label + ' não pode ser negativo.'); return 0; }
    return x;
  };

  const mode = Q.mode;
  const eta = (Q.fuel || S.fuelType) === 'etanol';
  // Quantidade de viagens
  let trips = 1;
  if (mode === 'multiple') {
    const t = num(Q.trips);
    if (!Number.isInteger(t) || t < 1) err('q.trips', 'Informe um número inteiro de viagens (mínimo 1).');
    else trips = t;
  }

  // Distâncias (apenas as usadas pela modalidade escolhida)
  const d = { homePickup: 0, pickupDelivery: 0, deliveryPickup: 0, deliveryFinal: 0, pickupFinal: 0 };
  const returnsNeeded = mode === 'oneway' ? 0 : mode === 'roundtrip' ? 1 : Math.max(trips - 1, 0);
  d.homePickup = get(Q, 'q', 'homePickup', 'Residência para coleta');
  d.pickupDelivery = get(Q, 'q', 'pickupDelivery', 'Coleta para entrega');
  if (returnsNeeded > 0) d.deliveryPickup = get(Q, 'q', 'deliveryPickup', 'Entrega para coleta');
  if (mode === 'roundtrip') d.pickupFinal = get(Q, 'q', 'pickupFinal', 'Coleta para retorno final');
  else d.deliveryFinal = get(Q, 'q', 'deliveryFinal', 'Entrega para retorno final');

  // Parâmetros
  const p = {
    gas: eta ? get(S, 's', 'etaPrice', 'Preço do etanol') : get(S, 's', 'gasPrice', 'Preço da gasolina'),
    kmPerL: eta ? get(S, 's', 'etaKmPerL', 'Consumo médio (etanol)') : get(S, 's', 'kmPerL', 'Consumo médio (gasolina)'),
    maint: get(S, 's', 'costMaint', 'Manutenção por km'),
    tires: get(S, 's', 'costTires', 'Pneus por km'),
    deprec: get(S, 's', 'costDeprec', 'Depreciação por km'),
    otherKm: get(S, 's', 'costOther', 'Outros custos por km'),
    labor: get(S, 's', 'laborRate', 'Mão de obra por hora'),
    margin: get(S, 's', 'margin', 'Margem de lucro'),
    tax: get(S, 's', 'tax', 'Taxas sobre a venda'),
    cardFee: get(S, 's', 'cardFee', 'Taxa do cartão'),
    min: get(S, 's', 'minCharge', 'Valor mínimo'),
    rate: get(S, 's', 'ratePerKm', 'Valor por km'),
    step: num(S.rounding) || 0,
    tolls: get(Q, 'q', 'tolls', 'Pedágios'),
    parking: get(Q, 'q', 'parking', 'Estacionamento'),
    food: get(Q, 'q', 'food', 'Alimentação'),
    otherExp: get(Q, 'q', 'otherExp', 'Outras despesas'),
    hours: get(Q, 'q', 'hours', 'Horas estimadas'),
    disc: get(Q, 'q', 'discount', 'Desconto'),
    manual: get(Q, 'q', 'manual', 'Preço manual')
  };
  if (p.cardFee >= 100) err('s.cardFee', 'A taxa do cartão deve ser menor que 100%.');
  if (p.margin + p.tax >= 100) err('s.margin', 'Margem + taxas devem somar menos de 100%.');

  const km = computeKm(mode, trips, d);
  if (!errors.length && km.total <= 0) err('', 'Informe as quilometragens para calcular o frete.');
  if (!errors.length && km.total > 0 && p.kmPerL <= 0)
    err(eta ? 's.etaKmPerL' : 's.kmPerL', 'Consumo médio deve ser maior que zero para calcular o combustível.');
  if (errors.length) return { errors, warnings, r: null };

  // ---- Custos (idênticos nos dois métodos: são custos reais) ----
  const fuelL = km.total / p.kmPerL;
  const c = {
    fuelL,
    fuel: fuelL * p.gas,
    maint: km.total * p.maint,
    tires: km.total * p.tires,
    deprec: km.total * p.deprec,
    otherKm: km.total * p.otherKm,
    tolls: p.tolls, parking: p.parking, food: p.food, otherExp: p.otherExp,
    labor: p.hours * p.labor
  };
  c.op = c.fuel + c.maint + c.tires + c.deprec + c.otherKm;            // custo operacional (depende do km)
  c.reimb = c.tolls + c.parking + c.food + c.otherExp;                  // despesas do serviço
  c.extras = c.reimb + c.labor;                                         // despesas adicionais
  c.total = c.op + c.extras;

  const denom = 1 - (p.margin + p.tax) / 100;                           // margem sobre o PREÇO DE VENDA
  const finish = raw => {
    const base = Math.max(raw, p.min);
    const up = p.step > 0 ? Math.ceil(base / p.step - 1e-9) * p.step : base;
    return { price: round2(up), minApplied: raw < p.min };
  };
  const evalPrice = price => {
    const taxes = price * p.tax / 100;
    const profit = price - c.total - taxes;
    return {
      price, taxes, profit,
      margin: price > 0 ? profit / price * 100 : 0,       // margem sobre o preço
      markup: c.total > 0 ? profit / c.total * 100 : null // acréscimo sobre o custo
    };
  };

  // Método 1: preço por km rodado (valor/km cobrado × km + despesas repassadas)
  const m1 = { id: '1', available: p.rate > 0 };
  if (m1.available) Object.assign(m1, finish(km.total * p.rate + c.reimb));
  if (m1.available) Object.assign(m1, evalPrice(m1.price));
  // Método 2: custo detalhado + margem sobre o preço (preço = custo ÷ (1 - margem - taxas))
  const m2 = { id: '2', available: true };
  Object.assign(m2, finish(c.total / denom));
  Object.assign(m2, evalPrice(m2.price));
  // Valor por km necessário para atingir a margem desejada
  const reqRate = (c.total / denom - c.reimb) / km.total;

  // ---- Método escolhido, desconto e preço manual ----
  let chosen = Q.method === '1' ? m1 : m2;
  if (Q.method === '1' && !m1.available) {
    chosen = m2;
    warnings.push('Método 1 indisponível: defina o valor cobrado por km. Usando o Método 2.');
  }
  const suggested = chosen.price;

  let discAmt = 0;
  if (Q.discType === 'val') discAmt = p.disc;
  else { if (p.disc > 100) err('q.discount', 'Desconto não pode passar de 100%.'); discAmt = suggested * p.disc / 100; }
  if (discAmt > suggested + 0.001) { err('q.discount', 'Desconto maior que o valor sugerido.'); discAmt = 0; }
  if (errors.length) return { errors, warnings, r: null };
  discAmt = round2(discAmt);

  const manualUsed = Q.manual !== '' && p.manual > 0;
  if (manualUsed && discAmt > 0) warnings.push('O preço manual substitui o valor sugerido; o desconto informado não é aplicado.');
  const finalPrice = manualUsed ? round2(p.manual) : round2(Math.max(suggested - discAmt, Math.min(p.min, suggested)));
  if (!manualUsed && discAmt > 0 && suggested - discAmt < p.min) warnings.push('O desconto foi limitado para respeitar o frete mínimo.');
  const fin = evalPrice(finalPrice);

  // ---- Avisos de negócio ----
  const incomplete = [];
  if (p.gas <= 0) incomplete.push('preço do combustível zerado');
  if (p.maint + p.tires + p.deprec <= 0) incomplete.push('manutenção, pneus e depreciação por km zerados');
  if (incomplete.length) warnings.push('Estimativa parcial de lucro: ' + incomplete.join('; ') + '. O lucro real tende a ser menor que o mostrado.');
  if (fin.profit < 0) warnings.push('Atenção: com este preço o serviço dá PREJUÍZO.');
  else if (finalPrice < p.min) warnings.push('O preço final está abaixo do valor mínimo de cobrança.');
  else if (fin.margin + 1e-9 < p.margin) warnings.push('A margem efetiva está abaixo da margem desejada.');
  if (p.margin === 0) warnings.push('Margem de lucro desejada está em 0% (Configurações).');

  return {
    errors, warnings,
    r: { cardPrice: p.cardFee > 0 ? round2(finalPrice / (1 - p.cardFee / 100)) : null, mode, trips, fuelName: eta ? 'Etanol' : 'Gasolina', km, c, p, m1, m2, reqRate, chosen, suggested, discAmt, manualUsed,
         price: finalPrice, fin, diff: round2(finalPrice - suggested),
         diffPct: suggested > 0 ? (finalPrice - suggested) / suggested * 100 : 0,
         partial: incomplete.length > 0 }
  };
}
