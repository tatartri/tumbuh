/**
 * ============================================================================
 * ROUTE: PROGRES KEBUN PERTUMBUHAN (/api/plant)
 * Menampilkan status level tanaman, total sesi, dan interaksi ceria kebun
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// ----------------------------------------------------------------------------
// GET /api/plant/progress
// Mengambil status kebun dan level tanaman milik pengguna
// ----------------------------------------------------------------------------
router.get('/progress', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT total_sesi, total_durasi, level_tanaman, updated_at FROM plant_progress WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );

    let progress = { total_sesi: 0, total_durasi: 0, level_tanaman: 1 };
    if (rows.length > 0) {
      progress = rows[0];
    } else {
      // Inisialisasi jika belum ada
      await pool.execute(
        'INSERT IGNORE INTO plant_progress (user_id, total_sesi, total_durasi, level_tanaman) VALUES (?, 0, 0, 1)',
        [req.user.id]
      );
    }

    return res.json({
      success: true,
      progress
    });
  } catch (error) {
    console.error('[Plant Progress Error]:', error);
    return res.status(500).json({ success: false, message: 'Gagal memuat status kebun pertumbuhan.' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/plant/water
// Aksi interaktif menyiram tanaman
// ----------------------------------------------------------------------------
router.post('/water', requireAuth, (req, res) => {
  const responses = [
    'Slurpp! Segar sekali airnya! Terima kasih sudah merawatku! 💧🌱',
    'Wah, daun-daunku jadi berkilau terkena air sejuk! ✨',
    'Aku makin berenergi! Jangan lupa kamu juga minum air ya! 🥤',
    'Segar! Semangat belajarmu membuatku tumbuh subur! 🌿'
  ];
  const message = responses[Math.floor(Math.random() * responses.length)];
  return res.json({
    success: true,
    message
  });
});

module.exports = router;
