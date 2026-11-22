/** Configuração lida das variáveis de ambiente. */
const bool = v => ['1', 'true', 'yes'].includes(String(v ?? '').toLowerCase());

export function loadConfig(env = process.env){
  const password = env.APP_PASSWORD || '';
  if (!password) throw new Error('Defina APP_PASSWORD (veja .env.example).');
  return {
    password,
    port: Number(env.PORT) || 3000,
    host: env.HOST || '127.0.0.1',
    trustProxy: bool(env.TRUST_PROXY),
    sessionDays: Number(env.SESSION_DAYS) || 7,
    maps: {
      browserKey: env.GOOGLE_MAPS_BROWSER_KEY || '',
      serverKey: env.GOOGLE_MAPS_SERVER_KEY || '',
      mapId: env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'
    }
  };
}
