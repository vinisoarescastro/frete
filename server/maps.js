/**
 * Busca de endereços e rotas. Provedor escolhido pela configuração:
 *  - Geoapify (com GEOAPIFY_KEY): mais estável, plano gratuito com cadastro.
 *  - OpenStreetMap (Nominatim + OSRM): sem chave, servidores públicos de uso leve.
 * Contrato dos dois: geocode(address, near) -> {found, lat, lon, name, approx}
 *                    route(from, to)        -> {meters, coords: [[lat, lon], ...]}
 */
import { createGeoapify } from './providers/geoapify.js';
import { createOsm } from './providers/osm.js';

export { MapsError } from './errors.js';

export function createMaps({ geoapifyKey = '', contact = '' } = {}, fetchImpl = fetch){
  return geoapifyKey ? createGeoapify({ key: geoapifyKey }, fetchImpl) : createOsm({ contact }, fetchImpl);
}
