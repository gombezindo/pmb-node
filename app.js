import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const programs = ['Informatika', 'Sistem Informasi', 'Manajemen', 'Akuntansi', 'Teknik Sipil'];
export const statuses = ['Menunggu', 'Diterima', 'Ditolak'];
const fields = ['nama', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin', 'email', 'telepon', 'alamat', 'asal_sekolah', 'program_studi', 'status'];
function validate(body) {
  const data = {};
  const limits = [120, 100, 10, 20, 254, 20, 1000, 150, 100, 20];
  fields.forEach((field, i) => {
    if (typeof body?.[field] !== 'string' || !body[field].trim() || body[field].trim().length > limits[i]) throw new Error('Isi semua kolom dengan benar (panjang teks dibatasi).');
    data[field] = body[field].trim();
  });
  data.email = data.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Format email tidak valid.');
  if (!/^[+()0-9 .-]{8,20}$/.test(data.telepon)) throw new Error('Nomor telepon harus 8–20 karakter.');
  const date = new Date(data.tanggal_lahir);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.tanggal_lahir) || isNaN(date) || date.toISOString().slice(0,10) !== data.tanggal_lahir || date > new Date() || data.tanggal_lahir < '1900-01-01') throw new Error('Tanggal lahir tidak valid.');
  if (!['Laki-laki', 'Perempuan'].includes(data.jenis_kelamin) || !programs.includes(data.program_studi) || !statuses.includes(data.status)) throw new Error('Pilihan formulir tidak valid.');
  return data;
}
const digest = value => createHash('sha256').update(String(value ?? '')).digest();
export function createApp({ dbPath = 'data/pmb.sqlite', username = process.env.ADMIN_USERNAME || 'admin', password = process.env.ADMIN_PASSWORD, secure = process.env.COOKIE_SECURE === 'true' } = {}) {
  if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD wajib diisi minimal 12 karakter.');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL, tempat_lahir TEXT NOT NULL, tanggal_lahir TEXT NOT NULL,
      jenis_kelamin TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      telepon TEXT NOT NULL, alamat TEXT NOT NULL, asal_sekolah TEXT NOT NULL,
      program_studi TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );`);
  const app = express();
  const sessions = new Map();
  const cleanup = setInterval(() => { for (const [key, s] of sessions) if (s.expires < Date.now()) sessions.delete(key); }, 60000);
  cleanup.unref();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (req, res) => { db.prepare('SELECT 1').get(); res.json({ status: 'ok' }); });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && req.get('X-PMB-Request') !== '1') return res.status(403).json({ error: 'Permintaan tidak diizinkan.' });
    next();
  });
  app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Terlalu banyak percobaan. Coba lagi 15 menit.' } }), (req, res) => {
    const userOk = timingSafeEqual(digest(req.body?.username), digest(username));
    const passOk = timingSafeEqual(digest(req.body?.password), digest(password));
    if (!userOk || !passOk) return res.status(401).json({ error: 'Username atau password salah.' });
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + 8 * 3600000 });
    res.cookie('pmb_session', token, { httpOnly: true, secure, sameSite: 'strict', maxAge: 8 * 3600000, path: '/' }).json({ username });
  });
  app.use('/api', (req, res, next) => {
    const token = /(?:^|;\s*)pmb_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!sessions.has(token) || sessions.get(token).expires < Date.now()) return res.status(401).json({ error: 'Silakan login kembali.' });
    req.sessionToken = token;
    next();
  });
  app.get('/api/session', (req, res) => res.json({ username, programs, statuses }));
  app.post('/api/logout', (req, res) => { sessions.delete(req.sessionToken); res.clearCookie('pmb_session', { path: '/', secure, httpOnly: true, sameSite: 'strict' }).json({ ok: true }); });
  app.get('/api/students', (req, res) => {
    const q = String(req.query.q || '').slice(0, 100);
    const status = String(req.query.status || '');
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page) || 1));
    const where = `WHERE (nama LIKE ? OR email LIKE ? OR CAST(id AS TEXT) LIKE ?) AND (? = '' OR status = ?)`;
    const args = [`%${q}%`, `%${q}%`, `%${q}%`, status, status];
    const total = db.prepare(`SELECT COUNT(*) AS n FROM students ${where}`).get(...args).n;
    const items = db.prepare(`SELECT * FROM students ${where} ORDER BY id DESC LIMIT 10 OFFSET ?`).all(...args, (page - 1) * 10);
    const stats = db.prepare('SELECT status, COUNT(*) AS n FROM students GROUP BY status').all();
    res.json({ items, total, page, stats });
  });
  app.param('id', (req, res, next, value) => {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ error: 'ID tidak valid.' });
    next();
  });
  app.get('/api/students/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
    res.status(row ? 200 : 404).json(row || { error: 'Data tidak ditemukan.' });
  });
  function save(req, res, next) {
    let data;
    try { data = validate(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    try {
      if (req.params.id) {
        const result = db.prepare(`UPDATE students SET ${fields.map(f => f + '=?').join(',')} WHERE id=?`).run(...fields.map(f => data[f]), req.params.id);
        if (!result.changes) return res.status(404).json({ error: 'Data tidak ditemukan.' });
        res.json(db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id));
      } else {
        const result = db.prepare(`INSERT INTO students (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...fields.map(f => data[f]));
        res.status(201).json(db.prepare('SELECT * FROM students WHERE id=?').get(result.lastInsertRowid));
      }
    } catch (e) { if (String(e.message).includes('UNIQUE constraint')) return res.status(409).json({ error: 'Email sudah terdaftar.' }); next(e); }
  }
  app.post('/api/students', save);
  app.put('/api/students/:id', save);
  app.delete('/api/students/:id', (req, res) => {
    const result = db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);
    res.status(result.changes ? 200 : 404).json(result.changes ? { ok: true } : { error: 'Data tidak ditemukan.' });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
  app.use((err, req, res, next) => {
    const status = err.status === 400 || err.status === 413 ? err.status : 500;
    if (status === 500) console.error('Request failed:', err.code || err.name);
    res.status(status).json({ error: status === 500 ? 'Terjadi kesalahan server.' : 'Format atau ukuran permintaan tidak valid.' });
  });
  return { app, close: () => { clearInterval(cleanup); db.close(); } };
}
