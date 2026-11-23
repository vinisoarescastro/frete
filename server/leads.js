import { randomBytes } from 'node:crypto';
import { MapsError, isCoord } from './errors.js';
import { calculate } from '../public/js/calc.js';
import { DEFAULT_SETTINGS } from '../public/js/config.js';

/** Limitador simples em memória: no máximo `max` eventos por chave a cada `windowMs`. */
function limiter(max, windowMs){
  const hits = new Map();
  return key => {
    const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(now); hits.set(key, list);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return true;
  };
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const km1 = meters => Math.round(meters / 100) / 10;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Simulador público: cadastro do cliente, busca de endereços e cálculo do valor (somente o valor final sai do servidor). */
export function createLeads({ db, maps }){
  const startLimit = limiter(6, 60 * 60 * 1000);
  const suggestLimit = limiter(60, 10 * 60 * 1000);
  const simLimit = limiter(20, 60 * 60 * 1000);
  const settings = () => ({ ...DEFAULT_SETTINGS, ...(db.getKv('settings') || {}) });

  let homeCache = null;
  async function home(S){
    const addr = (S.home || '').trim();
    if (!addr) return null;
    if (homeCache && homeCache.addr === addr) return homeCache;
    const g = await maps.geocode(addr, null);
    if (!g || !g.found) return null;
    return (homeCache = { addr, lat: g.lat, lon: g.lon });
  }

  const auth = token => { const l = db.leadByToken(token); if (!l) throw new MapsError('Sessão expirada. Preencha seus dados de novo.', 401); return l; };

  return {
    start(body, ip){
      if (clip(body.website, 50)) return { ok: true, token: randomBytes(8).toString('hex') };   // campo invisível preenchido: robô, finge sucesso
      if (!startLimit(ip)) throw new MapsError('Muitas tentativas. Tente de novo mais tarde.', 429);
      const name = clip(body.name, 100);
      let phone = String(body.phone || '').replace(/\D/g, '');
      if (phone.startsWith('55') && phone.length > 11) phone = phone.slice(2);
      if (name.length < 2) throw new MapsError('Informe seu nome.', 400);
      if (phone.length < 10 || phone.length > 11) throw new MapsError('Informe o WhatsApp com DDD.', 400);
      if (body.consent !== true) throw new MapsError('É preciso concordar com o uso dos dados para continuar.', 400);
      const token = randomBytes(24).toString('hex');
      db.startLead({ token, name, phone });
      return { ok: true, token };
    },

    async suggest(token, q, ip){
      auth(token);
      if (!suggestLimit(ip)) throw new MapsError('Muitas buscas. Aguarde um pouco.', 429);
      q = clip(q, 200);
      if (q.length < 3) return { items: [] };
      const h = await home(settings()).catch(() => null);
      return maps.suggest(q, h ? { lat: h.lat, lon: h.lon } : null);
    },

    async simulate(token, body, ip){
      const lead = auth(token);
      if (!simLimit(ip + '|' + lead.id)) throw new MapsError('Muitas simulações. Tente de novo mais tarde.', 429);
      const S = settings();
      const pick = clip(body.pickup?.name, 300), del = clip(body.delivery?.name, 300);
      const pt = p => ({ lat: Number(p?.lat), lon: Number(p?.lon) });
      const a = pt(body.pickup), b = pt(body.delivery);
      if (!pick || !del || !isCoord(a.lat, a.lon) || !isCoord(b.lat, b.lon)) throw new MapsError('Escolha os endereços de coleta e entrega na lista de sugestões.', 400);
      const mode = body.mode === 'roundtrip' ? 'roundtrip' : 'oneway';
      const noDate = body.noDate === true;
      const desired = noDate ? '' : clip(body.date, 10);
      if (!noDate && !ISO.test(desired)) throw new MapsError('Informe a data desejada ou marque que ainda não tem uma data.', 400);

      const h = await home(S);
      if (!h) throw new MapsError('Simulação indisponível no momento. Fale conosco pelo WhatsApp.', 503);
      const leg = async (x, y) => km1((await maps.route(x, y)).meters);
      const Q = { mode, trips: '1', finalDest: 'home', method: 'auto', discType: 'pct', discount: '', manual: '', fuel: '', hours: '',
        tolls: S.defTolls, parking: S.defParking, food: S.defFood, otherExp: S.defOther,
        homePickup: '', pickupDelivery: '', deliveryPickup: '', deliveryFinal: '', pickupFinal: '' };
      [Q.homePickup, Q.pickupDelivery] = await Promise.all([leg(h, a), leg(a, b)]);
      if (mode === 'roundtrip') [Q.deliveryPickup, Q.pickupFinal] = await Promise.all([leg(b, a), leg(a, h)]);
      else Q.deliveryFinal = await leg(b, h);
      Object.keys(Q).filter(k => typeof Q[k] === 'number').forEach(k => { Q[k] = String(Q[k]); });

      const res = calculate(S, Q);
      if (!res.r) throw new MapsError('Não foi possível calcular o valor. Fale conosco pelo WhatsApp.', 422);
      const price = res.r.price;
      db.saveSimulation(lead.id, { pickup: pick, delivery: del, pickupLat: a.lat, pickupLon: a.lon, deliveryLat: b.lat, deliveryLon: b.lon, mode, desiredDate: desired, noDate, km: res.r.km.total, price });
      return { price, mode, phone: String(S.providerPhone || '').replace(/\D/g, '') };
    }
  };
}
