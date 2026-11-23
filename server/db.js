import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Banco SQLite (arquivo único, sem servidor). Guarda as configurações, o rascunho do orçamento
 * (para continuar em outro aparelho) e o histórico de orçamentos.
 */
export function openDb(path){
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      client TEXT NOT NULL DEFAULT '',
      pickup TEXT NOT NULL DEFAULT '',
      delivery TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS quotes_updated ON quotes (updated_at DESC);
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      token TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      pickup TEXT NOT NULL DEFAULT '',
      delivery TEXT NOT NULL DEFAULT '',
      pickup_lat REAL, pickup_lon REAL, delivery_lat REAL, delivery_lon REAL,
      mode TEXT NOT NULL DEFAULT '',
      desired_date TEXT NOT NULL DEFAULT '',
      no_date INTEGER NOT NULL DEFAULT 0,
      km REAL,
      price REAL,
      simulations INTEGER NOT NULL DEFAULT 0,
      simulated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at DESC);
  `);

  const q = {
    getKv: db.prepare('SELECT value FROM kv WHERE key = ?'),
    setKv: db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'),
    list: db.prepare('SELECT id, created_at, updated_at, client, pickup, delivery, price FROM quotes ORDER BY updated_at DESC LIMIT ?'),
    get: db.prepare('SELECT id, data FROM quotes WHERE id = ?'),
    insert: db.prepare('INSERT INTO quotes (created_at, updated_at, client, pickup, delivery, price, data) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    update: db.prepare('UPDATE quotes SET updated_at = ?, client = ?, pickup = ?, delivery = ?, price = ?, data = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM quotes WHERE id = ?'),
    leadInsert: db.prepare('INSERT INTO leads (created_at, token, name, phone) VALUES (?, ?, ?, ?)'),
    leadByToken: db.prepare('SELECT * FROM leads WHERE token = ?'),
    leadSim: db.prepare('UPDATE leads SET pickup=?, delivery=?, pickup_lat=?, pickup_lon=?, delivery_lat=?, delivery_lon=?, mode=?, desired_date=?, no_date=?, km=?, price=?, simulations = simulations + 1, simulated_at=? WHERE id=?'),
    leadList: db.prepare('SELECT id, created_at, name, phone, pickup, delivery, mode, desired_date, no_date, km, price, simulations, simulated_at FROM leads ORDER BY created_at DESC LIMIT ?'),
    leadGet: db.prepare('SELECT id, created_at, name, phone, pickup, delivery, pickup_lat, pickup_lon, delivery_lat, delivery_lon, mode, desired_date, no_date, km, price, simulations, simulated_at FROM leads WHERE id = ?'),
    leadDel: db.prepare('DELETE FROM leads WHERE id = ?')
  };

  return {
    getKv(key){ const r = q.getKv.get(key); return r ? JSON.parse(r.value) : null; },
    setKv(key, value){ q.setKv.run(key, JSON.stringify(value), Date.now()); },
    listQuotes(limit = 30){ return q.list.all(Math.min(Math.max(Number(limit) || 30, 1), 100)); },
    getQuote(id){ const r = q.get.get(id); return r ? { id: r.id, data: JSON.parse(r.data) } : null; },
    /** Cria (sem id) ou atualiza (com id existente) um orçamento. Retorna o id. */
    saveQuote({ id, client, pickup, delivery, price, data }){
      const now = Date.now(), json = JSON.stringify(data);
      if (id && q.get.get(id)) { q.update.run(now, client, pickup, delivery, price, json, id); return Number(id); }
      return Number(q.insert.run(now, now, client, pickup, delivery, price, json).lastInsertRowid);
    },
    deleteQuote(id){ return q.remove.run(id).changes > 0; },
    // Simulações de clientes (página pública)
    startLead({ token, name, phone }){ return Number(q.leadInsert.run(Date.now(), token, name, phone).lastInsertRowid); },
    leadByToken(token){ return q.leadByToken.get(String(token || '')) || null; },
    saveSimulation(id, v){
      q.leadSim.run(v.pickup, v.delivery, v.pickupLat, v.pickupLon, v.deliveryLat, v.deliveryLon, v.mode, v.desiredDate, v.noDate ? 1 : 0, v.km, v.price, Date.now(), id);
    },
    listLeads(limit = 100){ return q.leadList.all(Math.min(Math.max(Number(limit) || 100, 1), 500)); },
    getLead(id){ return q.leadGet.get(id) || null; },
    deleteLead(id){ return q.leadDel.run(id).changes > 0; },
    close(){ db.close(); }
  };
}
