/** Proxy para Geocoding API e Routes API do Google. A chave do servidor nunca vai para o navegador. */

const GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';

export class MapsError extends Error {
  constructor(message, status = 502){ super(message); this.status = status; }
}

const isCoord = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

export function createMaps({ serverKey }, fetchImpl = fetch){
  const need = () => { if (!serverKey) throw new MapsError('GOOGLE_MAPS_SERVER_KEY não configurada no servidor.', 503); };

  async function geocode(address, near){
    need();
    address = String(address || '').trim();
    if (!address || address.length > 300) throw new MapsError('Endereço inválido.', 400);
    const qs = new URLSearchParams({ address, key: serverKey, language: 'pt-BR', region: 'br', components: 'country:BR' });
    if (near && isCoord(near.lat, near.lon)) {
      const d = 0.4;   // viés de ~45 km ao redor da residência
      qs.set('bounds', `${near.lat - d},${near.lon - d}|${near.lat + d},${near.lon + d}`);
    }
    const res = await fetchImpl(`${GEOCODE}?${qs}`);
    if (!res.ok) throw new MapsError('Geocoding HTTP ' + res.status);
    const j = await res.json();
    if (j.status === 'ZERO_RESULTS') return { found: false };
    if (j.status !== 'OK') throw new MapsError(`Geocoding: ${j.status}${j.error_message ? ' - ' + j.error_message : ''}`);
    const r = j.results[0], loc = r.geometry.location;
    const precise = ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(r.geometry.location_type);
    return { found: true, lat: loc.lat, lon: loc.lng, name: r.formatted_address, approx: !precise || !!r.partial_match };
  }

  async function route(from, to){
    need();
    if (!from || !to || !isCoord(from.lat, from.lon) || !isCoord(to.lat, to.lon)) throw new MapsError('Coordenadas inválidas.', 400);
    const point = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lon } } });
    const res = await fetchImpl(ROUTES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': serverKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.polyline.encodedPolyline'
      },
      body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: 'DRIVE', languageCode: 'pt-BR', units: 'METRIC' })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new MapsError(`Routes: ${j.error?.message || 'HTTP ' + res.status}`);
    const rt = j.routes && j.routes[0];
    if (!rt) throw new MapsError('Sem rota entre os pontos.', 404);
    return { meters: rt.distanceMeters ?? 0, polyline: rt.polyline?.encodedPolyline || '' };
  }

  return { geocode, route };
}
