# 🌱 TUMBUH - Platform Belajar & Kebiasaan Fokus untuk Anak

**TUMBUH** adalah aplikasi web interaktif yang dirancang khusus untuk membantu anak-anak membangun kebiasaan belajar dan konsentrasi melalui gamifikasi kebun virtual, timer fokus ramah anak, musik relaksasi, jeda aktif, dan jurnal refleksi.

Aplikasi ini dilengkapi dengan backend berbasis **Node.js + Express** dan basis data relasional **MySQL**, serta panel **Administrator (`/admin`)** khusus untuk mengelola pengguna, memantau sesi fokus, dan menambahkan tips belajar.

---

## 🔐 Akun Default untuk Pengujian

Aplikasi telah disiapkan dengan 2 akun default di database `tumbuh_db`:

| Peran (Role) | Email | Kata Sandi (Password) | Akses |
|---|---|---|---|
| **Administrator** | `admin@tumbuh.id` | **`Admin123!`** | Dashboard Admin (`/admin`) & API Admin |
| **Anak / Pengguna Demo** | `anak@tumbuh.id` | **`Tumbuh123!`** | Halaman Utama (`/`) & 7 Fitur Pengguna |

> 💡 **Tip Cepat:** Pada modal login aplikasi dan dashboard admin, terdapat tombol **"Isi Demo Admin"** dan **"Isi Demo Anak"** untuk mengisi email dan kata sandi secara otomatis dengan satu klik!

---

## 🛠️ Teknologi yang Digunakan

### Frontend
- **HTML5 & CSS3 Vanilla**: Desain pastel ramah anak (*sage green* `#477B62`, mint pastel `#DCEFE0`, krem latar `#F3F8EE`).
- **JavaScript (ES6+)**: Logika interaktif, timer fokus, Web Audio API synth untuk musik latar fokus, grafik evaluasi Canvas, dan komunikasi REST API.
- **Responsif**: Sidebar hijau di desktop dan navigasi bawah (*bottom bar*) di layar ponsel/tablet.

### Backend & Basis Data
- **Node.js & Express.js**: REST API server dengan arsitektur modular (`src/routes`, `src/middleware`, `src/config`).
- **MySQL (via mysql2/promise)**: Basis data relasional dengan integritas relasi (*Foreign Keys*), transaksi aman (*ACID*), dan pencegahan sesi duplikat.
- **Keamanan**: Hash password dengan `bcryptjs` (salt rounds 10), token stateless `jsonwebtoken` (JWT), proteksi CORS, dan otorisasi *role-based access control* di sisi server.

---

## 📁 Struktur Direktori

```text
tiara_media_bk/
├── backup_pre_backend/     # Cadangan lengkap kode awal sebelum integrasi backend
├── public/                 # File statis yang dilayani Express
│   ├── admin/              # Panel Administrator (/admin)
│   │   ├── index.html
│   │   ├── admin.css
│   │   └── admin.js
│   ├── index.html          # Aplikasi utama anak
│   ├── style.css           # Styling tema pastel & responsif
│   └── script.js           # Client logic & sinkronisasi REST API
├── src/                    # Kode Backend Node.js
│   ├── config/
│   │   └── db.js           # MySQL connection pool
│   ├── middleware/
│   │   ├── auth.js         # JWT verification & active status check
│   │   └── role.js         # requireAdmin server-side guard
│   └── routes/
│       ├── auth.js         # Register, Login, Me, Update Profile
│       ├── focus.js        # Timer start, complete anti-fraud, session log
│       ├── reflections.js  # Jurnal refleksi & analisis distraksi
│       ├── plant.js        # Status pertumbuhan kebun & siram tanaman
│       ├── contents.js     # Panduan & tips belajar publik
│       └── admin.js        # Statistik agregat, CRUD konten & kelola user
├── .env                    # Variabel lingkungan lokal (rahasia)
├── .env.example            # Contoh template variabel lingkungan
├── package.json            # Dependensi npm & script jalankan
├── schema.sql              # Skema DDL MySQL & data awal (seeds)
├── server.js               # Entry point Express server
└── README.md               # Dokumentasi proyek
```

---

## 📋 Prasyarat Sistem

1. **Node.js**: Versi `>= 18.0.0`
2. **NPM**: Versi `>= 9.0.0`
3. **MySQL**: Versi `>= 8.0` atau **MAMP / XAMPP**

---

## 🚀 Panduan Instalasi & Menjalankan Proyek

### 1. Pasang Dependensi
Buka terminal di direktori proyek dan jalankan:
```bash
npm install
```

### 2. Siapkan Basis Data MySQL
Pastikan server MySQL Anda berjalan (misal via MAMP / XAMPP / MySQL Service).
Buat database dan impor skema `schema.sql`:

```bash
# Melalui terminal MySQL:
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS tumbuh_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p tumbuh_db < schema.sql

# Atau jika menggunakan MAMP (port default 8889):
/Applications/MAMP/Library/bin/mysql -u root -proot -P 8889 -h 127.0.0.1 tumbuh_db < schema.sql
```

### 3. Konfigurasi Lingkungan (`.env`)
Salin file `.env.example` menjadi `.env` lalu sesuaikan konfigurasi database:
```bash
cp .env.example .env
```

Isi file `.env`:
```env
PORT=3000
NODE_ENV=development

DB_HOST=127.0.0.1
DB_PORT=8889
DB_USER=root
DB_PASSWORD=root
DB_NAME=tumbuh_db

JWT_SECRET=tumbuh_super_secret_jwt_key_2026_anak_fokus_indonesia
JWT_EXPIRES_IN=7d
```

### 4. Jalankan Server
Jalankan server Node.js:
```bash
# Mode Produksi / Standar:
npm start

# Mode Pengembangan (Hot Reload dengan nodemon jika ada):
npm run dev
```

Buka browser Anda di:
- **Aplikasi Pengguna (Anak):** [http://localhost:3000/](http://localhost:3000/)
- **Panel Administrator:** [http://localhost:3000/admin/](http://localhost:3000/admin/)
- **Pemeriksaan Status API:** [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 📡 Daftar Endpoint REST API

### Autentikasi (`/api/auth`)
- `POST /api/auth/register` : Mendaftarkan akun anak baru.
- `POST /api/auth/login` : Masuk dan mendapatkan token JWT.
- `GET /api/auth/me` : Mengambil informasi profil pengguna yang sedang login.
- `PUT /api/auth/profile` : Memperbarui nama atau avatar anak.
- `POST /api/auth/logout` : Keluar dari sesi.

### Sesi Fokus (`/api/focus`)
- `POST /api/focus/start` : Mencatat awal sesi timer belajar.
- `POST /api/focus/complete` : Memverifikasi dan menyelesaikan sesi (anti-fraud durasi nyata).
- `POST /api/focus/cancel` : Membatalkan sesi yang berjalan.
- `GET /api/focus/history` : Riwayat sesi fokus pengguna.

### Refleksi (`/api/reflections`)
- `POST /api/reflections` : Menyimpan jurnal perasaan & evaluasi belajar.
- `GET /api/reflections` : Mengambil daftar refleksi pengguna.
- `GET /api/reflections/summary` : Ringkasan pemicu distraksi terbanyak.
- `DELETE /api/reflections/:id` : Menghapus catatan refleksi milik sendiri.

### Kebun Pertumbuhan (`/api/plant`)
- `GET /api/plant/status` : Mengambil data level tanaman, total sesi, dan total durasi.
- `POST /api/plant/water` : Interaksi menyiram tanaman di kebun virtual.

### Konten Pembelajaran (`/api/contents`)
- `GET /api/contents` : Mengambil tips dan panduan belajar aktif untuk anak.

### Area Administrator (`/api/admin`) *(Memerlukan Role `admin`)*
- `GET /api/admin/stats` : Ringkasan statistik (total user, sesi aktif, durasi, total refleksi).
- `GET /api/admin/users` : Daftar seluruh pengguna terdaftar.
- `PATCH /api/admin/users/:id/status` : Mengaktifkan/menonaktifkan akun pengguna.
- `GET /api/admin/sessions` : Log sesi fokus seluruh pengguna.
- `GET /api/admin/reflections` : Log refleksi belajar seluruh pengguna.
- `POST /api/admin/contents` : Menambah tips atau panduan belajar baru.
- `DELETE /api/admin/contents/:id` : Menghapus tips belajar.
