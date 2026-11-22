import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'frete_session';
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;

const digest = s => createHash('sha256').update(String(s)).digest();

/** Sessões em memória (um único usuário). Reiniciar o servidor encerra os logins. */
export function createAuth({ password, sessionDays }){
  const sessions = new Map();           // token -> expira em (ms)
  const fails = new Map();              // ip -> { count, until }
  const ttl = sessionDays * 86400000;
  const expected = digest(password);

  const parseCookies = header => Object.fromEntries(String(header || '').split(';').map(c => {
    const i = c.indexOf('='); return i < 0 ? [] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }).filter(p => p.length));

  function sweep(){
    const now = Date.now();
    for (const [t, exp] of sessions) if (exp <= now) sessions.delete(t);
    for (const [ip, f] of fails) if (f.until && f.until <= now) fails.delete(ip);
  }

  return {
    COOKIE,
    isLocked(ip){ const f = fails.get(ip); return !!(f && f.until > Date.now()); },
    check(pw){ return timingSafeEqual(digest(pw), expected); },
    fail(ip){
      const f = fails.get(ip) || { count: 0, until: 0 };
      if (f.until && f.until <= Date.now()) { f.count = 0; f.until = 0; }
      f.count++;
      if (f.count >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
      fails.set(ip, f);
    },
    clearFails(ip){ fails.delete(ip); },
    create(){ sweep(); const t = randomBytes(32).toString('hex'); sessions.set(t, Date.now() + ttl); return t; },
    destroy(token){ sessions.delete(token); },
    tokenFrom(req){ return parseCookies(req.headers.cookie)[COOKIE] || ''; },
    valid(token){
      const exp = sessions.get(token);
      if (!exp) return false;
      if (exp <= Date.now()) { sessions.delete(token); return false; }
      return true;
    },
    cookie(token, { secure }){
      const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(ttl / 1000)}`];
      if (secure) parts.push('Secure');
      return parts.join('; ');
    },
    clearCookie({ secure }){
      return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
    }
  };
}
