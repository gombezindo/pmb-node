import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';

test('Login, CRUD, validasi, pencarian, dan persistensi database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pmb-test-'));
  const config = { dbPath: join(dir, 'test.sqlite'), password: 'password-test-123' };
  let instance = createApp(config), server = instance.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let base = `http://127.0.0.1:${server.address().port}`, cookie = '';
  async function req(path, method = 'GET', body, withHeader = true) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(withHeader ? { 'X-PMB-Request': '1' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  const student = { nama: 'Siti Aminah', tempat_lahir: 'Jakarta', tanggal_lahir: '2006-03-12', jenis_kelamin: 'Perempuan', email: 'siti@example.com', telepon: '081234567890', alamat: 'Jl. Pendidikan 10', asal_sekolah: 'SMA Negeri 1', program_studi: 'Informatika', status: 'Menunggu' };
  async function stop() { await new Promise(resolve => server.close(resolve)); instance.close(); }
  try {
    assert.equal((await req('/health')).status, 200);
    assert.equal((await req('/api/students')).status, 401);
    assert.equal((await req('/api/login', 'POST', { username: 'admin', password: config.password }, false)).status, 403);
    assert.equal((await req('/api/login', 'POST', { username: 'admin', password: 'wrong' })).status, 401);
    const login = await req('/api/login', 'POST', { username: 'admin', password: config.password });
    assert.equal(login.status, 200); assert.match(login.cookie, /HttpOnly/); cookie = login.cookie.split(';')[0];
    const created = await req('/api/students', 'POST', student); assert.equal(created.status, 201); const id = created.data.id;
    assert.equal((await req('/api/students', 'POST', student)).status, 409);
    for (const patch of [{ tanggal_lahir: '2006-02-30' }, { tanggal_lahir: '2999-01-01' }, { email: 'bad' }, { status: 'invalid' }, { nama: '' }]) assert.equal((await req('/api/students', 'POST', { ...student, ...patch })).status, 400);
    assert.equal((await req('/api/students/' + id)).data.nama, student.nama);
    assert.equal((await req('/api/students', 'POST', student, false)).status, 403);
    assert.equal((await req('/api/students/' + id, 'PUT', { ...student, status: 'Diterima' })).status, 200);
    assert.equal((await req('/api/students?q=Siti&status=Diterima')).data.total, 1);
    assert.equal((await req('/api/students?q=TidakAda')).data.total, 0);
    assert.equal((await req('/api/students?q=%27%20OR%201=1--')).data.total, 0);
    assert.equal((await req('/api/students/99999', 'PUT', student)).status, 404);
    await stop(); instance = createApp(config); server = instance.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await req('/api/students')).status, 401);
    cookie = (await req('/api/login', 'POST', { username: 'admin', password: config.password })).cookie.split(';')[0];
    assert.equal((await req('/api/students/' + id)).data.status, 'Diterima');
    assert.equal((await req('/api/students/' + id, 'DELETE')).status, 200);
    assert.equal((await req('/api/students/' + id)).status, 404);
    assert.equal((await req('/api/students')).data.total, 0);
    assert.equal((await req('/api/logout', 'POST')).status, 200);
    assert.equal((await req('/api/students')).status, 401);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
