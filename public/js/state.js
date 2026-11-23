'use strict';
/* Estado da aplicação. S = configurações (persistentes) | Q = orçamento atual (rascunho). */
import { DEFAULT_SETTINGS, HOME_DEFAULT, KEY_S, KEY_Q } from './config.js';
import { lsGet, today } from './utils.js';

export const S = Object.assign({}, DEFAULT_SETTINGS, lsGet(KEY_S, {}));
if (!S.home) S.home = HOME_DEFAULT;
if (S.validityDays === '7') S.validityDays = '3';   // validade padrão: 3 dias

export function newQuote(){
  return {
    clientName: '', clientPhone: '', serviceType: 'Frete', pickup: '', delivery: '', desc: '',
    date: today(), notes: '',
    mode: 'oneway', trips: '2', finalDest: 'home', finalAddr: '',
    homePickup: '', pickupDelivery: '', deliveryPickup: '', deliveryFinal: '', pickupFinal: '',
    touched: {}, pts: {}, distManual: false, savedId: null,
    tolls: S.defTolls, parking: S.defParking, food: S.defFood, otherExp: S.defOther, hours: '',
    fuel: '', method: '2', discType: 'pct', discount: '', manual: ''
  };
}

export const Q = Object.assign(newQuote(), lsGet(KEY_Q, {}));
Q.touched = Q.touched || {};
Q.pts = Q.pts || {};

/** Troca o conteúdo do orçamento (ex.: ao abrir um recente) mantendo a mesma referência do objeto Q. */
export function replaceQuote(data){
  for (const k of Object.keys(Q)) delete Q[k];
  Object.assign(Q, newQuote(), data);
  Q.touched = Q.touched || {}; Q.pts = Q.pts || {};
}

/** Descarta o orçamento atual mantendo a mesma referência do objeto Q. */
export function resetQuote(){
  for (const k of Object.keys(Q)) delete Q[k];
  Object.assign(Q, newQuote());
}

/** Estado compartilhado entre módulos: resultado do último cálculo e pontos geocodificados. */
/** geo.home: ponto da residência; geo.routes: trechos calculados (km e traçado). Os pontos de coleta, entrega e destino ficam em Q.pts. */
export const app = { last: null, geo: { home: null, routes: {} } };

// Evita dependência circular: o ciclo de atualização é registrado por main.js
let updater = () => {};
export const setUpdater = fn => { updater = fn; };
export const update = () => updater();
