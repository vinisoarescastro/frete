export class MapsError extends Error {
  constructor(message, status = 502){ super(message); this.status = status; }
}

export const isCoord = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** Valida os dados de entrada comuns aos provedores. */
export function checkAddress(address){
  address = String(address || '').trim();
  if (!address || address.length > 300) throw new MapsError('Endereço inválido.', 400);
  return address;
}
export function checkPoints(from, to){
  if (!from || !to || !isCoord(from.lat, from.lon) || !isCoord(to.lat, to.lon)) throw new MapsError('Coordenadas inválidas.', 400);
}
