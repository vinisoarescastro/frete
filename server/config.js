import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Configuração lida das variáveis de ambiente. */
const bool = v => ['1', 'true', 'yes'].includes(String(v ?? '').toLowerCase());

export function loadConfig(env = process.env){
  const password = env.APP_PASSWORD || '';
  if (!password) throw new Error('Defina APP_PASSWORD (veja .env.example).');
  return {
    password,
    dbPath: env.DB_PATH || join(ROOT, 'data', 'frete.db'),
    port: Number(env.PORT) || 3000,
    host: env.HOST || '127.0.0.1',
    trustProxy: bool(env.TRUST_PROXY),
    sessionDays: Number(env.SESSION_DAYS) || 7,
    maps: { geoapifyKey: env.GEOAPIFY_KEY || '', contact: env.NOMINATIM_CONTACT || '' }
  };
}
