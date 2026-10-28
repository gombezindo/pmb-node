const $ = id => document.getElementById(id);
let page = 1, editing = null, sequence = 0, toastTimer;
const form = $('student-form');
async function api(path, options = {}) {
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', 'X-PMB-Request': '1', ...options.headers } });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') showLogin();
    throw new Error(data.error || 'Permintaan gagal.');
  }
  return data;
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function showLogin() { sequence++; $('login').hidden = false; $('dashboard').hidden = true; $('rows').replaceChildren(); $('detail-content').replaceChildren(); form.reset(); $('editor').close(); $('detail').close(); }
async function dashboard() {
  const session = await api('/session');
  $('programs').replaceChildren(...session.programs.map(value => new Option(value, value)));
  $('login').hidden = true; $('dashboard').hidden = false;
  await load();
}
async function load() {
  const current = ++sequence;
  try {
    const data = await api('/students?' + new URLSearchParams({ q: $('search').value, status: $('filter').value, page }));
    if (current !== sequence) return;
    if (!data.items.length && page > 1) { page--; return load(); }
    $('total').textContent = data.stats.reduce((n, s) => n + s.n, 0);
    $('waiting').textContent = data.stats.find(s => s.status === 'Menunggu')?.n || 0;
    $('accepted').textContent = data.stats.find(s => s.status === 'Diterima')?.n || 0;
    $('rows').replaceChildren();
    for (const item of data.items) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      const strong = document.createElement('strong'); strong.textContent = item.nama;
      const sub = document.createElement('small'); sub.textContent = `PMB-${String(item.id).padStart(5, '0')} · ${item.email}`;
      name.append(strong, sub); tr.append(name);
      for (const text of [item.program_studi, new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
      const status = document.createElement('td'), badge = document.createElement('span');
      badge.className = 'badge ' + ({ Diterima: 'accepted', Ditolak: 'rejected' }[item.status] || ''); badge.textContent = item.status; status.append(badge); tr.append(status);
      const actions = document.createElement('td'), group = document.createElement('div'); group.className = 'actions';
      for (const [label, action] of [['Detail', () => detail(item.id)], ['Edit', () => edit(item.id)], ['Hapus', () => remove(item)]]) {
        const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-label', label + ' ' + item.nama); if (label === 'Hapus') button.className = 'danger'; button.onclick = action; group.append(button);
      }
      actions.append(group); tr.append(actions); $('rows').append(tr);
    }
    $('empty').hidden = data.items.length > 0;
    $('count').textContent = `${data.total} pendaftar · Halaman ${page} dari ${Math.max(1, Math.ceil(data.total / 10))}`;
    $('prev').disabled = page <= 1; $('next').disabled = page * 10 >= data.total;
  } catch (e) { toast(e.message); }
}
function editor(item = null) {
  editing = item?.id || null; form.reset();
  if (item) for (const field of form.elements) if (field.name && item[field.name] !== undefined) field.value = item[field.name];
  $('form-title').textContent = item ? 'Edit pendaftaran' : 'Tambah pendaftar'; $('form-error').textContent = '';
  $('editor').showModal(); form.elements.nama.focus();
}
async function edit(id) { try { editor(await api('/students/' + id)); } catch (e) { toast(e.message); } }
async function detail(id) {
  try {
    const item = await api('/students/' + id);
    const labels = { nama: 'Nama lengkap', tempat_lahir: 'Tempat lahir', tanggal_lahir: 'Tanggal lahir', jenis_kelamin: 'Jenis kelamin', email: 'Email', telepon: 'Telepon', alamat: 'Alamat', asal_sekolah: 'Asal sekolah', program_studi: 'Program studi', status: 'Status' };
    $('detail-content').replaceChildren();
    for (const [key, label] of Object.entries(labels)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = item[key]; $('detail-content').append(dt, dd); }
    $('detail').showModal();
  } catch (e) { toast(e.message); }
}
async function remove(item) {
  if (!confirm(`Hapus pendaftaran ${item.nama}? Data yang dihapus tidak dapat dikembalikan melalui aplikasi.`)) return;
  try { await api('/students/' + item.id, { method: 'DELETE' }); toast('Pendaftaran berhasil dihapus.'); await load(); } catch (e) { toast(e.message); }
}
$('login-form').onsubmit = async event => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; $('login-error').textContent = '';
  try { await api('/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); event.target.reset(); await dashboard(); } catch (e) { $('login-error').textContent = e.message; } finally { button.disabled = false; }
};
form.onsubmit = async event => {
  event.preventDefault(); $('save').disabled = true; $('form-error').textContent = '';
  try { await api('/students' + (editing ? '/' + editing : ''), { method: editing ? 'PUT' : 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); $('editor').close(); toast('Pendaftaran berhasil disimpan.'); await load(); } catch (e) { $('form-error').textContent = e.message; } finally { $('save').disabled = false; }
};
$('add').onclick = () => editor();
$('close').onclick = $('cancel').onclick = () => $('editor').close();
$('close-detail').onclick = () => $('detail').close();
$('logout').onclick = async () => { try { await api('/logout', { method: 'POST' }); showLogin(); } catch (e) { toast(e.message); } };
$('prev').onclick = () => { page--; load(); }; $('next').onclick = () => { page++; load(); };
let timer; $('search').oninput = () => { clearTimeout(timer); sequence++; timer = setTimeout(() => { page = 1; load(); }, 250); };
$('filter').onchange = () => { page = 1; load(); };
form.elements.tanggal_lahir.max = new Date().toLocaleDateString('en-CA');
dashboard().catch(() => showLogin());
