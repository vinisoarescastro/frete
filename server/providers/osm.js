import { MapsError, checkAddress, checkPoints, isCoord } from '../errors.js';

/** Nominatim + OSRM: servidores públicos, uso leve, 1 busca por segundo e User-Agent identificando o app. */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const PHOTON = 'https://photon.komoot.io/api/';   // reserva para a busca de endereços (também baseado no OpenStreetMap)
const TIMEOUT_MS = 6000;
const DOWN_MS = 5 * 60 * 1000;

function distKm(a, b){
  const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function createOsm({ contact = '' } = {}, fetchImpl = fetch){
  const headers = { 'User-Agent': `calculadora-de-fretes/2.0${contact ? ` (${contact})` : ''}`, 'Accept-Language': 'pt-BR' };

  let chain = Promise.resolve(), last = 0, nominatimDownUntil = 0;
  const throttled = fn => {
    const run = chain.then(async () => {
      const wait = 1100 - (Date.now() - last);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      last = Date.now();
      return fn();
    });
    chain = run.catch(() => {});
    return run;
  };

  // Requisição com tempo limite; falhas de rede viram MapsError
  async function get(url, opts = {}){
    try { return await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch { throw new MapsError('Serviço de mapas indisponível no momento. Tente de novo em instantes.', 503); }
  }

  async function viaNominatim(address, near){
    const qs = new URLSearchParams({ format: 'jsonv2', limit: '5', 'accept-language': 'pt-BR', countrycodes: 'br', q: address });
    if (near) qs.set('viewbox', `${near.lon - 0.4},${near.lat + 0.4},${near.lon + 0.4},${near.lat - 0.4}`);
    const res = await throttled(() => get(`${NOMINATIM}?${qs}`, { headers }));
    if (!res.ok) throw new MapsError('Nominatim HTTP ' + res.status);
    const list = await res.json();
    if (!list.length) return { found: false };
    let best = list[0];
    if (near) {
      const d = x => distKm(near, { lat: +x.lat, lon: +x.lon });
      best = list.slice().sort((a, b) => d(a) - d(b))[0];   // prefere resultados perto da residência
    }
    return { found: true, lat: +best.lat, lon: +best.lon, name: best.display_name, approx: false };
  }

  async function viaPhoton(address, near){
    const qs = new URLSearchParams({ q: address, limit: '5' });
    if (near) { qs.set('lat', String(near.lat)); qs.set('lon', String(near.lon)); }
    const res = await get(`${PHOTON}?${qs}`, { headers });
    if (!res.ok) throw new MapsError('Photon HTTP ' + res.status);
    const j = await res.json();
    const f = (j.features || []).find(x => x.properties?.countrycode === 'BR');
    if (!f) return { found: false };
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    const street = [p.street || p.name, p.housenumber].filter(Boolean).join(', ');
    const name = [street, p.district, p.city, p.state].filter(Boolean).join(', ');
    return { found: true, lat, lon, name, approx: /\d/.test(address) && p.type !== 'house' };
  }

  async function geocode(address, near){
    address = checkAddress(address);
    const hasNear = near && isCoord(near.lat, near.lon);
    const around = hasNear ? near : null;
    if (Date.now() >= nominatimDownUntil) {
      try { return await viaNominatim(address, around); }
      catch { nominatimDownUntil = Date.now() + DOWN_MS; }   // fora do ar ou lento: usa a reserva por alguns minutos
    }
    return viaPhoton(address, around);
  }

  async function route(from, to){
    checkPoints(from, to);
    const res = await get(`${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`, { headers });
    if (!res.ok) throw new MapsError('OSRM HTTP ' + res.status);
    const j = await res.json();
    if (j.code !== 'Ok' || !j.routes?.length) throw new MapsError('Sem rota entre os pontos.', 404);
    const r = j.routes[0];
    return { meters: r.distance, coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]) };
  }

  return { geocode, route };
}
