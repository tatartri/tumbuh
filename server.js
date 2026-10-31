/**
 * ============================================================================
 * SERVER UTAMA APLIKASI TUMBUH (server.js)
 * Backend REST API Node.js & Express terintegrasi Database MySQL
 * Melayani antarmuka pengguna ramah anak dan dashboard area /admin
 * ============================================================================
 */

require('dotenv').config();
const os = require('os');
const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { testConnection } = require('./src/config/db');

// Inisialisasi Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Keamanan & Parsing
// Izinkan semua origin (untuk akses dari HP/teman di LAN)
app.use(cors({
  origin: (origin, callback) => {
    // Izinkan semua origin termasuk mobile browser yang tidak kirim Origin header
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors()); // Tangani preflight OPTIONS untuk semua rute
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());


// Logging dengan IP address (berguna untuk debug akses dari HP/LAN)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    console.log(`[API ${req.method}] ${req.path} | dari: ${ip}`);
  }
  next();
});


// ----------------------------------------------------------------------------
// REGISTRASI RUTE REST API
// ----------------------------------------------------------------------------
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/focus', require('./src/routes/focus'));
app.use('/api/reflections', require('./src/routes/reflections'));
app.use('/api/plant', require('./src/routes/plant'));
app.use('/api/contents', require('./src/routes/contents'));
app.use('/api/admin', require('./src/routes/admin'));

// Endpoint Uji Kesehatan Server
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'TUMBUH Backend API',
    time: new Date().toISOString()
  });
});

// ----------------------------------------------------------------------------
// MELAYANI ASSET STATIS FRONTEND & AREA /admin
// ----------------------------------------------------------------------------
const publicDir = path.join(__dirname, 'public');

// Layani aset statis dari direktori public
app.use(express.static(publicDir));

// Rute khusus untuk area /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'index.html'));
});

// Halaman panduan bergabung ke TUMBUH (untuk teman / akses mobile)
app.get('/connect', (req, res) => {
  res.sendFile(path.join(publicDir, 'connect.html'));
});

// Fallback untuk SPA Halaman Pengguna Utama
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Handler 404 untuk rute API yang tidak ditemukan
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler Terpusat
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal pada server aplikasi TUMBUH.'
  });
});

// Jalankan Server setelah menguji koneksi MySQL
// Dapatkan IP jaringan lokal (LAN) secara otomatis
function getLanIP() {
  const interfaces = os.networkInterfaces();
  // Prioritaskan Wi-Fi utama (en0 pada macOS)
  if (interfaces['en0']) {
    const en0Ipv4 = interfaces['en0'].find(i => i.family === 'IPv4' && !i.internal);
    if (en0Ipv4) return en0Ipv4.address;
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function startServer() {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('[Peringatan] Server tetap dijalankan, namun koneksi MySQL belum berhasil. Pastikan service MySQL aktif pada port yang sesuai.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    const lanIP = getLanIP();
    console.log('====================================================');
    console.log(`🌱 TUMBUH Server aktif berjalan!`);
    console.log(`💻 Lokal (kamu sendiri):  http://localhost:${PORT}`);
    console.log(`📱 Jaringan LAN (teman):  http://${lanIP}:${PORT}`);
    console.log(`👑 Area Admin (lokal):    http://localhost:${PORT}/admin`);
    console.log(`👑 Area Admin (LAN):      http://${lanIP}:${PORT}/admin`);
    console.log('====================================================');
    console.log(`🔗 Bagikan link ini ke teman di WiFi yang sama:`);
    console.log(`   http://${lanIP}:${PORT}`);
    console.log('====================================================');
  });
}

startServer();
