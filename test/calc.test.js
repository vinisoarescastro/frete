import test from 'node:test';
import assert from 'node:assert/strict';
import { num, computeKm, calculate } from '../public/js/calc.js';
import { DEFAULT_SETTINGS } from '../public/js/config.js';

const quote = over => ({
  mode: 'oneway', trips: '2', finalDest: 'home', method: '2', discType: 'pct', discount: '', manual: '', fuel: '',
  homePickup: '5', pickupDelivery: '10', deliveryPickup: '10', deliveryFinal: '6', pickupFinal: '5',
  tolls: '', parking: '', food: '', otherExp: '', hours: '', ...over
});

test('num: vazio vale 0, vírgula decimal e inválido', () => {
  assert.equal(num(''), 0);
  assert.equal(num('2,5'), 2.5);
  assert.ok(Number.isNaN(num('abc')));
});

test('computeKm: somente ida, ida e volta e múltiplas viagens', () => {
  const d = { homePickup: 5, pickupDelivery: 10, deliveryPickup: 10, deliveryFinal: 6, pickupFinal: 5 };
  assert.equal(computeKm('oneway', 1, d).total, 5 + 10 + 6);
  assert.equal(computeKm('roundtrip', 1, d).total, 5 + 10 + 10 + 5);
  assert.equal(computeKm('multiple', 3, d).total, 5 + 30 + 20 + 6);
});

test('calculate: aplica o valor mínimo e devolve preço positivo', () => {
  const res = calculate(DEFAULT_SETTINGS, quote());
  assert.equal(res.errors.length, 0);
  assert.ok(res.r.price >= Number(DEFAULT_SETTINGS.minCharge));
});

test('calculate: exige quilometragem', () => {
  const res = calculate(DEFAULT_SETTINGS, quote({ homePickup: '', pickupDelivery: '', deliveryFinal: '' }));
  assert.ok(res.errors.length > 0);
  assert.equal(res.r, null);
});

test('calculate: margem sobre o preço de venda (método 2)', () => {
  const S = { ...DEFAULT_SETTINGS, minCharge: '0', rounding: '0', margin: '50', tax: '' };
  const { r } = calculate(S, quote({ pickupDelivery: '100' }));
  assert.ok(Math.abs(r.m2.margin - 50) < 0.1);
});

test('calculate: desconto percentual reduz o preço final', () => {
  const base = calculate(DEFAULT_SETTINGS, quote({ pickupDelivery: '100' })).r;
  const disc = calculate(DEFAULT_SETTINGS, quote({ pickupDelivery: '100', discount: '10' })).r;
  assert.ok(Math.abs(disc.price - base.price * 0.9) < 0.02);
});
