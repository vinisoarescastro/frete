/**
 * Busca de endereços e rotas. Provedor escolhido pela configuração:
 *  - Geoapify (com GEOAPIFY_KEY): mais estável, plano gratuito com cadastro.
 *  - OpenStreetMap (Nominatim + OSRM): sem chave, servidores públicos de uso leve.
 * Contrato dos dois: geocode(address, near) -> {found, lat, lon, name, approx}
 *                    route(from, to)        -> {meters, coords: [[lat, lon], ...]}
 *                    suggest(query, near)   -> {items: [{lat, lon, name, precise}]}
 *                    reverse(lat, lon)      -> {found, name}
 */
import { createGeoapify } from './providers/geoapify.js';
import { createOsm } from './providers/osm.js';

export { MapsError } from './errors.js';

const TTL = 10 * 60 * 1000, MAX = 300;

/** Cache simples (memória) para sugestões repetidas, poupando os serviços públicos. */
function cached(fn){
  const store = new Map();
  return async (...args) => {
    const key = JSON.stringify(args);
    const hit = store.get(key);
    if (hit && hit.t > Date.now()) return hit.v;
    const v = await fn(...args);
    if (store.size >= MAX) store.delete(store.keys().next().value);
    store.set(key, { t: Date.now() + TTL, v });
    return v;
  };
}

export function createMaps({ geoapifyKey = '', contact = '' } = {}, fetchImpl = fetch){
  const p = geoapifyKey ? createGeoapify({ key: geoapifyKey }, fetchImpl) : createOsm({ contact }, fetchImpl);
  return { ...p, suggest: cached(p.suggest), reverse: cached(p.reverse) };
}
