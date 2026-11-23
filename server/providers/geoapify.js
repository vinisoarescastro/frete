import { MapsError, checkAddress, checkPoints, isCoord } from '../errors.js';

const BASE = 'https://api.geoapify.com/v1';

export function createGeoapify({ key }, fetchImpl = fetch){
  async function get(path, params){
    const res = await fetchImpl(`${BASE}${path}?${new URLSearchParams({ ...params, apiKey: key })}`);
    if (res.status === 401 || res.status === 403) throw new MapsError('Geoapify recusou a chave (verifique GEOAPIFY_KEY).');
    if (res.status === 429) throw new MapsError('Limite diário do Geoapify atingido. Tente amanhã ou preencha as distâncias manualmente.');
    if (!res.ok) throw new MapsError('Geoapify HTTP ' + res.status);
    return res.json();
  }

  async function geocode(address, near){
    address = checkAddress(address);
    const params = { text: address, format: 'json', lang: 'pt', limit: '1', filter: 'countrycode:br' };
    if (near && isCoord(near.lat, near.lon)) params.bias = `proximity:${near.lon},${near.lat}`;   // prefere resultados perto da residência
    const j = await get('/geocode/search', params);
    const r = j.results && j.results[0];
    if (!r) return { found: false };
    // Se o texto tinha número mas o resultado é só a rua, a posição é aproximada
    const exact = ['building', 'amenity'].includes(r.result_type);
    return { found: true, lat: r.lat, lon: r.lon, name: r.formatted, approx: /\d/.test(address) && !exact };
  }

  async function route(from, to){
    checkPoints(from, to);
    const j = await get('/routing', { waypoints: `${from.lat},${from.lon}|${to.lat},${to.lon}`, mode: 'drive', units: 'metric' });
    const f = j.features && j.features[0];
    if (!f) throw new MapsError('Sem rota entre os pontos.', 404);
    const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    return { meters: f.properties.distance, coords: lines.flat().map(([lon, lat]) => [lat, lon]) };
  }

  return { geocode, route };
}
