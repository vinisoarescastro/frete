/**
 * Geocodificação (Nominatim) e rotas (OSRM), ambos do OpenStreetMap, consultados pelo servidor.
 * Servidores públicos: uso leve, 1 requisição por segundo e User-Agent identificando o app.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

export class MapsError extends Error {
  constructor(message, status = 502){ super(message); this.status = status; }
}

const isCoord = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function distKm(a, b){
  const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function createMaps({ contact = '' } = {}, fetchImpl = fetch){
  const headers = { 'User-Agent': `calculadora-de-fretes/2.0${contact ? ` (${contact})` : ''}`, 'Accept-Language': 'pt-BR' };

  // Política do Nominatim: no máximo 1 requisição por segundo (fila única)
  let chain = Promise.resolve(), last = 0;
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

  async function geocode(address, near){
    address = String(address || '').trim();
    if (!address || address.length > 300) throw new MapsError('Endereço inválido.', 400);
    const qs = new URLSearchParams({ format: 'jsonv2', limit: '5', 'accept-language': 'pt-BR', countrycodes: 'br', q: address });
    if (near && isCoord(near.lat, near.lon)) qs.set('viewbox', `${near.lon - 0.4},${near.lat + 0.4},${near.lon + 0.4},${near.lat - 0.4}`);
    const res = await throttled(() => fetchImpl(`${NOMINATIM}?${qs}`, { headers }));
    if (!res.ok) throw new MapsError('Nominatim HTTP ' + res.status);
    const list = await res.json();
    if (!list.length) return { found: false };
    let best = list[0];
    if (near && isCoord(near.lat, near.lon)) {
      const d = x => distKm(near, { lat: +x.lat, lon: +x.lon });
      best = list.slice().sort((a, b) => d(a) - d(b))[0];   // prefere resultados perto da residência
    }
    return { found: true, lat: +best.lat, lon: +best.lon, name: best.display_name, approx: false };
  }

  async function route(from, to){
    if (!from || !to || !isCoord(from.lat, from.lon) || !isCoord(to.lat, to.lon)) throw new MapsError('Coordenadas inválidas.', 400);
    const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=polyline`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) throw new MapsError('OSRM HTTP ' + res.status);
    const j = await res.json();
    if (j.code !== 'Ok' || !j.routes?.length) throw new MapsError('Sem rota entre os pontos.', 404);
    return { meters: j.routes[0].distance, polyline: j.routes[0].geometry };
  }

  return { geocode, route };
}
