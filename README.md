# Admisi — CRUD Pendaftaran Mahasiswa Baru

Aplikasi administrasi PMB berbahasa Indonesia: Node.js 24, Express 5, SQLite, dan HTML/CSS/JavaScript tanpa proses build frontend. Cocok untuk pengelolaan sederhana oleh petugas kampus. Form dan seluruh data hanya dapat diakses setelah login admin; belum mencakup pendaftaran mandiri publik, upload berkas, atau multi-role.

## Fitur

- Tambah, lihat detail, edit, hapus (dengan konfirmasi).
- Nama, tempat dan tanggal lahir, jenis kelamin, email, telepon, alamat, asal sekolah, program studi, dan status.
- Email unik, validasi server, pencarian, filter status, pagination 10 data, ringkasan jumlah pendaftar.
- Login admin dari environment, cookie HttpOnly/SameSite, pembatasan percobaan login, header keamanan dan pemeriksaan header untuk operasi perubahan data.
- SQLite persisten di volume Docker; container berjalan sebagai pengguna non-root.
- Tampilan responsif tanpa CDN atau font eksternal.

## Mulai dengan Docker di Linux WSL

Jalankan perintah berikut di terminal distro WSL (Bash). Aplikasi berjalan dalam container Linux. Docker CLI dan Compose sudah ditemukan di lingkungan ini; pemeriksaan terakhir gagal mengakses daemon karena user `msi` belum menjadi anggota grup `docker`, sementara socket dimiliki `root:docker`.

1. Perbaiki akses Docker untuk user WSL Anda:

   ```bash
   sudo usermod -aG docker "$USER"
   newgrp docker
   docker info
   docker compose version
   ```

   Perintah `sudo` mungkin meminta password user Linux. Grup `docker` memberikan hak setara root; gunakan hanya untuk user tepercaya. `newgrp` membuka shell dengan grup baru; terminal lain perlu dibuka ulang atau sesi login diperbarui. Jangan gunakan `chmod 666` pada socket. Jika daemon ternyata tidak aktif dan Docker Engine dipasang langsung di distro WSL dengan systemd, jalankan `sudo systemctl start docker`. Jika memakai Docker Desktop sebagai daemon, jalankan Desktop dan aktifkan integrasi distro WSL-nya.

2. Masuk ke proyek:

   ```bash
   cd /mnt/c/Users/msi/Documents/ChatGPT/myapps_project/pmb-node
   # Salin hanya jika .env belum ada agar konfigurasi lama tidak tertimpa.
   test -f .env || cp .env.example .env
   nano .env
   ```

3. Isi `ADMIN_PASSWORD` dengan password unik minimal 12 karakter. `ADMIN_USERNAME` default `admin`. Simpan di nano dengan Ctrl+O, Enter, lalu Ctrl+X. Jangan membagikan `.env`. Jika password mengandung `$` atau `#`, bungkus nilainya dengan petik tunggal di `.env` agar diperlakukan literal.
4. Jalankan:

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs --tail=50 app
   curl http://localhost:3000/health
   ```

5. Healthcheck seharusnya mengembalikan `{"status":"ok"}`. Buka **http://localhost:3000** di browser, lalu login memakai username dan password dari `.env`. Browser Windows biasanya dapat mengakses localhost WSL; proses aplikasi tetap berjalan di Linux. Tidak ada data contoh atau password bawaan.

Source saat ini berada di mount `/mnt/c`, tetapi container dan proses Node berjalan di Linux. Anda juga dapat memindahkan source ke filesystem Linux, misalnya `~/projects/pmb-node`, sebelum deployment pertama untuk performa akses file yang lebih baik. Untuk Docker, tidak perlu memasang Node.js di distro WSL: image sudah menyediakan Node.js 24.

Jika port 3000 sudah digunakan, ubah `HOST_PORT=3001` di `.env`, jalankan ulang `docker compose up -d`, lalu buka http://localhost:3001. Variabel `PORT` hanya untuk menjalankan Node langsung; port internal Docker tetap 3000.

## Deploy ke VPS Linux

1. Siapkan VPS, akses SSH, domain (bila akan dibuka melalui internet), dan instal [Docker Engine](https://docs.docker.com/engine/install/) beserta [Compose plugin](https://docs.docker.com/compose/install/). Pastikan `docker info` berhasil.
2. Salin folder proyek ke server tanpa `node_modules`, `.env`, dan database lokal. Contoh dari terminal yang menyediakan `scp`:

   ```bash
   scp -r pmb-node user@IP_SERVER:~/
   ssh user@IP_SERVER
   cd ~/pmb-node
   cp .env.example .env
   nano .env
   ```

3. Isi username/password lalu jalankan `docker compose up -d --build`.
4. Untuk penggunaan pribadi tanpa domain, gunakan tunnel dari komputer Anda:

   ```bash
   ssh -L 3000:127.0.0.1:3000 user@IP_SERVER
   ```

   Buka http://localhost:3000 selama SSH aktif. Biarkan `COOKIE_SECURE=false` untuk akses HTTP melalui tunnel ini.
5. Untuk domain publik, arahkan DNS A domain ke IP VPS, instal Caddy di host sesuai [panduan Caddy](https://caddyserver.com/docs/install), dan buat `/etc/caddy/Caddyfile`:

   ```caddyfile
   pmb.domain-anda.id {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   Ganti domain contoh. Buka port 80/443 di firewall/cloud firewall, pertahankan akses SSH, dan reload Caddy (`sudo systemctl reload caddy`). Caddy harus berjalan di host VPS untuk contoh konfigurasi ini.
6. Ubah `COOKIE_SECURE=true` di `.env`, jalankan `docker compose up -d`, dan akses `https://pmb.domain-anda.id`. Cookie secure membutuhkan HTTPS; login lewat HTTP biasa tidak akan bertahan.

Port aplikasi sengaja hanya terikat ke `127.0.0.1` agar diakses lewat tunnel atau reverse proxy. Jangan membuka port 3000 publik untuk pola deployment ini. Pembatasan percobaan login menggunakan alamat koneksi langsung; di belakang Caddy batasnya berlaku bersama untuk semua pengguna proxy. Aplikasi ini dirancang untuk satu admin dan satu instance.

## Operasional

```bash
# Lihat log
 docker compose logs -f --tail=100 app
# Hentikan tanpa menghapus database
 docker compose down
# Jalankan lagi
 docker compose up -d
# Setelah memperbarui source / lockfile
 docker compose up -d --build
```

Database berada di `/app/data/pmb.sqlite` di volume `pmb_data` (nama fisik diberi prefix nama proyek Compose). Gunakan folder/nama proyek Compose yang sama ketika memperbarui aplikasi. **Jangan menjalankan `docker compose down -v`** kecuali memang ingin menghapus database. Mengubah nama proyek dapat membuat volume baru yang kosong.

Session login berada di memori, berlaku 8 jam, dan dihapus ketika server restart. Data mahasiswa tetap ada. Mengganti password dan membuat ulang container akan mengakhiri semua sesi.

## Backup dan restore (Linux / WSL)

Backup konsisten dengan menghentikan aplikasi sebentar. Perintah berikut menyalin direktori database beserta file WAL/SHM bila ada:

```bash
mkdir -p backups
# Gunakan nama folder backup baru setiap kali.
docker compose stop app
docker compose cp app:/app/data ./backups/snapshot-01
docker compose start app
```

Pastikan hasil salinan berisi `pmb.sqlite`. Simpan backup di lokasi terpisah dengan akses terbatas karena memuat data pribadi mahasiswa.

Untuk restore, **data aktif akan diganti**. Ambil backup data aktif terlebih dahulu, pastikan `backups/snapshot-01/pmb.sqlite` tersedia, lalu:

```bash
docker compose stop app
docker compose run --rm --no-deps --user root --entrypoint sh app -c 'rm -f /app/data/pmb.sqlite /app/data/pmb.sqlite-wal /app/data/pmb.sqlite-shm'
docker compose cp ./backups/snapshot-01/. app:/app/data/
docker compose run --rm --no-deps --user root --entrypoint sh app -c 'chown -R node:node /app/data'
docker compose start app
docker compose logs --tail=50 app
```

## Menjalankan tanpa Docker

Instal **Node.js 24.x** (Node 20 tidak mendukung modul SQLite yang digunakan di proyek ini).

```bash
cp .env.example .env
# Isi ADMIN_PASSWORD terlebih dahulu.
npm ci
npm start
```

Pada PowerShell gunakan `Copy-Item` untuk menyalin file. Untuk pengembangan gunakan `npm run dev`. Database default disimpan dalam `data/pmb.sqlite` dan dapat diubah melalui `DB_PATH`. Modul `node:sqlite` pada sebagian versi Node 24 mengeluarkan peringatan eksperimental; warning tersebut tidak berarti aplikasi gagal berjalan.

## Pengujian

```bash
npm ci
npm test
```

Tes integrasi menggunakan database sementara, mencakup login, proteksi API, CRUD, email duplikat, validasi tanggal/form, filter/pencarian, persistensi sesudah restart, dan logout. Data operasional tidak digunakan oleh tes.

## Struktur dan penyesuaian

- `server.js`: startup dan shutdown.
- `app.js`: konfigurasi keamanan, login, validasi, endpoint REST, dan database.
- `public/`: antarmuka web.
- `tests/app.test.js`: tes integrasi.
- `Dockerfile`, `compose.yaml`, `.env.example`: deployment.

Daftar program studi ada pada konstanta `programs` di `app.js`; frontend mengambilnya dari server. Endpoint utama: `POST /api/login`, `GET /api/session`, `POST /api/logout`, `GET/POST /api/students`, `GET/PUT/DELETE /api/students/:id`. Operasi POST/PUT/DELETE membutuhkan cookie login (kecuali login) dan header `X-PMB-Request: 1`. `GET /health` tersedia tanpa login untuk healthcheck.

## Troubleshooting

- **Permission denied pada docker.sock:** jalankan Docker Desktop/aktifkan WSL integration, atau atur akses Docker sesuai instalasi Linux Anda. Jangan menjadikan socket dapat ditulis semua pengguna dengan `chmod 666`.
- **ADMIN_PASSWORD wajib diisi:** isi `.env` dengan minimal 12 karakter, lalu jalankan ulang Compose.
- **Login berulang:** jika mengakses HTTP lokal, gunakan `COOKIE_SECURE=false`; untuk domain HTTPS gunakan `true`.
- **Email sudah terdaftar:** setiap calon mahasiswa memakai email unik; edit data yang ada.
- **Database terlihat kosong setelah pindah folder:** periksa proyek Compose dan volume lama sebelum membuat/menghapus data.
- **Port sudah digunakan:** ganti `HOST_PORT` dan buat ulang container.

Referensi: [Node.js SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/).
